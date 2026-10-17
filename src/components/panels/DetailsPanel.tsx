"use client";

import { useState } from "react";
import { satisfies, EXTERNAL_TERM, GRADE_POINTS, type Grade } from "../../engine/index";
import { askReason, Badge, Button, newId, Panel, Select } from "../ui";
import type { PanelProps } from "./types";

const GRADES = Object.keys(GRADE_POINTS) as Grade[];

// Everything about the selected object, plus ways to change it. The term
// picker is a keyboard-friendly alternative to dragging.
export function DetailsPanel({ state, view, dispatch }: PanelProps) {
  const { catalog } = state.school;
  const id = state.selectedId;
  const object = id ? catalog.get(id) : undefined;
  const [substituteFor, setSubstituteFor] = useState("");
  // Nothing selected: the box stays, with a hint.
  if (!id || !object)
    return (
      <Panel title="Selected">
        <p className="text-sm text-zinc-500">Click a course to see its details.</p>
      </Panel>
    );

  const term = view.chart.terms.find((t) => t.objectIds.includes(id));
  const external = term?.index === EXTERNAL_TERM;
  const issues = view.check.issues.filter((i) => i.objectId === id);
  const placed = view.chart.terms.flatMap((t) => t.objectIds);
  const unmetRequired = view.requirements.requiredObjectIds.filter(
    (req) => req !== id && !placed.some((p) => satisfies(catalog, req, p)),
  );
  const { requisites, availability } = object;

  return (
    <Panel
      title="Selected"
      actions={
        <Button variant="ghost" onClick={() => dispatch({ type: "select", objectId: null })}>
          Close
        </Button>
      }
    >
      <div className="mb-2">
        <div className="font-mono text-sm font-semibold">{object.id}</div>
        <div className="text-base">{object.title}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge>{object.kind}</Badge>
          <Badge>{object.credits} credits</Badge>
          {object.categories.map((c) => (
            <Badge key={c} tone="info">
              {c}
            </Badge>
          ))}
        </div>
      </div>

      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500">Needs first</dt>
        <dd>
          {requisites.previous.length
            ? requisites.previous
                .map((r) => (requisites.minGrades?.[r] ? `${r} (${requisites.minGrades[r]}+)` : r))
                .join(", ")
            : "—"}
        </dd>
        <dt className="text-zinc-500">Take with</dt>
        <dd>{requisites.concurrent.join(", ") || "—"}</dd>
        <dt className="text-zinc-500">Offered</dt>
        <dd>
          {availability?.seasons?.join(", ") ?? "every term"}
          {availability?.yearParity && `, ${availability.yearParity} years`}
        </dd>
        {object.internalEquivalents.length > 0 && (
          <>
            <dt className="text-zinc-500">Same as</dt>
            <dd>{object.internalEquivalents.join(", ")}</dd>
          </>
        )}
      </dl>

      {issues.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm text-rose-700 dark:text-rose-400">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      {external ? (
        <p className="text-sm text-zinc-500">Pre-Credit from outside work. Remove it under Pre-Credit.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="detail-term" className="w-14 text-sm text-zinc-500">
              Term
            </label>
            <Select
              id="detail-term"
              className="flex-1"
              value={term?.index ?? ""}
              onChange={(e) => dispatch({ type: "move", objectId: id, termIndex: Number(e.target.value) })}
            >
              {!term && <option value="">Not in plan</option>}
              {view.chart.terms
                .filter((t) => t.index !== EXTERNAL_TERM)
                .map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.label}
                  </option>
                ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="detail-grade" className="w-14 text-sm text-zinc-500">
              Grade
            </label>
            <Select
              id="detail-grade"
              className="flex-1"
              value={state.chart.grades?.[id] ?? ""}
              onChange={(e) =>
                dispatch({ type: "setGrade", objectId: id, grade: (e.target.value || null) as Grade | null })
              }
            >
              <option value="">Not graded yet</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          {unmetRequired.length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                aria-label="Requirement to substitute for"
                className="flex-1"
                value={substituteFor}
                onChange={(e) => setSubstituteFor(e.target.value)}
              >
                <option value="">Count as a substitute for…</option>
                {unmetRequired.map((req) => (
                  <option key={req} value={req}>
                    {req}
                  </option>
                ))}
              </Select>
              <Button
                disabled={!substituteFor}
                onClick={() => {
                  const reason = askReason(`${id} for ${substituteFor}`);
                  if (reason === null) return;
                  dispatch({
                    type: "addOverride",
                    override: { id: newId(), kind: "substitute", objectId: substituteFor, substituteId: id, reason },
                  });
                  setSubstituteFor("");
                }}
              >
                Apply
              </Button>
            </div>
          )}

          <Button variant="danger" onClick={() => dispatch({ type: "remove", objectId: id })}>
            Remove from plan
          </Button>
        </div>
      )}
    </Panel>
  );
}
