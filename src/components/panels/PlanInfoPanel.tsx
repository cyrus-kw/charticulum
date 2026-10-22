"use client";

import { EXTERNAL_TERM, type Chart } from "../../engine/index";
import { ResetIcon } from "../icons";
import { askToConfirm } from "../ConfirmDialog";
import { cn, ICON_BUTTON, Panel, TOOLBAR_BUTTON_SIZE } from "../ui";
import { ProgramMenu } from "./ProgramMenu";
import { SaveButtons } from "./SaveButtons";
import type { PanelProps } from "./types";

// What this plan is, at a glance: its school, its programs, the terms it
// spans, how many courses are on it, and its GPA. Sits under undo/redo and the
// plan's name in the panel above the chart. Its title row holds the
// programs menu, the save button, and Build for me.
export function PlanInfoPanel({
  unsaved,
  onSaved,
  ...props
}: PanelProps & {
  // Passed on to the save buttons.
  unsaved: boolean;
  onSaved: (chart: Chart) => void;
}) {
  const { state, view, dispatch } = props;
  const { library, data } = state.school;
  const pinned = state.chart.pinnedTemplates ?? [];
  // Pre-Credit isn't a term the student takes, so it's left out.
  const terms = state.chart.terms.filter((t) => t.index !== EXTERNAL_TERM);
  const courses = terms.reduce((total, t) => total + t.objectIds.length, 0);
  const span =
    terms.length === 0
      ? "None yet"
      : terms.length === 1
        ? terms[0].label
        : `${terms[0].label} – ${terms.at(-1)!.label}`;

  // GPA in color: green when it's fine (3.45), red under the program's
  // minimum, where it also says what the minimum is ("1.80 (min 2.00)").
  // Until there are grades there's no GPA yet, so it's a grey dash.
  const { gpa } = view.check.report;
  const { minGpa } = view.requirements;
  const below = minGpa !== undefined && gpa !== undefined && gpa < minGpa;

  // A row: a grey label, then its value. Long values cut short with "…".
  const row = (label: string, value: string, detail?: string) => (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 truncate" data-tooltip={value.length > 30 ? value : undefined}>
        {value}
        {detail && <span className="text-zinc-500"> · {detail}</span>}
      </dd>
    </>
  );

  return (
    <Panel
      title="Plan"
      actions={
        <div className="flex items-center gap-1">
          <ProgramMenu {...props} />
          <SaveButtons {...props} unsaved={unsaved} onSaved={onSaved} />
          {/* The builder lays out every course of the plan's programs so all
              their rules are met, replacing the current plan (undo brings
              it back, but it asks first since it changes everything at
              once). */}
          <button
            type="button"
            aria-label="Build for me"
            data-tooltip="Build for me"
            onClick={async () => {
              const message = "Replace the current plan with one the builder lays out?";
              if (await askToConfirm({ message, confirmLabel: "Replace" })) dispatch({ type: "build" });
            }}
            style={TOOLBAR_BUTTON_SIZE}
            className={ICON_BUTTON}
          >
            <ResetIcon />
          </button>
        </div>
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {row("School", data.school.name)}
        {pinned.length === 0
          ? row("Program", "None yet")
          : pinned.map((ref) => {
              const template = library.find((t) => t.code === ref.templateId && t.version === ref.version);
              return (
                <div key={`${ref.templateId}@${ref.version}`} className="contents">
                  {row("Program", template?.title ?? ref.templateId, ref.version)}
                </div>
              );
            })}
        {row("Terms", span, `${terms.length} ${terms.length === 1 ? "term" : "terms"}`)}
        {row("Courses", `${courses} ${courses === 1 ? "course" : "courses"}`)}
        <dt className="text-zinc-500">GPA</dt>
        <dd
          className={cn(
            "tabular-nums",
            below
              ? "text-rose-700 dark:text-rose-400"
              : gpa === undefined
                ? "text-zinc-500"
                : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {`${gpa === undefined ? "–" : gpa.toFixed(2)}${below ? ` (min ${minGpa.toFixed(2)})` : ""}`}
        </dd>
      </dl>
    </Panel>
  );
}
