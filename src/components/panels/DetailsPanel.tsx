"use client";

import { useState } from "react";
import { satisfies, CATEGORY_NAMES, EXTERNAL_TERM, GRADE_POINTS, type Grade, type Term } from "../../engine/index";
import { planIssues } from "../../planner/issues";
import { canRemoveTerm } from "../../planner/state";
import { askReason, Badge, Button, cn, DANGER_ICON_BUTTON, newId, Panel, Select } from "../ui";
import { courseCode } from "../../planner/layout";
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
  // A term is selected (by clicking its title on the chart).
  const selectedTerm = view.chart.terms.find((t) => t.index === state.selectedTerm);
  if (selectedTerm) return <TermDetails term={selectedTerm} state={state} view={view} dispatch={dispatch} />;
  // Nothing selected: the box stays, with a hint, and says where any
  // problems on the chart are (the red counts on cards and term titles).
  if (!id || !object) {
    const onChart = view.check.issues.length - planIssues(view.chart, view.check.issues).length;
    return (
      <Panel title="Selected">
        <p className="text-sm text-zinc-500">Click on a course or a term to see its details.</p>
        {onChart > 0 && (
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">
            {onChart === 1 ? "1 issue" : `${onChart} issues`} on the chart: look for the red counts.
          </p>
        )}
      </Panel>
    );
  }

  const term = view.chart.terms.find((t) => t.objectIds.includes(id));
  const external = term?.index === EXTERNAL_TERM;
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
      <div className="grid grid-cols-2 gap-3 text-sm">
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

      {!external && unmetRequired.length > 0 && (
        <div className="mt-3 space-y-2">
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

// A selected term: its season and credit load, and its courses (click one
// to select it instead). Its problems show beside the box (IssuesPanel). The trash button removes the term,
// like Remove in the menu its column opens when right-clicked.
function TermDetails({ term, state, view, dispatch }: PanelProps & { term: Term }) {
  const { catalog } = state.school;
  const external = term.index === EXTERNAL_TERM;
  const credits = view.check.report.creditsByTerm[term.index] ?? 0;
  const max = view.requirements.maxCreditsPerTerm;
  const over = !external && credits > max;
  const removable = canRemoveTerm(view.chart, term.index);
  const count = term.objectIds.length;

  return (
    <Panel
      title="Selected"
      actions={
        // Pre-Credit fills itself from outside work, so it isn't removed.
        !external && (
          <button
            type="button"
            aria-label={`Remove ${term.label}`}
            data-tooltip={removable ? "Remove term (its courses come off the chart)" : "The only term can't be removed."}
            disabled={!removable}
            onClick={() => dispatch({ type: "removeTerm", termIndex: term.index })}
            className={cn(DANGER_ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}
          >
            <TrashIcon />
          </button>
        )
      }
    >
      <div className="mb-2">
        {/* The term's name, with its credit load at the right end, in the
            boxes' quiet grey text (like the Issues box's "This plan meets
            every requirement."); rose when over the limit. */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-base font-semibold">{term.label}</div>
          <div
            className={cn(
              "shrink-0 text-sm",
              over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-zinc-500",
            )}
          >
            {credits}
            {!external && ` / ${max}`} credits
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {term.season && !external && <Badge tone={term.season}>{term.season}</Badge>}
          <Badge>{count === 1 ? "1 course" : `${count} courses`}</Badge>
        </div>
      </div>

      {count > 0 ? (
        <ul className="text-sm">
          {term.objectIds.map((objectId) => {
            const object = catalog.get(objectId);
            return (
              <li key={objectId}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "select", objectId })}
                  className="-mx-1 flex w-[calc(100%+0.5rem)] items-baseline gap-2 rounded-md px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="shrink-0 font-semibold">{courseCode(objectId)}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-400">{object?.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{object?.credits} cr</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No courses yet. Drag one here, or add one from the catalog.</p>
      )}

    </Panel>
  );
}
