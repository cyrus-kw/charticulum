"use client";

import type { Category, Override } from "../../engine/index";
import { Button, cn, Panel } from "../ui";
import type { PanelProps } from "./types";

function Meter({ label, value, target, format = String }: { label: string; value: number; target: number; format?: (n: number) => string }) {
  const met = value >= target;
  const percent = target === 0 ? 100 : Math.min(100, (value / target) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={cn("tabular-nums", !met && "text-rose-700 dark:text-rose-400")}>
          {format(value)} / {format(target)}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800" role="presentation">
        <div
          className={cn("h-full rounded-full", met ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function describe(override: Override): string {
  switch (override.kind) {
    case "waive-requirement":
      return `${override.objectId} not required`;
    case "waive-requisite":
      return `${override.objectId} doesn't need ${override.requisiteId}`;
    case "substitute":
      return `${override.substituteId} counts as ${override.objectId}`;
  }
}

// Progress toward every requirement, and the exceptions in effect.
export function SummaryPanel({ state, view, dispatch }: PanelProps) {
  const { report, appliedOverrides } = view.check;
  const { requirements } = view;
  const minimums = Object.entries(requirements.minCreditsByCategory) as [Category, number][];
  const overrides = state.chart.overrides ?? [];

  return (
    <Panel title="Requirements">
      <div className="space-y-2">
        <Meter label="Total credits" value={report.totalCredits} target={requirements.minTotalCredits} />
        {minimums.map(([category, minimum]) => (
          <Meter key={category} label={category} value={report.creditsByCategory[category] ?? 0} target={minimum} />
        ))}
        {requirements.minGpa !== undefined && (
          <div className="flex justify-between text-sm">
            <span>GPA</span>
            <span className="tabular-nums">
              {report.gpa === undefined ? "no grades yet" : report.gpa.toFixed(2)} (min {requirements.minGpa.toFixed(2)})
            </span>
          </div>
        )}
        {requirements.maxSharedCredits !== undefined && (
          <div className="flex justify-between text-sm">
            <span>Shared credits</span>
            <span
              className={cn(
                "tabular-nums",
                report.sharedCredits > requirements.maxSharedCredits && "text-rose-700 dark:text-rose-400",
              )}
            >
              {report.sharedCredits} (max {requirements.maxSharedCredits})
            </span>
          </div>
        )}
      </div>

      {overrides.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-semibold text-zinc-500">Exceptions</h3>
          <ul className="space-y-1 text-sm">
            {overrides.map((o) => {
              const active = appliedOverrides.some((a) => a.id === o.id);
              return (
                <li key={o.id} className="flex items-start justify-between gap-2">
                  <span>
                    {describe(o)}
                    <span className="block text-xs text-zinc-500">
                      {o.reason}
                      {!active && " · not in effect"}
                    </span>
                  </span>
                  <Button variant="danger" onClick={() => dispatch({ type: "removeOverride", id: o.id })}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
