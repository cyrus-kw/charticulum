"use client";

import { useState } from "react";
import { satisfies, CATEGORY_NAMES, EXTERNAL_TERM, GRADE_POINTS, type Grade } from "../../engine/index";
import { askReason, Badge, Button, DANGER_ICON_BUTTON, newId, Panel, Select } from "../ui";
import { courseCode, withCourseCodes } from "../../planner/layout";
import { TrashIcon } from "../icons";
import type { PanelProps } from "./types";

const GRADES = Object.keys(GRADE_POINTS) as Grade[];
// A row of tags under a label. It is as tall as a compact dropdown (h-5), so
// the left column's rows line up with Term and Grade on the right.
const tagList = "mt-0.5 flex min-h-5 flex-wrap items-center gap-1";

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
        <p className="text-sm text-zinc-500">Click on a course to see its details.</p>
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
        // Pre-Credit is removed under Pre-Credit, not here.
        !external && (
          <button
            type="button"
            aria-label={`Remove ${object.id} from plan`}
            data-tooltip="Remove from plan"
            onClick={() => dispatch({ type: "remove", objectId: id })}
            className={DANGER_ICON_BUTTON}
          >
            <TrashIcon />
          </button>
        )
      }
    >
      <div className="mb-2">
        {/* "CS 201: Algorithms" */}
        <div className="text-base">
          <span className="font-semibold">{courseCode(object.id)}</span>: {object.title}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge>{object.kind}</Badge>
          <Badge>
            {object.credits} {object.credits === 1 ? "credit" : "credits"}
          </Badge>
          {object.categories.map((c) => (
            <Badge key={c} tone="info">
              {CATEGORY_NAMES[c]}
            </Badge>
          ))}
        </div>
      </div>

      {/* Course information on the left; its term and grade on the right.
          Labels sit above their values to fit both side by side. */}
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
        <dl className="space-y-1.5">
          {/* Requisites only when the course has any. */}
          {requisites.previous.length > 0 && (
            <div>
              <dt className="text-xs text-zinc-500">Prerequisites</dt>
              <dd className={tagList}>
                {requisites.previous.map((r) => (
                  <Badge key={r}>
                    {courseCode(r)}
                    {requisites.minGrades?.[r] && ` (${requisites.minGrades[r]}+)`}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
          {requisites.concurrent.length > 0 && (
            <div>
              <dt className="text-xs text-zinc-500">Concurrents</dt>
              <dd className={tagList}>
                {requisites.concurrent.map((r) => (
                  <Badge key={r}>{courseCode(r)}</Badge>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-zinc-500">Offered</dt>
            {/* Tags, tinted like the chart's one-season cards. */}
            <dd className={tagList}>
              {availability.seasons.length > 0 ? (
                availability.seasons.map((season) => (
                  <Badge key={season} tone={season}>
                    {season}
                  </Badge>
                ))
              ) : (
                // Not scheduled by the school yet.
                <Badge>TBA</Badge>
              )}
              {availability.yearParity && <Badge>{availability.yearParity} years</Badge>}
            </dd>
          </div>
          {object.internalEquivalents.length > 0 && (
            <div>
              <dt className="text-xs text-zinc-500">Same as</dt>
              <dd className={tagList}>
                {object.internalEquivalents.map((r) => (
                  <Badge key={r}>{courseCode(r)}</Badge>
                ))}
              </dd>
            </div>
          )}
        </dl>

        {external ? (
          <p className="text-zinc-500">Pre-Credit from outside work. Remove it under Pre-Credit.</p>
        ) : (
          <div className="space-y-1.5">
            <div>
              <label htmlFor="detail-term" className="block text-xs text-zinc-500">
                Term
              </label>
              <Select
                id="detail-term"
                className="w-full"
                compact
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
            <div>
              <label htmlFor="detail-grade" className="block text-xs text-zinc-500">
                Grade
              </label>
              <Select
                id="detail-grade"
                className="w-full"
                compact
                value={state.chart.grades?.[id] ?? ""}
                onChange={(e) =>
                  dispatch({ type: "setGrade", objectId: id, grade: (e.target.value || null) as Grade | null })
                }
              >
                <option value="">No grade</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm text-rose-700 dark:text-rose-400">
          {issues.map((issue, i) => (
            <li key={i}>{withCourseCodes(issue.message, catalog)}</li>
          ))}
        </ul>
      )}

      {!external && (
        <div className="space-y-2">
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
        </div>
      )}
    </Panel>
  );
}
