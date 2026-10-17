"use client";

import type { ChartIssue } from "../../engine/index";
import { askReason, Badge, Button, newId, Panel } from "../ui";
import { withCourseCodes } from "../../planner/layout";
import type { PanelProps } from "./types";

const REQUISITE_CODES = new Set([
  "PREVIOUS_REQUISITE_NOT_MET",
  "CONCURRENT_REQUISITE_NOT_MET",
  "REQUISITE_GRADE_TOO_LOW",
]);

// Every problem with the plan, with one-click fixes where there's an
// obvious one (progressive error correction).
export function IssuesPanel({ state, view, dispatch }: PanelProps) {
  const placed = new Set(view.chart.terms.flatMap((t) => t.objectIds));
  const lastTerm = view.chart.terms.at(-1)?.index ?? 1;
  const all: { issue: ChartIssue; source?: string }[] = [
    ...view.templateIssues.map((issue) => ({ issue })),
    ...state.builderIssues.map((issue) => ({ issue, source: "Builder" })),
    ...view.check.issues.map((issue) => ({ issue })),
  ];

  const fixes = (issue: ChartIssue) => {
    const { objectId, requisiteId } = issue;
    if (!objectId) return null;

    if (issue.code === "MISSING_REQUIRED_OBJECT") {
      return (
        <>
          <Button onClick={() => dispatch({ type: "move", objectId, termIndex: lastTerm })}>Add to plan</Button>
          <Button
            variant="ghost"
            onClick={() => {
              const reason = askReason(`waive ${objectId}`);
              if (reason !== null)
                dispatch({ type: "addOverride", override: { id: newId(), kind: "waive-requirement", objectId, reason } });
            }}
          >
            Waive…
          </Button>
        </>
      );
    }

    if (REQUISITE_CODES.has(issue.code) && requisiteId) {
      return (
        <Button
          variant="ghost"
          onClick={() => {
            const reason = askReason(`${objectId} without ${requisiteId}`);
            if (reason !== null)
              dispatch({
                type: "addOverride",
                override: { id: newId(), kind: "waive-requisite", objectId, requisiteId, reason },
              });
          }}
        >
          Waive requisite…
        </Button>
      );
    }
    return null;
  };

  return (
    <Panel title="Issues" actions={
        // A count is square; "None" is a word, so it gets a normal tag.
        all.length ? <Badge tone="bad" square>{all.length}</Badge> : <Badge tone="good">None</Badge>
      }>
      {all.length === 0 ? (
        <p className="text-sm text-zinc-500">This plan meets every requirement.</p>
      ) : (
        // A long list scrolls inside the box, under the title and count,
        // instead of growing down over the chart. (min-h-0 lets it shrink
        // to fit the box; see the Issues box in Planner.tsx.) The list
        // reaches into the panel's right padding (-mr-4) and puts the same
        // padding back inside (pr-4): the text stays where it was, and the
        // scrollbar lands in that padding by the box's edge, where it
        // can't cover any words.
        <ul className="-mr-4 min-h-0 space-y-2 overflow-y-auto pr-4">
          {all.map(({ issue, source }, i) => (
            <li key={i} className="text-sm">
              <button
                type="button"
                className="text-left hover:underline disabled:no-underline"
                disabled={!issue.objectId || !placed.has(issue.objectId)}
                onClick={() => issue.objectId && dispatch({ type: "select", objectId: issue.objectId })}
              >
                {source && <span className="font-semibold">{source}: </span>}
                {withCourseCodes(issue.message, state.school.catalog)}
              </button>
              <div className="mt-1 flex flex-wrap gap-1 empty:hidden">{fixes(issue)}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
