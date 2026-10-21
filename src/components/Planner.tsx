"use client";

import { useEffect, useMemo, useReducer, useState, type MouseEvent } from "react";
import Link from "next/link";
import { EXTERNAL_TERM, loadSchool, parseSchoolData, type SchoolData, type SchoolDataInput } from "../engine/index";
import { historyReducer, startHistory } from "../planner/history";
import { derive, openedState } from "../planner/state";
import type { SavedChart } from "../storage/types";
import { ChartFlow, HistoryControls } from "./ChartFlow";
import { OpenIcon } from "./icons";
import { CatalogPanel } from "./panels/CatalogPanel";
import { DetailsPanel } from "./panels/DetailsPanel";
import { PlanInfoPanel } from "./panels/PlanInfoPanel";
import { IssuesPanel, listPlanIssues } from "./panels/IssuesPanel";
import { selectionIssues } from "../planner/issues";
import { ExternalCreditPanel } from "./panels/ExternalCreditPanel";
import { ProgramPanel } from "./panels/ProgramPanel";
import { SavePanel } from "./panels/SavePanel";
import { SchoolPanel } from "./panels/SchoolPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { cn, FIELD_FOCUS, Tabs } from "./ui";
import { HEADER_BUTTON, PANEL_HEADER_HEIGHT, PanelToggle, SidePanel, TOGGLE_INSET, TOGGLE_SIZE } from "./SidePanel";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu, type MenuUser } from "./UserMenu";
import { usePanels } from "./usePanels";

// The plan's name box, in the same style as the undo/redo buttons beside it.
const nameBox =
  "rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

// The school's data was checked when it was saved, so a failure here
// means a bug, not a bad file.
function parsedSchool(input: SchoolDataInput): SchoolData {
  const parsed = parseSchoolData(input);
  if (!parsed.ok) throw new Error(`The school's data didn't parse:\n${parsed.errors.join("\n")}`);
  return parsed.data;
}

