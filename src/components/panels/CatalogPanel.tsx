"use client";

import { useState } from "react";
import { compareByCode, satisfies, stillNeededIds, type CurriculumObject } from "../../engine/index";
import { courseCode } from "../../planner/layout";
import { Button, inputClass, Panel, Select } from "../ui";
import type { PanelProps } from "./types";

// How many courses the list shows at first, and adds with each "Show
// more". A big school has thousands; drawing them all at once is slow
// and makes the page huge.
const PAGE_SIZE = 100;

// Objects not yet in the chart, with a button to add each one. Required
// ones not on the chart yet come first; the rest are grouped by subject
// (CMPSC, MATH, ...) in code order: CAS 100, CAS 100A, CAS 100B, CAS 101.
// Only the first PAGE_SIZE show until "Show more"; searching narrows it.
export function CatalogPanel({ state, view, dispatch }: PanelProps) {
  const { catalog } = state.school;
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const terms = view.chart.terms.filter((t) => t.index !== 0);
  const [target, setTarget] = useState<number | null>(null);
  const targetTerm = target ?? terms.at(-1)?.index ?? 1;

  const placed = view.chart.terms.flatMap((t) => t.objectIds);
  const isPlaced = (id: string) => placed.some((p) => satisfies(catalog, id, p));
  // Required courses not on the plan yet; for a choice not met yet, the
  // courses of each of its options, so any of them can be picked.
  const required = new Set(stillNeededIds(view.requirements.requiredObjectIds, isPlaced));

  const q = query.trim().toLowerCase();
  const unplaced = [...catalog.values()]
    .filter((o) => !placed.includes(o.id))
    // Matches the code as stored ("CS390") or as shown ("CS 390"), or the title.
    .filter((o) => !q || [o.id, courseCode(o.id), o.title].some((text) => text.toLowerCase().includes(q)))
    .sort(compareByCode);

  // Required ones first, then the rest, cut to the number shown.
  const isRequired = (o: CurriculumObject) => required.has(o.id);
  const ordered = [...unplaced.filter(isRequired), ...unplaced.filter((o) => !isRequired(o))];
  const visible = ordered.slice(0, shown);

  // Split into groups, keeping the sorted order inside each one. A Map
  // remembers the order its keys were added in, which is the sorted order.
  const groups = new Map<string, CurriculumObject[]>();
  for (const o of visible) {
    const name = isRequired(o) ? "Required" : (o.code?.subject ?? "Other");
    groups.set(name, [...(groups.get(name) ?? []), o]);
  }

  return (
    <Panel title="Catalog">
      <div className="mb-2 flex gap-2">
        <input
          autoComplete="off"
          className={`${inputClass} flex-1`}
          placeholder="Search"
          aria-label="Search the catalog"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // A new search starts from the top again.
            setShown(PAGE_SIZE);
          }}
        />
        <Select aria-label="Term to add to" value={targetTerm} onChange={(e) => setTarget(Number(e.target.value))}>
          {terms.map((t) => (
            <option key={t.index} value={t.index}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      {unplaced.length === 0 && <p className="text-sm text-zinc-500">Nothing left to add.</p>}
      {[...groups].map(([name, objects]) => (
        <section key={name} className="mb-2">
          <h3 className="pt-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{name}</h3>
          {/* A thin line between courses, so each code reads with its title. */}
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {objects.map((o) => (
              <li key={o.id} className="flex items-center gap-2 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-semibold">{courseCode(o.id)}</div>
                  <div className="truncate text-zinc-600 dark:text-zinc-400">
                    {o.title} · {o.credits} cr
                  </div>
                </div>
                <Button
                  aria-label={`Add ${courseCode(o.id)}`}
                  disabled={terms.length === 0}
                  onClick={() => dispatch({ type: "move", objectId: o.id, termIndex: targetTerm })}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {ordered.length > shown && (
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-zinc-500">
          <span>
            Showing {shown} of {ordered.length.toLocaleString()}
          </span>
          <Button onClick={() => setShown(shown + PAGE_SIZE)}>Show more</Button>
        </div>
      )}
    </Panel>
  );
}
