"use client";

import { useEffect, useMemo, useReducer } from "react";
import Link from "next/link";
import { EXTERNAL_TERM, loadSchool } from "../engine/index";
import { loadSampleSchool } from "../fixtures/sampleSchool";
import { historyReducer, startHistory } from "../planner/history";
import { derive, initialState } from "../planner/state";
import { recallSchool } from "../storage/schoolMemory";
import { ChartFlow } from "./ChartFlow";
import { MoonIcon, OpenIcon, SunIcon } from "./icons";
import { CatalogPanel } from "./panels/CatalogPanel";
import { DetailsPanel } from "./panels/DetailsPanel";
import { ExternalCreditPanel } from "./panels/ExternalCreditPanel";
import { IssuesPanel } from "./panels/IssuesPanel";
import { ProgramPanel } from "./panels/ProgramPanel";
import { SavePanel } from "./panels/SavePanel";
import { SchoolPanel } from "./panels/SchoolPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { Button, cn } from "./ui";
import { HEADER_BUTTON, PanelToggle, SidePanel, TOGGLE_SIZE } from "./SidePanel";
import { setTheme, useTheme } from "./theme";
import { usePanels } from "./usePanels";

// A box lying on the chart, in the same style as its other controls. The
// box's own border closes off the panel inside.
const chartBox =
  "rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export function Planner() {
  // useReducer holds the planner state; dispatch(action) updates it.
  // The third argument builds the first state once, on first render.
  // The planner state, with undo/redo history around it.
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    startHistory(initialState(loadSampleSchool(), "bs-cs")),
  );
  const state = history.present;

  // Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Not while typing
  // in a text box, where those keys edit the text.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
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

  // After the page loads, switch to a school this browser imported before.
  // (Browser storage doesn't exist on the server, so this can't happen in
  // the first render; doing it there would make server and browser disagree.)
  useEffect(() => {
    const remembered = recallSchool();
    if (remembered) dispatch({ type: "loadSchool", school: loadSchool(remembered) });
  }, []);
  // Recompute the checks only when the state actually changes.
  // Only the school and chart feed `derive` (see its comment for why).
  const { school, chart } = state;
  const view = useMemo(() => derive({ school, chart }), [school, chart]);
  const panelProps = { state, view, dispatch };
  // Remount panels when the school changes so their local inputs reset.
  const schoolKey = state.school.data.school.id;
  const panels = usePanels();
  const theme = useTheme();
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
        {/* Sidebars resize by dragging their inner edge, which also widens
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
            // far right, framing the wordmark with the sidebar button.
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div>
                <h1 className="text-base leading-tight font-semibold">Charticulum</h1>
                <p className="text-xs text-zinc-500">Chart your curriculum</p>
              </div>
              {/* Link (not <a>) moves to the page without reloading the app. */}
              <Link
                href="/dashboard"
                aria-label="Open dashboard"
                title="Open dashboard"
                style={{ width: TOGGLE_SIZE, height: TOGGLE_SIZE }}
                className={HEADER_BUTTON}
              >
                <OpenIcon />
              </Link>
            </div>
          }
        >
          <SavePanel {...panelProps} />
          <ProgramPanel {...panelProps} />
          <ExternalCreditPanel {...panelProps} />
          <CatalogPanel {...panelProps} />
          <SchoolPanel {...panelProps} />
        </SidePanel>

        <main className="min-h-[50dvh] min-w-0 flex-1" aria-label="Chart">
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
            // A collapsed sidebar's toggle floats on the chart, at the same
            // spot it had in the sidebar's corner.
            topLeft={
              !panels.open.left && (
                <PanelToggle id="tools-panel" title="Tools" side="left" open={false} onToggle={() => panels.toggle("left")} />
              )
            }
            // The plan's name, beside undo/redo. As tall as those buttons.
            title={
              <input
                autoComplete="off"
                className={cn(chartBox, "h-[30px] w-64 px-2 text-sm font-medium")}
                aria-label="Chart name"
                value={state.chart.name}
                onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
              />
            }
            // Plan-wide buttons, above the boxes on the right. The same
            // height as the chart's other buttons.
            toolbar={
              <>
                <Button
                  className="h-[30px]"
                  aria-pressed={panels.open.preCredit}
                  onClick={() => panels.toggle("preCredit")}
                >
                  {panels.open.preCredit ? "Hide Pre-Credit" : "Show Pre-Credit"}
                </Button>
                <Button className="h-[30px]" onClick={() => dispatch({ type: "addTerm" })}>
                  Add term
                </Button>
                <Button
                  className="h-[30px]"
                  variant="primary"
                  onClick={() => {
                    if (window.confirm("Replace the current plan with one the builder lays out?")) dispatch({ type: "build" });
                  }}
                >
                  Build for me
                </Button>
                {/* Shows the mode it switches to: a moon in light mode, a sun in dark. */}
                <Button
                  className="h-[30px]"
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  title={theme === "dark" ? "Light mode" : "Dark mode"}
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                </Button>
              </>
            }
            // On the chart's top right, left to right: the selected course,
            // the plan's issues, its requirements. Separate boxes, all the
            // same width, so they're evenly spaced and shrink alike.
            topRight={
              <>
                <div className={cn(chartBox, "w-72")}>
                  <DetailsPanel key={state.selectedId ?? "none"} {...panelProps} />
                </div>
                <div className={cn(chartBox, "w-72")}>
                  <IssuesPanel {...panelProps} />
                </div>
                <div className={cn(chartBox, "w-72")}>
                  <SummaryPanel {...panelProps} />
                </div>
              </>
            }
          />
        </main>
      </div>
    </div>
  );
}