// The planner for one saved chart. The page loads the chart and its
// school's data on the server and hands them over, the school compacted
// (see openChart); parsing it fills the left-out defaults back in.
export function Planner({
  school: schoolData,
  saved,
  user,
}: {
  school: SchoolDataInput;
  saved: SavedChart;
  // Who's signed in, shown at the bottom of the side panel.
  user: MenuUser;
}) {
  // useReducer holds the planner state; dispatch(action) updates it.
  // The third argument builds the first state once, on first render.
  // The planner state, with undo/redo history around it.
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    startHistory(openedState(loadSchool(parsedSchool(schoolData)), saved.chart, saved.id)),
  );
  const state = history.present;

  // The chart as last saved. Every edit makes a new chart object, so
  // "unsaved" is simply "not the same object". (Undoing back to the saved
  // version brings back that same object, so it counts as saved again.)
  const [savedChart, setSavedChart] = useState(saved.chart);
  const unsaved = state.chart !== savedChart;

  // Closing the tab or reloading with unsaved changes: the browser asks
  // "Leave site?" first.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Moving to another page of the site (the dashboard, Sign out)
  // isn't a page reload, so the browser won't ask; ask here instead.
  const confirmLeave = () => !unsaved || window.confirm("Leave without saving your changes?");
  // For links: preventDefault cancels the click, so the page stays.
  const guardLeave = (event: MouseEvent) => {
    if (!confirmLeave()) event.preventDefault();
  };

  // Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Not while typing
  // in a text box, where those keys edit the text.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      // Nor while a floating panel (Settings) covers the chart.
      if (target?.closest("input, textarea, select, [contenteditable='true'], [aria-modal='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: "undo" });
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Recompute the checks only when the state actually changes.
  // Only the school and chart feed `derive` (see its comment for why).
  const { school, chart } = state;
  const view = useMemo(() => derive({ school, chart }), [school, chart]);
  const panelProps = { state, view, dispatch };
  // Remount panels when the school changes so their local inputs reset.
  const schoolKey = state.school.data.school.id;
  const panels = usePanels();
  // The chart as drawn: without the Pre-Credit column if it's hidden. (Its
  // credit still counts; only the picture changes.)
  const shownChart = useMemo(
    () =>
      panels.open.preCredit
        ? view.chart
        : { ...view.chart, terms: view.chart.terms.filter((t) => t.index !== EXTERNAL_TERM) },
    [view.chart, panels.open.preCredit],
  );

  return (
    <div className="flex h-dvh flex-col bg-page text-ink dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Side panels resize by dragging their inner edge, which also widens
            or compresses the chart, and collapse to an icon. */}
        <SidePanel
          key={`left-${schoolKey}`}
          id="tools-panel"
          title="Tools"
          side="left"
          open={panels.open.left}
          width={panels.open.leftWidth}
          onToggle={() => panels.toggle("left")}
          onResize={(width, done) => panels.setWidth(width, done)}
          heading={
            // flex-1 fills the header, so the dashboard button lands at the
            // far right, framing the wordmark with the side panel button.
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              {/* The wordmark leads to the dashboard too, like on the
                  site's other pages. */}
              <Link
                href="/dashboard"
                onClick={guardLeave}
                data-tooltip="Open dashboard"
              >
                <h1 className="text-base leading-tight font-semibold">Charticulum</h1>
                <p className="text-xs whitespace-nowrap text-zinc-500">Chart your curriculum</p>
              </Link>
              {/* Link (not <a>) moves to the page without reloading the app. */}
              <Link
                href="/dashboard"
                onClick={guardLeave}
                aria-label="Open dashboard"
                data-tooltip="Open dashboard"
                style={{ width: TOGGLE_SIZE, height: TOGGLE_SIZE }}
                className={HEADER_BUTTON}
              >
                <OpenIcon />
              </Link>
            </div>
          }
          footer={
            <>
              <UserMenu user={user} look="row" confirmLeave={confirmLeave} />
              <ThemeToggle />
            </>
          }
        >
          {/* Two tabs: the plan itself, and the school's courses and data.
              The tab row stays in view just under the header. */}
          <Tabs
            id="tools"
            label="Tools"
            value={panels.open.tab}
            onChange={panels.setTab}
            stickyTop={PANEL_HEADER_HEIGHT + 1}
            tabs={[
              {
                value: "plan",
                label: "Plan",
                content: (
                  <>
                    <SavePanel {...panelProps} unsaved={unsaved} onSaved={setSavedChart} />
                    <ProgramPanel {...panelProps} />
                    <ExternalCreditPanel {...panelProps} />
                  </>
                ),
              },
              {
                value: "catalog",
                label: "Catalog",
                content: (
                  <>
                    <CatalogPanel {...panelProps} />
                    <SchoolPanel {...panelProps} />
                  </>
                ),
              },
            ]}
          />
        </SidePanel>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Chart">
          {/* The panel above the chart, in four columns of the same width
              with a line between each. The first has undo/redo and the
              plan's name in a row as tall as the side panel's header (so
              the two line up), and what the plan is under it (school,
              programs, terms). Then the selected course or term, every problem,
              and the plan's requirements. It has a fixed height, so the
              chart below never jumps as its contents change; a long column
              scrolls inside itself. */}
          <section
            aria-label="Plan details"
            style={{ height: PANEL_HEADER_HEIGHT + 1 + DETAILS_HEIGHT }}
            className="grid shrink-0 grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
          >
            <div className={cn(COLUMN, "flex flex-col")}>
              <div
                style={{ height: PANEL_HEADER_HEIGHT + 1, paddingInline: TOGGLE_INSET }}
                className="flex shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800"
              >
                {/* A collapsed side panel's toggle sits in this row's corner,
                    at the same spot it has in the side panel's own header. */}
                {!panels.open.left && (
                  <PanelToggle id="tools-panel" side="left" open={false} onToggle={() => panels.toggle("left")} />
                )}
                <HistoryControls
                  canUndo={history.past.length > 0}
                  canRedo={history.future.length > 0}
                  onUndo={() => dispatch({ type: "undo" })}
                  onRedo={() => dispatch({ type: "redo" })}
                />
                {/* The plan's name, as tall as the buttons beside it. It
                    takes the rest of the row, up to 256px. */}
                <input
                  autoComplete="off"
                  className={cn(nameBox, FIELD_FOCUS, "h-[30px] max-w-64 min-w-0 flex-1 px-2 text-sm font-medium")}
                  aria-label="Chart name"
                  value={state.chart.name}
                  onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PlanInfoPanel {...panelProps} />
              </div>
            </div>
            <div className={cn(COLUMN, "overflow-y-auto")}>
              <DetailsPanel key={state.selectedId ?? `term-${state.selectedTerm}`} {...panelProps} />
            </div>
            {/* The selected course's or term's problems first, since
                they're about what's in Selected, just to the left, then the
                plan's as a whole. */}
            <div className={cn(COLUMN, SCROLLING)}>
              <IssuesPanel
                issues={[
                  ...selectionIssues(view.chart, view.check.issues, state.selectedId, state.selectedTerm).map(
                    (issue) => ({ issue }),
                  ),
                  ...listPlanIssues(panelProps),
                ]}
                {...panelProps}
              />
            </div>
            {/* Credit meters and exceptions. The title row stays put and
                the meters scroll. */}
            <div className={cn(COLUMN, SCROLLING)}>
              <SummaryPanel {...panelProps} />
            </div>
          </section>
          <div className="min-h-0 flex-1">
            <ChartFlow
              catalog={state.school.catalog}
              chart={shownChart}
              issues={view.check.issues}
              creditsByTerm={view.check.report.creditsByTerm}
              maxCredits={view.requirements.maxCreditsPerTerm}
              requiredGrades={view.requirements.minGrades}
              selectedId={state.selectedId}
              onMove={(objectId, termIndex, position) => dispatch({ type: "move", objectId, termIndex, position })}
              layoutVersion={state.layoutVersion}
              planVersion={state.chart}
              onSelect={(objectId) => dispatch({ type: "select", objectId })}
              selectedTerm={state.selectedTerm}
              onSelectTerm={(termIndex) => dispatch({ type: "selectTerm", termIndex })}
              onRemove={(objectId) => dispatch({ type: "remove", objectId })}
              onTermChange={(change) => {
                // Showing or hiding Pre-Credit only changes the picture, so
                // it's a panel setting rather than a change to the plan.
                if (change.type === "showPreCredit" || change.type === "hidePreCredit") {
                  if (panels.open.preCredit !== (change.type === "showPreCredit")) panels.toggle("preCredit");
                } else dispatch(change);
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

// How tall the panel above the chart is, under the side panel header's
// height: the plan's details column, and the rest of every other column.
const DETAILS_HEIGHT = 192;
// A column of the panel above the chart. The panel is a grid of four
// exactly equal columns (grid-cols-4), each line drawn inside its column,
// so the lines fall on exact quarters of the chart's width: where a term's
// edge is at a quarter too (e.g. 4 or 8 terms), the two line up. min-h-0
// lets a column be shorter than its contents, so it scrolls instead.
const COLUMN = "min-h-0 min-w-0";
// A column whose panel's list shrinks and scrolls inside the column's
// fixed height, while the panel's title row stays.
const SCROLLING = "flex min-h-0 flex-col *:flex *:min-h-0 *:flex-1 *:flex-col";
