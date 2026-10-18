"use client";

// The small menus for changing a chart's terms:
// - AddTermMenu opens from a + between two term headers (or at either end
//   of the chart): add a winter, spring, summer, or fall semester there, or
//   bring back the Pre-Credit column at the left end. A semester that
//   wouldn't fit there (see termBeside) is greyed out, and pointing at it
//   says why.
// - TermMenu opens when a term's column is right-clicked: remove it.
import { useEffect, type ReactNode } from "react";
import { EXTERNAL_TERM, type Chart, type Season } from "../engine/index";
import { canRemoveTerm, termBeside, type TermSide } from "../planner/state";
import { cn, SEASON_TINT } from "./ui";

export type TermChange =
  | { type: "insertTerm"; termIndex: number; side: TermSide; season: Season }
  | { type: "removeTerm"; termIndex: number }
  // Show or hide the Pre-Credit column (its credit counts either way).
  | { type: "showPreCredit" }
  | { type: "hidePreCredit" };

// In calendar order (winter is January).
const SEASONS: Season[] = ["winter", "spring", "summer", "fall"];

// A place a new term can go: right after one term and right before the
// next (by term number). `after` is null at the chart's left end (or right
// after Pre-Credit), `before` is null at its right end.
export type TermGap = { after: number | null; before: number | null };

// What adding `season` in a gap would do: the new term, or why it can't.
function seasonInGap(chart: Chart, gap: TermGap, season: Season) {
  const change: TermChange =
    gap.after !== null
      ? { type: "insertTerm", termIndex: gap.after, side: "after", season }
      : { type: "insertTerm", termIndex: gap.before!, side: "before", season };
  const beside = termBeside(chart, change.termIndex, change.side, season);
  return { change, beside };
}

// Pre-Credit can be brought back at the chart's left end when it's hidden.
const offersPreCredit = (chart: Chart, gap: TermGap) =>
  gap.after === null && !chart.terms.some((t) => t.index === EXTERNAL_TERM);

// Is there anything to add in this gap? (If not, it gets no +.)
export function canAddInGap(chart: Chart, gap: TermGap): boolean {
  return offersPreCredit(chart, gap) || SEASONS.some((season) => "term" in seasonInGap(chart, gap, season).beside);
}

// A box floating at (x, y) in window pixels, kept on screen. Clicking
// anywhere outside it, or pressing Escape, closes it.
function Popover({
  x,
  y,
  width,
  height,
  label,
  onClose,
  children,
}: {
  x: number;
  y: number;
  // Its size, used to keep it on screen near the window's edges.
  width: number;
  height: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* An invisible layer over the page, so a click outside closes it. */}
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        aria-label={label}
        className="fixed z-50 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        style={{
          width,
          left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
          top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
        }}
      >
        {children}
      </div>
    </>
  );
}

// The add menu's width (pixels), so the chart can keep it beside the +.
export const ADD_MENU_WIDTH = 230;

// What can go in a gap: one button per season, and Pre-Credit at the left
// end when it's hidden.
export function AddTermMenu({
  chart,
  gap,
  x,
  y,
  onChange,
  onClose,
}: {
  chart: Chart;
  gap: TermGap;
  // Where to show it (window pixels): its top edge, centered on x.
  x: number;
  y: number;
  onChange: (change: TermChange) => void;
  onClose: () => void;
}) {
  const width = ADD_MENU_WIDTH;
  const label = (index: number | null) => chart.terms.find((t) => t.index === index)?.label;
  const [before, after] = [label(gap.after), label(gap.before)];
  const heading = before && after ? `Add between ${before} and ${after}` : before ? `Add after ${before}` : `Add before ${after}`;
  const choose = (change: TermChange) => {
    onChange(change);
    onClose();
  };
  return (
    <Popover x={x - width / 2} y={y} width={width} height={140} label="Add a semester" onClose={onClose}>
      <div className="px-3 pt-1 pb-1 text-xs text-zinc-500 dark:text-zinc-400">{heading}</div>
      <div className="grid grid-cols-2 gap-1 px-2 pb-1.5">
        {offersPreCredit(chart, gap) && (
          <button
            type="button"
            role="menuitem"
            data-tooltip="Show the Pre-Credit column (AP exams, transfer courses)"
            onClick={() => choose({ type: "showPreCredit" })}
            className="col-span-2 rounded bg-sky-50 px-2 py-1 text-left text-xs text-zinc-800 hover:brightness-95 dark:bg-sky-950/40 dark:text-zinc-100 dark:hover:brightness-125"
          >
            Pre-Credit
          </button>
        )}
        {SEASONS.map((season) => {
          const { change, beside } = seasonInGap(chart, gap, season);
          const fits = "term" in beside;
          return (
            <button
              key={season}
              type="button"
              role="menuitem"
              disabled={!fits}
              data-tooltip={fits ? `Add ${beside.term.label}` : beside.reason}
              onClick={() => choose(change)}
              className={cn(
                "truncate rounded px-2 py-1 text-left text-xs text-zinc-800 dark:text-zinc-100",
                SEASON_TINT[season],
                fits ? "hover:brightness-95 dark:hover:brightness-125" : "cursor-not-allowed opacity-35",
              )}
            >
              {fits ? beside.term.label : season[0].toUpperCase() + season.slice(1)}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

// The menu a right-clicked term's column opens.
export function TermMenu({
  chart,
  termIndex,
  x,
  y,
  onChange,
  onClose,
}: {
  chart: Chart;
  termIndex: number;
  // Where it was right-clicked (window pixels).
  x: number;
  y: number;
  onChange: (change: TermChange) => void;
  onClose: () => void;
}) {
  const term = chart.terms.find((t) => t.index === termIndex);
  if (!term) return null;
  // Removing Pre-Credit only hides its column; a + at the chart's left end
  // brings it back.
  const preCredit = termIndex === EXTERNAL_TERM;
  const removable = preCredit || canRemoveTerm(chart, termIndex);
  return (
    <Popover x={x} y={y} width={200} height={50} label={`${term.label} options`} onClose={onClose}>
      <button
        type="button"
        role="menuitem"
        disabled={!removable}
        data-tooltip={
          preCredit
            ? "Hides the column; your AP and transfer credit still counts."
            : removable
              ? "Its courses come off the chart (undo brings them back)."
              : "The only semester can't be removed."
        }
        onClick={() => {
          onChange(preCredit ? { type: "hidePreCredit" } : { type: "removeTerm", termIndex });
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-zinc-400 disabled:hover:bg-transparent dark:text-rose-400 dark:hover:bg-rose-950 dark:disabled:text-zinc-600"
      >
        Remove {term.label}
      </button>
    </Popover>
  );
}
