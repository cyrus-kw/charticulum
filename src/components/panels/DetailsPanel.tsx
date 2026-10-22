"use client";

import { useState } from "react";
import {
  describeRequired,
  requiredIds,
  requiredKey,
  satisfies,
  stillNeededIds,
  CATEGORY_NAMES,
  EXTERNAL_TERM,
  GRADE_POINTS,
  type Grade,
  type Term,
} from "../../engine/index";
import { canRemoveTerm } from "../../planner/state";
import { askReason, Badge, Button, cn, DANGER_ICON_BUTTON, newId, Panel, Select, TOOLBAR_BUTTON_SIZE } from "../ui";
import { courseCode } from "../../planner/layout";
import { TrashIcon } from "../icons";
import type { PanelProps } from "./types";
import { useDescription } from "./useDescription";

const GRADES = Object.keys(GRADE_POINTS) as Grade[];
// A row's tags, beside its label. min-h-5 makes a row of tags as tall as
// a line of the label's text, so the two stay level.
const tagList = "flex min-h-5 min-w-0 flex-wrap items-center gap-1";

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
  // Nothing selected: the box stays, with a hint. (The chart's problems
  // are all listed in Issues beside it.)
  if (!id || !object) {
    return (
      <Panel title="Selected" toolbar>
        <p className="text-sm text-zinc-500">Click on a course or a term to see its details.</p>
      </Panel>
    );
  }

  const term = view.chart.terms.find((t) => t.objectIds.includes(id));
  const external = term?.index === EXTERNAL_TERM;
  const placed = view.chart.terms.flatMap((t) => t.objectIds);
  // What it could stand in for: required courses not on the plan (for an
  // unmet choice, each of its options' courses).
  const unmetRequired = stillNeededIds(view.requirements.requiredObjectIds, (req) =>
    placed.some((p) => satisfies(catalog, req, p)),
  ).filter((req) => req !== id);
  const { requisites, availability } = object;

  return (
    <Panel
      title="Selected"
      toolbar
      actions={
        // Pre-Credit is removed under Pre-Credit, not here.
        !external && (
          <button
            type="button"
            aria-label={`Remove ${object.id} from plan`}
            data-tooltip="Remove from plan"
            onClick={() => dispatch({ type: "remove", objectId: id })}
            style={TOOLBAR_BUTTON_SIZE}
            className={DANGER_ICON_BUTTON}
          >
            <TrashIcon />
          </button>
        )
      }
    >
      {/* "CS 201: Algorithms". Its line is 24px, taller than the 20px rows
          Panel's `toolbar` centers on the line in the Plan column, so it
          moves up 2px (-mt-0.5) to be centered on that line too. */}
      <div className="-mt-0.5 text-base">
        <span className="font-semibold">{courseCode(object.id)}</span>: {object.title}
      </div>
      {/* One line of tags: credits, gen ed areas, then the seasons it's
          offered in (tinted like the chart's one-season cards). Its type
          only shows when it isn't a course, since nearly everything is. */}
      <div className="mt-1 flex flex-wrap gap-1">
        {object.type !== "course" && <Badge>{object.type}</Badge>}
        <Badge>
          {object.credits} {object.credits === 1 ? "credit" : "credits"}
        </Badge>
        {object.categories.map((c) => (
          <Badge key={c} tone="info">
            {CATEGORY_NAMES[c]}
          </Badge>
        ))}
        {availability.seasons.length === 4 ? (
          // Offered all year: one tag instead of four.
          <Badge>Every season</Badge>
        ) : availability.seasons.length > 0 ? (
          availability.seasons.map((season) => (
            <Badge key={season} tone={season}>
              {season}
            </Badge>
          ))
        ) : (
          // Not scheduled by the school yet.
          <Badge>Offered TBA</Badge>
        )}
        {availability.yearParity && <Badge>{availability.yearParity} years</Badge>}
      </div>
      {/* key: a new course starts with its description cut short again. */}
      <Description key={object.id} schoolId={state.school.data.school.id} objectId={object.id} />

      {/* The rest as rows like the Plan box's: a grey label beside its
          value, one line each, so it all fits without scrolling. Term and
          Grade share the first row, since they're the two things to change;
          requisite rows only show when the course has any. */}
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="self-center text-zinc-500">Term</dt>
        {external ? (
          <dd className="text-zinc-500">Pre-Credit (remove it under Pre-Credit)</dd>
        ) : (
          <dd className="flex min-w-0 items-center gap-3">
            <Select
              aria-label="Term"
              className="min-w-0 flex-1"
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
            <label htmlFor="detail-grade" className="shrink-0 text-zinc-500">
              Grade
            </label>
            <Select
              id="detail-grade"
              className="w-20 shrink-0"
              compact
              value={state.chart.grades?.[id] ?? ""}
              onChange={(e) =>
                dispatch({ type: "setGrade", objectId: id, grade: (e.target.value || null) as Grade | null })
              }
            >
              <option value="">None</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </dd>
        )}
        {requisites.previous.length > 0 && (
          <>
            <dt className="text-zinc-500">Needs</dt>
            <dd className={tagList}>
              {requisites.previous.map((r) => {
                // A choice's courses share one minimum grade; show it once.
                const grade = requiredIds([r])
                  .map((req) => requisites.minGrades?.[req])
                  .find(Boolean);
                return (
                  <Badge key={requiredKey(r)} keepCase>
                    {describeRequired(r, courseCode)}
                    {grade && ` (${grade}+)`}
                  </Badge>
                );
              })}
            </dd>
          </>
        )}
        {requisites.concurrent.length > 0 && (
          <>
            <dt className="text-zinc-500">Taken with</dt>
            <dd className={tagList}>
              {requisites.concurrent.map((r) => (
                <Badge key={requiredKey(r)} keepCase>
                  {describeRequired(r, courseCode)}
                </Badge>
              ))}
            </dd>
          </>
        )}
        {object.internalEquivalents.length > 0 && (
          <>
            <dt className="text-zinc-500">Same as</dt>
            <dd className={tagList}>
              {object.internalEquivalents.map((r) => (
                <Badge key={r}>{courseCode(r)}</Badge>
              ))}
            </dd>
          </>
        )}
      </dl>

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
      toolbar
      actions={
        // Pre-Credit fills itself from outside work, so it isn't removed.
        !external && (
          <button
            type="button"
            aria-label={`Remove ${term.label}`}
            data-tooltip={removable ? "Remove term (its courses come off the chart)" : "The only term can't be removed."}
            disabled={!removable}
            onClick={() => dispatch({ type: "removeTerm", termIndex: term.index })}
            style={TOOLBAR_BUTTON_SIZE}
            className={cn(DANGER_ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}
          >
            <TrashIcon />
          </button>
        )
      }
    >
      <div className="-mt-0.5 mb-2">
        {/* The term's name (moved up 2px like a course's, to be centered on
            the line in the Plan column), with its credit load at the right end, in the
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

// A course's description, fetched when the course is selected. Cut to
// two lines at first (the "…" says there's more); clicking it shows the
// rest, and clicking again cuts it short. That saves the line a separate
// "More" button would take. Nothing shows while it loads or if there
// isn't one, so courses without one look as before.
function Description({ schoolId, objectId }: { schoolId: string; objectId: string }) {
  const description = useDescription(schoolId, objectId);
  const [open, setOpen] = useState(false);
  if (!description) return null;
  // Only clickable when there's likely more than two lines' worth.
  const long = description.length > 110;
  const text = cn("mt-1 text-sm text-zinc-600 dark:text-zinc-400", long && !open && "line-clamp-2");
  if (!long) return <p className={text}>{description}</p>;
  return (
    <button
      type="button"
      aria-expanded={open}
      data-tooltip={open ? "Show less" : "Show all"}
      onClick={() => setOpen(!open)}
      className={cn(text, "w-full text-left hover:text-zinc-800 dark:hover:text-zinc-200")}
    >
      {description}
    </button>
  );
}
