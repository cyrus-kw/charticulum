"use client";

import type { ChartIssue } from "../../engine/index";
import { askReason, Badge, Button, newId, Panel } from "../ui";
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
    <Panel title="Issues" actions={<Badge tone={all.length ? "bad" : "good"}>{all.length || "Clear"}</Badge>}>
      {all.length === 0 ? (
        <p className="text-sm text-zinc-500">This plan meets every rule and requirement.</p>
      ) : (
        <ul className="space-y-2">
          {all.map(({ issue, source }, i) => (
            <li key={i} className="text-sm">
              <button
                type="button"
                className="text-left hover:underline disabled:no-underline"
                disabled={!issue.objectId || !placed.has(issue.objectId)}
                onClick={() => issue.objectId && dispatch({ type: "select", objectId: issue.objectId })}
              >
                {source && <span className="font-semibold">{source}: </span>}
                {issue.message}
              </button>
              <div className="mt-1 flex flex-wrap gap-1 empty:hidden">{fixes(issue)}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
