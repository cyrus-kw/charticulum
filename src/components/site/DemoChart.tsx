"use client";

import { useMemo, useReducer } from "react";
import { EXTERNAL_TERM, type Chart } from "../../engine/index";
import { loadSampleSchool } from "../../fixtures/sampleSchool";
import { withCourseCodes } from "../../planner/layout";
import { derive, openedState, plannerReducer, type PlannerAction, type PlannerState } from "../../planner/state";
import { ChartFlow } from "../ChartFlow";
import { Button, cn } from "../ui";

// A small chart on the home page that visitors can try before signing in.
// It's the real thing, not a copy: the planner's own chart (ChartFlow),
// its own reducer for moving courses, and the engine's own checks, all on
// the sample school. Only the plan is made up, and nothing is saved.

const school = loadSampleSchool();

// Three terms from the sample school's computer science plan. CS 102 and
// its lab are taken together, so they move as one block within a term.
const START_CHART: Chart = {
  name: "Demo",
  completedExternal: [],
  terms: [
    { index: EXTERNAL_TERM, label: "Pre-Credit", objectIds: [] },
    { index: 1, label: "Fall 2026", season: "fall", year: 2026, objectIds: ["CS101", "MATH101"] },
    { index: 2, label: "Spring 2027", season: "spring", year: 2027, objectIds: ["CS102", "CS102L", "MATH201"] },
    { index: 3, label: "Fall 2027", season: "fall", year: 2027, objectIds: ["CS201", "CS210"] },
  ],
};
const START: PlannerState = openedState(school, START_CHART, "demo");

// The planner's reducer, plus "reset" to put everything back.
function demoReducer(state: PlannerState, action: PlannerAction | { type: "reset" }): PlannerState {
  return action.type === "reset" ? START : plannerReducer(state, action);
}

export function DemoChart() {
  const [state, dispatch] = useReducer(demoReducer, START);
  const view = useMemo(() => derive(state), [state]);
  // Drawn without the (empty) Pre-Credit column, as the planner does when
  // it's hidden.
  const shownChart = useMemo(
    () => ({ ...view.chart, terms: view.chart.terms.filter((t) => t.index !== EXTERNAL_TERM) }),
    [view.chart],
  );
  // Only problems with the courses shown count here. (The demo isn't a
  // whole degree, so "missing required course" and the like don't apply.)
  const onChart = new Set(shownChart.terms.flatMap((t) => t.objectIds));
  const issues = view.check.issues.filter((issue) => issue.objectId && onChart.has(issue.objectId));
  const changed = state.chart !== START.chart;

  return (
    <div className="w-full space-y-2">
      <div className="overflow-hidden rounded-md border border-zinc-200 shadow-sm dark:border-zinc-800">
        <ChartFlow
          bare
          catalog={school.catalog}
          chart={shownChart}
          issues={issues}
          creditsByTerm={view.check.report.creditsByTerm}
          maxCredits={view.requirements.maxCreditsPerTerm}
          selectedId={state.selectedId}
          planVersion={state.chart}
          onMove={(objectId, termIndex, position) => dispatch({ type: "move", objectId, termIndex, position })}
          onSelect={(objectId) => dispatch({ type: "select", objectId })}
        />
      </div>
      {/* Below the chart: what to try, or what's wrong now (in the
          engine's own words, as in the planner's Issues box), and a way
          back to the start. */}
      <div className="flex min-h-[30px] items-center justify-between gap-3 text-sm">
        <p role="status" className={cn(issues.length ? "text-rose-700 dark:text-rose-400" : "text-zinc-500")}>
          {issues.length
            ? `${withCourseCodes(issues[0].message, school.catalog)}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}`
            : changed
              ? "Every rule is still met."
              : "Try dragging a course to an earlier term."}
        </p>
        {changed && (
          <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
