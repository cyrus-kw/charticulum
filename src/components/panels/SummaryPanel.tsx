"use client";

import { CATEGORY_NAMES, creditRuleName, type Category, type Override } from "../../engine/index";
import { Button, cn, GroupHeading, Panel } from "../ui";
import type { PanelProps } from "./types";

function Meter({ label, value, target, format = String }: { label: string; value: number; target: number; format?: (n: number) => string }) {
  const met = value >= target;
  const percent = target === 0 ? 100 : Math.min(100, (value / target) * 100);
  return (
    <div>
      {/* The numbers never wrap; a long name wraps beside them instead. */}
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className={cn("whitespace-nowrap tabular-nums", !met && "text-rose-700 dark:text-rose-400")}>
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

// "30 / 45" at a group heading's right end, rose while short, like a
// meter's numbers.
function Count({ value, target }: { value: number; target: number }) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", value < target ? "text-rose-700 dark:text-rose-400" : "text-ink dark:text-zinc-100")}>
      {value} / {target}
    </span>
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

// Progress toward every requirement, and the exceptions in effect. The
// plan's problems show in the Issues column beside it (IssuesPanel), and
// GPA in Plan (PlanInfoPanel). The meters and exceptions scroll under the
// title within the column's fixed height (see the panel above the chart in
// Planner.tsx).
export function SummaryPanel({ state, view, dispatch }: PanelProps) {
  const { report, appliedOverrides } = view.check;
  const { requirements } = view;
  const minimums = Object.entries(requirements.minCreditsByCategory) as [Category, number][];
  const groups = requirements.creditRules ?? [];
  const overrides = state.chart.overrides ?? [];
  // A category minimum a group counts in its heading isn't shown again.
  const ungroupedMinimums = minimums.filter(([category]) => !groups.some((group) => group.category === category));

  const totalMet = report.totalCredits >= requirements.minTotalCredits;
  return (
    <Panel
      title="Requirements"
      toolbar
      // Total credits at the title row's right end, where Issues has its
      // count: the one number every plan has, so it's always in view.
      // Rose while short, like a meter's numbers. Just the numbers, on one
      // line (the column is narrow); pointing at them says what they are.
      actions={
        <span
          className={cn("text-sm whitespace-nowrap tabular-nums", !totalMet && "text-rose-700 dark:text-rose-400")}
          data-tooltip="Total credits"
        >
          {report.totalCredits} / {requirements.minTotalCredits}
        </span>
      }
    >
      {/* The meters scroll: this reaches into the panel's right padding
          (-mr-4) and puts it back (pr-4), so the scrollbar sits by the
          box's edge without covering any words. */}
      <div className="-mr-4 min-h-0 overflow-y-auto pr-4">
        {/* Meters that belong to no group (category minimums like Major)
            come first, so none of them looks like part of the group above
            it. Left out when empty, so the first group's heading sits right
            under the title, where Issues' first heading is. */}
        {(ungroupedMinimums.length > 0 || requirements.maxSharedCredits !== undefined) && (
          <div className="space-y-2">
            {ungroupedMinimums.map(([category, minimum]) => (
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
        )}

        {/* The program's groups of credit rules, in its order (General
            Education, Electives, Seminars): a heading with the group's
            credits at its right end, then a meter for each rule. */}
        {groups.map((group) => {
          // A group of one of the app's categories ("general-education") counts
          // that category's minimum when a set gives one (the sample
          // school's 12 gen ed credits). Otherwise it adds up its rules, each counted
          // only up to what it needs, so extra credits in one don't hide a
          // shortfall in another.
          const category = group.category in CATEGORY_NAMES ? (group.category as Category) : undefined;
          const minimum = category && requirements.minCreditsByCategory[category];
          const count =
            category && minimum !== undefined
              ? { value: report.creditsByCategory[category] ?? 0, target: minimum }
              : {
                  value: group.rules.reduce((sum, r) => sum + Math.min(report.creditsByRule[r.id] ?? 0, r.credits), 0),
                  target: group.rules.reduce((sum, r) => sum + r.credits, 0),
                };
          return (
            <section key={group.category} className="mt-3 first:mt-0">
              <GroupHeading end={<Count {...count} />}>{group.name}</GroupHeading>
              <div className="space-y-2">
                {group.rules.map((rule) => (
                  <Meter key={rule.id} label={creditRuleName(rule)} value={report.creditsByRule[rule.id] ?? 0} target={rule.credits} />
                ))}
              </div>
            </section>
          );
        })}

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
