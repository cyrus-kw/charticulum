"use client";

import { useMemo, useReducer } from "react";
import { loadSchool, parseSchoolData } from "../engine/index";
import { sampleSchoolData } from "../fixtures/sampleSchool";
import { derive, initialState, plannerReducer } from "../planner/state";
import { ChartFlow } from "./ChartFlow";
import { CatalogPanel } from "./panels/CatalogPanel";
import { DetailsPanel } from "./panels/DetailsPanel";
import { ExternalCreditPanel } from "./panels/ExternalCreditPanel";
import { IssuesPanel } from "./panels/IssuesPanel";
import { ProgramPanel } from "./panels/ProgramPanel";
import { SavePanel } from "./panels/SavePanel";
import { SchoolPanel } from "./panels/SchoolPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { Button, inputClass } from "./ui";

function sampleSchool() {
  const parsed = parseSchoolData(sampleSchoolData);
  if (!parsed.ok) throw new Error(`Sample school data is invalid:\n${parsed.errors.join("\n")}`);
  return loadSchool(parsed.data);
}

export function Planner() {
  // useReducer holds the planner state; dispatch(action) updates it.
  // The third argument builds the first state once, on first render.
  const [state, dispatch] = useReducer(plannerReducer, undefined, () => initialState(sampleSchool(), "bs-cs"));
  // Recompute the checks only when the state actually changes.
  const view = useMemo(() => derive(state), [state]);
  const panelProps = { state, view, dispatch };
  // Remount panels when the school changes so their local inputs reset.
  const schoolKey = state.school.data.school.id;

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
        <aside
          key={`left-${schoolKey}`}
          className="max-h-[40dvh] overflow-y-auto border-zinc-200 lg:max-h-none lg:w-80 lg:shrink-0 lg:border-r dark:border-zinc-800"
        >
          <SavePanel {...panelProps} />
          <ProgramPanel {...panelProps} />
          <ExternalCreditPanel {...panelProps} />
          <CatalogPanel {...panelProps} />
          <SchoolPanel {...panelProps} />
        </aside>

        <main className="min-h-[50dvh] flex-1" aria-label="Chart">
          <ChartFlow
            catalog={state.school.catalog}
            chart={view.chart}
            issues={view.check.issues}
            creditsByTerm={view.check.report.creditsByTerm}
            maxCredits={view.requirements.maxCreditsPerTerm}
            selectedId={state.selectedId}
            onMove={(objectId, termIndex) => dispatch({ type: "move", objectId, termIndex })}
            onSelect={(objectId) => dispatch({ type: "select", objectId })}
          />
        </main>

        <aside className="overflow-y-auto border-zinc-200 lg:w-96 lg:shrink-0 lg:border-l dark:border-zinc-800">
          <DetailsPanel key={state.selectedId ?? "none"} {...panelProps} />
          <IssuesPanel {...panelProps} />
          <SummaryPanel {...panelProps} />
        </aside>
      </div>
    </div>
  );
}
