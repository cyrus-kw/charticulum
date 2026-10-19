"use client";

import { useEffect, useMemo, useReducer, useState, type MouseEvent } from "react";
import Link from "next/link";
import { EXTERNAL_TERM, loadSchool, type SchoolData } from "../engine/index";
import { historyReducer, startHistory } from "../planner/history";
import { derive, openedState } from "../planner/state";
import type { SavedChart } from "../storage/types";
import { ChartFlow } from "./ChartFlow";
import { OpenIcon } from "./icons";
import { CatalogPanel } from "./panels/CatalogPanel";
import { DetailsPanel } from "./panels/DetailsPanel";
import { IssuesPanel, listPlanIssues, type ListedIssue } from "./panels/IssuesPanel";
import type { PanelProps } from "./panels/types";
import { selectionIssues } from "../planner/issues";
import { ExternalCreditPanel } from "./panels/ExternalCreditPanel";
import { ProgramPanel } from "./panels/ProgramPanel";
import { SavePanel } from "./panels/SavePanel";
import { SchoolPanel } from "./panels/SchoolPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { cn, FIELD_FOCUS, Tabs } from "./ui";
import { HEADER_BUTTON, PANEL_HEADER_HEIGHT, PanelToggle, SidePanel, TOGGLE_SIZE } from "./SidePanel";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu, type MenuUser } from "./UserMenu";
import { usePanels } from "./usePanels";

// A box lying on the chart, in the same style as its other controls. The
// box's own border closes off the panel inside.
const chartBox =
  "rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

// The planner for one saved chart. The page loads the chart and its
// school's data on the server and hands them over.
export function Planner({
  school: schoolData,
  saved,
  user,
}: {
  school: SchoolData;
  saved: SavedChart;
  // Who's signed in, shown at the bottom of the side panel.
  user: MenuUser;
}) {
  // useReducer holds the planner state; dispatch(action) updates it.
  // The third argument builds the first state once, on first render.
  // The planner state, with undo/redo history around it.
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    startHistory(openedState(loadSchool(schoolData), saved.chart, saved.id)),
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

        <main className="min-h-0 min-w-0 flex-1" aria-label="Chart">
          <ChartFlow
            catalog={state.school.catalog}
            chart={shownChart}
            issues={view.check.issues}
            creditsByTerm={view.check.report.creditsByTerm}
            maxCredits={view.requirements.maxCreditsPerTerm}
            selectedId={state.selectedId}
            onMove={(objectId, termIndex, position) => dispatch({ type: "move", objectId, termIndex, position })}
            layoutVersion={state.layoutVersion}
            planVersion={state.chart}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onUndo={() => dispatch({ type: "undo" })}
            onRedo={() => dispatch({ type: "redo" })}
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
            // A collapsed side panel's toggle floats on the chart, at the same
            // spot it had in the side panel's corner.
            topLeft={
              !panels.open.left && (
                <PanelToggle id="tools-panel" side="left" open={false} onToggle={() => panels.toggle("left")} />
              )
            }
            // The plan's name, beside undo/redo. As tall as those buttons; up
            // to 256px wide, shrinking (to 128px at least) when the boxes on
            // the right need the room.
            title={
              <input
                autoComplete="off"
                className={cn(chartBox, FIELD_FOCUS, "h-[30px] w-64 min-w-32 shrink px-2 text-sm font-medium")}
                aria-label="Chart name"
                value={state.chart.name}
                onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
              />
            }
            // On the chart's top right, left to right: the selected course
            // or term, and the requirements. Separate boxes, the same width,
            // so they're evenly spaced and shrink alike. Each box widens
            // with an Issues column on its right while it has problems: the
            // selected course's or term's, and the plan's.
            topRight={
              <>
                <div className={cn(chartBox, BOX_WITH_ISSUES)}>
                  <div className="w-64 min-w-0">
                    <DetailsPanel key={state.selectedId ?? `term-${state.selectedTerm}`} {...panelProps} />
                  </div>
                  <IssuesColumn
                    issues={selectionIssues(view.chart, view.check.issues, state.selectedId, state.selectedTerm).map(
                      (issue) => ({ issue }),
                    )}
                    {...panelProps}
                  />
                </div>
                {/* Credit meters, GPA, and exceptions. Columns all the way
                    down (the column, then the panel inside it), so when the
                    box is capped in height, GPA stays put and the meters
                    scroll. */}
                <div className={cn(chartBox, BOX_WITH_ISSUES)}>
                  <div className={cn(SCROLLING_COLUMN, "w-64")}>
                    <SummaryPanel {...panelProps} />
                  </div>
                  <IssuesColumn issues={listPlanIssues(panelProps)} {...panelProps} />
                </div>
              </>
            }
          />
        </main>
      </div>
    </div>
  );
}

// A box on the chart with an Issues column on its right. Two boxes with
// their Issues columns (4 × 256px), beside undo/redo and the plan's name,
// need about 1280px of chart; on a narrower chart (the width is measured
// by the "@container" in ChartFlow.tsx) the issues go on top of the box's
// details instead (a column, with the issues moved first by order-first;
// a reversed column would start scrolled to its bottom), so the box keeps
// its usual width and its problems are the first thing in it.
const BOX_WITH_ISSUES = "flex @max-[1280px]:flex-col";
// A column whose panel's list shrinks and scrolls when the box is capped
// in height, while the panel's title row stays. Where the issues sit on
// top (see BOX_WITH_ISSUES), the parts don't shrink (shrink-0): the whole
// box scrolls instead, so neither part is squeezed out of sight.
const SCROLLING_COLUMN = "flex min-h-0 min-w-0 flex-col *:flex *:min-h-0 *:flex-col @max-[1280px]:shrink-0";

// The Issues column on a box's right, joined to it by a line (below it
// instead where the issues sit on top). Left out when there are no issues.
function IssuesColumn({ issues, ...props }: PanelProps & { issues: ListedIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div
      className={cn(
        SCROLLING_COLUMN,
        "w-64 border-l border-zinc-200 dark:border-zinc-800 @max-[1280px]:order-first @max-[1280px]:border-b @max-[1280px]:border-l-0",
      )}
    >
      <IssuesPanel issues={issues} {...props} />
    </div>
  );
}
