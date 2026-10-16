"use client";

import { useState } from "react";
import { satisfies } from "../../engine/index";
import { Badge, Button, inputClass, Panel, Select } from "../ui";
import type { PanelProps } from "./types";

// Objects not yet in the chart, with a button to add each one.
export function CatalogPanel({ state, view, dispatch }: PanelProps) {
  const { catalog } = state.school;
  const [query, setQuery] = useState("");
  const terms = view.chart.terms.filter((t) => t.index !== 0);
  const [target, setTarget] = useState<number | null>(null);
  const targetTerm = target ?? terms.at(-1)?.index ?? 1;

  const placed = view.chart.terms.flatMap((t) => t.objectIds);
  const isPlaced = (id: string) => placed.some((p) => satisfies(catalog, id, p));
  const required = new Set(view.requirements.requiredObjectIds);

  const q = query.trim().toLowerCase();
  const unplaced = [...catalog.values()]
    .filter((o) => !placed.includes(o.id))
    .filter((o) => !q || o.id.toLowerCase().includes(q) || o.title.toLowerCase().includes(q))
    .sort((a, b) => Number(required.has(b.id)) - Number(required.has(a.id)) || a.id.localeCompare(b.id));

  return (
    <Panel title="Catalog">
      <div className="mb-2 flex gap-2">
        <input
          className={`${inputClass} flex-1`}
          placeholder="Search"
          aria-label="Search the catalog"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select aria-label="Term to add to" value={targetTerm} onChange={(e) => setTarget(Number(e.target.value))}>
          {terms.map((t) => (
            <option key={t.index} value={t.index}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      <ul className="space-y-1">
        {unplaced.length === 0 && <li className="text-sm text-zinc-500">Nothing left to add.</li>}
        {unplaced.map((o) => (
          <li key={o.id} className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold">{o.id}</span>
                {required.has(o.id) && !isPlaced(o.id) && <Badge tone="bad">required</Badge>}
              </div>
              <div className="truncate text-zinc-600 dark:text-zinc-400">
                {o.title} · {o.credits} cr
              </div>
            </div>
            <Button
              aria-label={`Add ${o.id}`}
              disabled={terms.length === 0}
              onClick={() => dispatch({ type: "move", objectId: o.id, termIndex: targetTerm })}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
