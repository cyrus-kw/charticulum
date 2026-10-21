"use client";

import type { ChartIssue } from "../../engine/index";
import { askReason, Badge, Button, newId, Panel } from "../ui";
import { planIssues } from "../../planner/issues";
import { withCourseCodes } from "../../planner/layout";
import type { PanelProps } from "./types";

const REQUISITE_CODES = new Set([
  "PREVIOUS_REQUISITE_NOT_MET",
  "CONCURRENT_REQUISITE_NOT_MET",
  "REQUISITE_GRADE_TOO_LOW",
]);

// A problem, and where it came from when that's not the plan itself (e.g.
// "Builder" for what Build for me couldn't do).
export interface ListedIssue {
  issue: ChartIssue;
  source?: string;
}

// The plan's problems beside Requirements: the pinned programs' problems,
// what Build for me couldn't do, and the check's problems that aren't
// about one term or course.
export function listPlanIssues({ state, view }: Pick<PanelProps, "state" | "view">): ListedIssue[] {
  return [
    ...view.templateIssues.map((issue) => ({ issue })),
    ...state.builderIssues.map((issue) => ({ issue, source: "Builder" })),
    ...planIssues(view.chart, view.check.issues).map((issue) => ({ issue })),
  ];
}

// The plan's problems, in the panel above the chart beside Selected and
// Requirements. Each comes with one-click fixes where there's an obvious
// one (progressive error correction).
export function IssuesPanel({ issues, state, dispatch }: Pick<PanelProps, "state" | "dispatch"> & { issues: ListedIssue[] }) {
  const lastTerm = state.chart.terms.at(-1)?.index ?? 1;

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
    <Panel
      title="Issues"
      // The count as a red tag, square like the badges on the chart.
      actions={
        issues.length > 0 && (
          <Badge tone="bad" square>
            {issues.length}
          </Badge>
        )
      }
    >
      {issues.length === 0 && <p className="text-sm text-zinc-500">No issues: the plan meets every rule.</p>}
      {/* A long list scrolls inside the box, under the title and count.
          (min-h-0 lets it shrink to fit; see the columns in Planner.tsx.) It
          reaches into the panel's right padding (-mr-4) and puts it back
          (pr-4), so the scrollbar sits by the box's edge without covering
          any words. */}
      <ul className="-mr-4 min-h-0 space-y-2 overflow-y-auto pr-4">
        {issues.map(({ issue, source }, i) => (
          <li key={i} className="text-sm text-rose-700 dark:text-rose-400">
            {source && <span className="font-semibold">{source}: </span>}
            {withCourseCodes(issue.message, state.school.catalog)}
            <div className="mt-1 flex flex-wrap gap-1 empty:hidden">{fixes(issue)}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
