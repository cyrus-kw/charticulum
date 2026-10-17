"use client";

import type { Category, Override } from "../../engine/index";
import type { ReactNode } from "react";
import { CheckIcon } from "../icons";
import { Badge, Button, CATEGORY_LABELS, cn, Panel } from "../ui";
import type { PanelProps } from "./types";

// One requirement on one line: label, a short progress bar, and the count.
// Met ones stay quiet (grey, with a tick); only unmet ones get color.
function Meter({ label, value, target }: { label: string; value: number; target: number }) {
  const met = value >= target;
  const percent = target === 0 ? 100 : Math.min(100, (value / target) * 100);
  return (
    <>
      <span className={cn(met && "text-zinc-500 dark:text-zinc-400")}>{label}</span>
      <div className="h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" role="presentation">
        <div
          className={cn("h-full rounded-full", met ? "bg-zinc-400 dark:bg-zinc-600" : "bg-amber-500")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          "flex items-center justify-end gap-1 tabular-nums",
          met ? "text-zinc-500 dark:text-zinc-400" : "text-rose-700 dark:text-rose-400",
        )}
      >
        {value}/{target}
        {met ? <CheckIcon size={12} /> : <span className="w-3" />}
      </span>
    </>
  );
}

// A requirement without a bar (GPA, shared credits), on the same grid.
function Fact({ label, children, bad = false }: { label: string; children: ReactNode; bad?: boolean }) {
  return (
    <>
      <span className={cn(!bad && "text-zinc-500 dark:text-zinc-400")}>{label}</span>
      <span
        className={cn(
          "col-span-2 text-right tabular-nums",
          bad ? "text-rose-700 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400",
        )}
      >
        {children}
      </span>
    </>
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

  const issueCount = view.check.issues.length + view.templateIssues.length + state.builderIssues.length;
  const gpaLow = requirements.minGpa !== undefined && report.gpa !== undefined && report.gpa < requirements.minGpa;

  return (
    <Panel
      title="Requirements"
      // With no issues, the Issues section is hidden; this says so instead.
      actions={
        issueCount === 0 && (
          <Badge tone="good">
            <span className="flex items-center gap-1">
              <CheckIcon size={12} />
              All clear
            </span>
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-[1fr_4rem_auto] items-center gap-x-3 gap-y-1.5 text-sm">
        <Meter label="Total credits" value={report.totalCredits} target={requirements.minTotalCredits} />
        {minimums.map(([category, minimum]) => (
          <Meter
            key={category}
            label={CATEGORY_LABELS[category]}
            value={report.creditsByCategory[category] ?? 0}
            target={minimum}
          />
        ))}
        {requirements.minGpa !== undefined && (
          <Fact label="GPA" bad={gpaLow}>
            {report.gpa === undefined ? "no grades yet" : report.gpa.toFixed(2)} (min {requirements.minGpa.toFixed(2)})
          </Fact>
        )}
        {requirements.maxSharedCredits !== undefined && (
          <Fact label="Shared credits" bad={report.sharedCredits > requirements.maxSharedCredits}>
            {report.sharedCredits} (max {requirements.maxSharedCredits})
          </Fact>
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
