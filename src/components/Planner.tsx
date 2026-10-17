"use client";

import { useEffect, useMemo, useReducer } from "react";
import { EXTERNAL_TERM, loadSchool } from "../engine/index";
import { loadSampleSchool } from "../fixtures/sampleSchool";
import { historyReducer, startHistory } from "../planner/history";
import { derive, initialState } from "../planner/state";
import { recallSchool } from "../storage/schoolMemory";
import { ChartFlow } from "./ChartFlow";
import { CatalogPanel } from "./panels/CatalogPanel";
import { DetailsPanel } from "./panels/DetailsPanel";
import { ExternalCreditPanel } from "./panels/ExternalCreditPanel";
import { IssuesPanel } from "./panels/IssuesPanel";
import { ProgramPanel } from "./panels/ProgramPanel";
import { SavePanel } from "./panels/SavePanel";
import { SchoolPanel } from "./panels/SchoolPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { Badge, Button, inputClass } from "./ui";
import { DetailsIcon, PanelIcon, SidePanel, ToolsIcon } from "./SidePanel";
import { usePanels } from "./usePanels";

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
  const view = useMemo(() => derive(state), [state]);
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
  const issueCount = view.check.issues.length + view.templateIssues.length + state.builderIssues.length;

  return (
    <div className="flex h-dvh flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="mr-2">
          <h1 className="text-base leading-tight font-semibold">Charticulum</h1>
          <p className="text-xs text-zinc-500">Chart your curriculum</p>
        </div>
        <input
          autoComplete="off"
          className={`${inputClass} w-64 max-w-full`}
          aria-label="Chart name"
          value={state.chart.name}
          onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button aria-pressed={panels.open.preCredit} onClick={() => panels.toggle("preCredit")}>
            {panels.open.preCredit ? "Hide Pre-Credit" : "Show Pre-Credit"}
          </Button>
          <Button onClick={() => dispatch({ type: "addTerm" })}>Add term</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (window.confirm("Replace the current plan with one the builder lays out?")) dispatch({ type: "build" });
            }}
          >
            Build for me
          </Button>
        </div>
      </header>

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
          icon={<ToolsIcon />}
          onToggle={() => panels.toggle("left")}
          onResize={(width, done) => panels.setWidth("left", width, done)}
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
            // Collapsed sidebars float as icons on the chart's top corners.
            topLeft={
              !panels.open.left && (
                <PanelIcon id="tools-panel" title="Tools" icon={<ToolsIcon />} onOpen={() => panels.toggle("left")} />
              )
            }
            topRight={
              !panels.open.right && (
                <PanelIcon
                  id="details-panel"
                  title="Details"
                  icon={<DetailsIcon />}
                  badge={issueCount > 0 ? <Badge tone="bad">{issueCount}</Badge> : undefined}
                  onOpen={() => panels.toggle("right")}
                />
              )
            }
          />
        </main>

        <SidePanel
          id="details-panel"
          title="Details"
          side="right"
          open={panels.open.right}
          width={panels.open.rightWidth}
          icon={<DetailsIcon />}
          onToggle={() => panels.toggle("right")}
          onResize={(width, done) => panels.setWidth("right", width, done)}
        >
          <DetailsPanel key={state.selectedId ?? "none"} {...panelProps} />
          <IssuesPanel {...panelProps} />
          <SummaryPanel {...panelProps} />
        </SidePanel>
      </div>
    </div>
  );
}
