"use client";

import { CATEGORY_NAMES, type Category, type Override } from "../../engine/index";
import { Badge, Button, cn, Panel } from "../ui";
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

// Progress toward every requirement, and the exceptions in effect. GPA
// stays in the title row; the meters and exceptions below it scroll when
// the box is capped in height (see the Requirements box in Planner.tsx).
export function SummaryPanel({ state, view, dispatch }: PanelProps) {
  const { report, appliedOverrides } = view.check;
  const { requirements } = view;
  const minimums = Object.entries(requirements.minCreditsByCategory) as [Category, number][];
  const overrides = state.chart.overrides ?? [];

  // GPA sits in the title row, its number a tag: green when it's fine (3.45),
  // red under the minimum, where it also says what the minimum is
  // ("1.80 (min 2.00)"). Until there are grades there's no GPA yet, so
  // it's a grey tag with a dash.
  const { minGpa } = requirements;
  const below = minGpa !== undefined && report.gpa !== undefined && report.gpa < minGpa;
  const gpa = report.gpa === undefined ? "–" : report.gpa.toFixed(2);

  return (
    <Panel
      title="Requirements"
      actions={
        (minGpa !== undefined || report.gpa !== undefined) && (
          // "GPA" in the panel title's small capitals, but regular weight
          // and in the main text color (white in dark mode), then the
          // number as a tag.
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-normal tracking-wide text-ink uppercase dark:text-zinc-100">GPA</span>
            <Badge tone={below ? "bad" : report.gpa === undefined ? "neutral" : "good"}>
              {`${gpa}${below ? ` (min ${minGpa.toFixed(2)})` : ""}`}
            </Badge>
          </span>
        )
      }
    >
      {/* The meters scroll, the same way as the Issues list: it reaches into
          the panel's right padding (-mr-4) and puts it back (pr-4), so the
          scrollbar sits by the box's edge without covering any words. */}
      <div className="-mr-4 min-h-0 overflow-y-auto pr-4">
        <div className="space-y-2">
          <Meter label="Total Credits" value={report.totalCredits} target={requirements.minTotalCredits} />
          {minimums.map(([category, minimum]) => (
            <Meter key={category} label={CATEGORY_NAMES[category]} value={report.creditsByCategory[category] ?? 0} target={minimum} />
          ))}
          {requirements.maxSharedCredits !== undefined && (
            <div className="flex justify-between text-sm">
              <span>Shared Credits</span>
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
      </div>
    </Panel>
  );
}
