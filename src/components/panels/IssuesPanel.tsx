"use client";

import type { ChartIssue } from "../../engine/index";
import { askReason, Badge, Button, GroupHeading, newId, Panel } from "../ui";
import { planIssues } from "../../planner/issues";
import { courseCode, withCourseCodes } from "../../planner/layout";
import type { PanelProps } from "./types";

const REQUISITE_CODES = new Set([
  "PREVIOUS_REQUISITE_NOT_MET",
  "CONCURRENT_REQUISITE_NOT_MET",
  "REQUISITE_GRADE_TOO_LOW",
]);

// A problem, and where it came from when that's not the plan itself (e.g.
// "Build for me" for what it couldn't do).
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
    ...state.builderIssues.map((issue) => ({ issue, source: "Build for me" })),
    ...planIssues(view.chart, view.check.issues).map((issue) => ({ issue })),
  ];
}

// The plan's problems, in the panel above the chart beside Selected and
// Requirements: those on the chart (a course or term; the selected one's
// first), then what the plan still needs. Each comes with one-click fixes
// where there's an obvious one (progressive error correction).
export function IssuesPanel({
  chartIssues,
  requirementIssues,
  state,
  dispatch,
}: Pick<PanelProps, "state" | "dispatch"> & { chartIssues: ChartIssue[]; requirementIssues: ListedIssue[] }) {
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

  // What a problem is about, as a tag at its start: the course (or term)
  // on the chart, the requirement (named like its meter in Requirements),
  // or Build for me. A course or term tag selects it when clicked.
  const tag = ({ issue, source }: ListedIssue) => {
    if (source) return <Badge>{source}</Badge>;
    // Named exactly like its meter in Requirements.
    if (issue.requirement)
      return (
        <Badge tone="info" keepCase>
          {issue.requirement}
        </Badge>
      );
    if (issue.objectId) {
      const objectId = issue.objectId;
      return (
        <TagButton label={`Select ${objectId}`} onClick={() => dispatch({ type: "select", objectId })}>
          {courseCode(objectId)}
        </TagButton>
      );
    }
    const term = state.chart.terms.find((t) => t.index === issue.termIndex);
    if (term) {
      return (
        <TagButton label={`Select ${term.label}`} onClick={() => dispatch({ type: "selectTerm", termIndex: term.index })}>
          {term.label}
        </TagButton>
      );
    }
    return null;
  };

  const list = (items: ListedIssue[]) => (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-rose-700 dark:text-rose-400">
          {/* The tag, then the problem; a long message wraps under both. */}
          <span className="mr-1.5 inline-flex align-[1px]">{tag(item)}</span>
          {withCourseCodes(item.issue.summary ?? withoutSubject(item.issue, state), state.school.catalog)}
          <div className="mt-1 flex flex-wrap gap-1 empty:hidden">{fixes(item.issue)}</div>
        </li>
      ))}
    </ul>
  );

  const total = chartIssues.length + requirementIssues.length;
  return (
    <Panel
      title="Issues"
      toolbar
      // The count as a red tag, square like the badges on the chart.
      actions={
        total > 0 && (
          <Badge tone="bad" square>
            {total}
          </Badge>
        )
      }
    >
      {total === 0 && <p className="text-sm text-zinc-500">No issues: the plan meets every rule.</p>}
      {/* A long list scrolls inside the box, under the title and count.
          (min-h-0 lets it shrink to fit; see the columns in Planner.tsx.) It
          reaches into the panel's right padding (-mr-4) and puts it back
          (pr-4), so the scrollbar sits by the box's edge without covering
          any words. Two groups, each under a small heading (like the
          catalog's subjects), so it's clear which problems are about a
          course or term on the chart and which are about what the plan
          still needs; a group with nothing in it is left out. */}
      <div className="-mr-4 min-h-0 space-y-3 overflow-y-auto pr-4">
        {chartIssues.length > 0 && (
          <section>
            <GroupHeading>On the chart</GroupHeading>
            {list(chartIssues.map((issue) => ({ issue })))}
          </section>
        )}
        {requirementIssues.length > 0 && (
          <section>
            <GroupHeading>Requirements</GroupHeading>
            {list(requirementIssues)}
          </section>
        )}
      </div>
    </Panel>
  );
}

// A chart problem's message without the course or term it starts with,
// since its tag already names it: "CS301 needs CS201 completed in an
// earlier term." becomes "Needs CS201 completed in an earlier term."
function withoutSubject(issue: ChartIssue, state: PanelProps["state"]): string {
  const subject = issue.objectId ?? state.chart.terms.find((t) => t.index === issue.termIndex)?.label;
  if (!subject || !issue.message.startsWith(`${subject} `)) return issue.message;
  const rest = issue.message.slice(subject.length + 1);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// A tag that can be clicked (to select the course or term it names). It
// looks like the other tags, a shade darker on hover.
function TagButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tooltip="Select on the chart"
      onClick={onClick}
      className="rounded hover:brightness-95 dark:hover:brightness-125"
    >
      <Badge>{children}</Badge>
    </button>
  );
}
