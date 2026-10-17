"use client";

// A sidebar that can be resized by dragging its inner edge and collapsed to
// a floating icon on the chart (see PanelIcon). Its contents stay mounted
// while collapsed, so what's typed in them survives.
import { type ReactNode, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "./ui";
import { PANEL_COLLAPSE_BELOW, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from "./usePanels";

const KEY_STEP = 16;

export function SidePanel({
  id,
  title,
  side,
  open,
  width,
  icon,
  onToggle,
  onResize,
  children,
}: {
  id: string;
  title: string;
  side: "left" | "right";
  open: boolean;
  width: number;
  icon: ReactNode;
  onToggle: () => void;
  // `done` is true at the end of a drag (or a keyboard step).
  onResize: (width: number, done: boolean) => void;
  children: ReactNode;
}) {
  // Dragging the edge: wider toward the chart. Let go narrower than
  // PANEL_COLLAPSE_BELOW and it collapses instead.
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const widthFor = (x: number) => width + (side === "left" ? x - startX : startX - x);
    const body = document.body.style;
    const before = { userSelect: body.userSelect, cursor: body.cursor };
    body.userSelect = "none";
    body.cursor = "col-resize";
    const move = (e: globalThis.PointerEvent) => onResize(widthFor(e.clientX), false);
    const end = (e: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      body.userSelect = before.userSelect;
      body.cursor = before.cursor;
      const final = widthFor(e.clientX);
      if (final < PANEL_COLLAPSE_BELOW) {
        onResize(width, true); // reopen later at the width it had
        onToggle();
      } else {
        onResize(final, true);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const outward = side === "left" ? "ArrowRight" : "ArrowLeft";
    const inward = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (event.key === outward) onResize(width + KEY_STEP, true);
    else if (event.key === inward) onResize(width - KEY_STEP, true);
    else return;
    event.preventDefault();
  };

  const collapseLabel = `Collapse ${title.toLowerCase()}`;

  return (
    <div className={cn("flex min-h-0 shrink-0", side === "right" && "lg:flex-row-reverse")}>
      <aside
        id={id}
        hidden={!open}
        aria-label={title}
        style={{ ["--panel-w" as string]: `${width}px` }}
        className={cn(
          "max-h-[40dvh] overflow-y-auto border-zinc-200 lg:max-h-none lg:w-(--panel-w) dark:border-zinc-800",
          side === "left" ? "lg:border-r" : "lg:border-l",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-1.5 dark:border-zinc-800">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            <span aria-hidden className="flex size-4 items-center justify-center">
              {icon}
            </span>
            {title}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-controls={id}
            aria-expanded
            aria-label={collapseLabel}
            title={collapseLabel}
            className="rounded px-1.5 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-zinc-800"
          >
            {side === "left" ? "«" : "»"}
          </button>
        </div>
        {children}
      </aside>

      {open && (
        // The drag handle on the edge facing the chart (wide screens only).
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${title.toLowerCase()}`}
          aria-controls={id}
          aria-valuenow={width}
          aria-valuemin={PANEL_MIN_WIDTH}
          aria-valuemax={PANEL_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={onKey}
          className="hidden w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-sky-500/30 focus-visible:bg-sky-500/50 focus-visible:outline-none lg:block"
        />
      )}
    </div>
  );
}

// A collapsed sidebar: a small button floating on the chart, in the same
// style as the chart's other controls. Clicking it reopens the sidebar.
export function PanelIcon({
  id,
  title,
  icon,
  badge,
  onOpen,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  // E.g. an issue count.
  badge?: ReactNode;
  onOpen: () => void;
}) {
  const label = `Show ${title.toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-controls={id}
      aria-expanded={false}
      aria-label={label}
      title={label}
      className="relative flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {icon}
      {badge && <span className="absolute -top-2 -right-2">{badge}</span>}
    </button>
  );
}

// Small line icons (inherit the text color).
export function ToolsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
      <circle cx="5" cy="4" r="1.6" fill="currentColor" />
      <circle cx="11" cy="8" r="1.6" fill="currentColor" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function DetailsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 4.5l1.2 1.2L6.5 3.5M3 10.5l1.2 1.2 2.3-2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 4.5h4.5M9 10.5h4.5" strokeLinecap="round" />
    </svg>
  );
}
