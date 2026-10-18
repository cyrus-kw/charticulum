"use client";

// A sidebar that can be resized by dragging its inner edge and collapsed
// like the claude.ai sidebar: one toggle button (a "sidebar" icon) that
// stays in the same spot whether the sidebar is open or not. Open, it sits
// in the sidebar's top corner; collapsed, the sidebar slides shut and the
// same button floats at that spot on the chart (see PanelToggle). The
// contents stay mounted while collapsed, so what's typed in them survives.
import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { SidebarIcon } from "./icons";
import { cn } from "./ui";
import { PANEL_COLLAPSE_BELOW, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from "./usePanels";

const KEY_STEP = 16;
// The toggle sits this far from the corner, open or collapsed. It matches
// React Flow's panel margin, so the floating copy lands in the same spot.
const TOGGLE_INSET = 15;
// The same height as the chart's button groups (28px buttons + 1px borders).
export const TOGGLE_SIZE = 30;
// The toggle's look, shared with other buttons in the sidebar's header
// (like the dashboard link) so they all match.
export const HEADER_BUTTON =
  "flex shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-zinc-300 dark:hover:bg-zinc-800";
export const PANEL_HEADER_HEIGHT = TOGGLE_INSET * 2 + TOGGLE_SIZE;

export function SidePanel({
  id,
  title,
  side,
  open,
  width,
  onToggle,
  onResize,
  heading,
  footer,
  children,
}: {
  id: string;
  title: string;
  // Shown beside the toggle in place of the title (e.g. the app's name).
  heading?: ReactNode;
  // Pinned to the bottom of the sidebar (e.g. the account), below
  // whatever scrolls.
  footer?: ReactNode;
  side: "left" | "right";
  open: boolean;
  width: number;
  onToggle: () => void;
  // `done` is true at the end of a drag (or a keyboard step).
  onResize: (width: number, done: boolean) => void;
  children: ReactNode;
}) {
  // While dragging, resizing follows the pointer exactly (no slide).
  const [dragging, setDragging] = useState(false);

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
    setDragging(true);
    const move = (e: globalThis.PointerEvent) => onResize(widthFor(e.clientX), false);
    const end = (e: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      body.userSelect = before.userSelect;
      body.cursor = before.cursor;
      setDragging(false);
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

  return (
    // relative + z-10: the drag handle below sticks out over the chart's
    // edge, and must sit on top of it to be grabbed there.
    <div className={cn("relative z-10 flex min-h-0 shrink-0", side === "right" && "lg:flex-row-reverse")}>
      <aside
        id={id}
        aria-label={title}
        // Collapsed: out of reach for keyboard and screen readers too.
        inert={!open}
        // The inner width leaves room for the 1px border, so the toggle sits
        // exactly where its floating copy will.
        style={{ ["--panel-w" as string]: open ? `${width}px` : "0px", ["--panel-inner" as string]: `${width - 1}px` }}
        className={cn(
          "overflow-hidden border-line lg:w-(--panel-w) dark:border-zinc-800",
          !dragging && "lg:transition-[width] lg:duration-200 lg:ease-out motion-reduce:transition-none",
          open ? (side === "left" ? "lg:border-r" : "lg:border-l") : "max-lg:hidden",
        )}
      >
        {/* A fixed width inside, so the contents slide rather than squish.
            flex-col: the footer can then sit at the bottom even when the
            contents above it are short. */}
        <div className="flex h-full max-h-[40dvh] flex-col overflow-y-auto lg:max-h-none lg:w-(--panel-inner)">
          <div
            // +1 for the bottom border, so the toggle is TOGGLE_INSET from the top.
            style={{ height: PANEL_HEADER_HEIGHT + 1, paddingInline: TOGGLE_INSET }}
            // sticky top-0: the header stays put while the rest scrolls
            // under it. It needs a solid background (the page's) and z-10
            // to cover what scrolls beneath.
            className={cn(
              "sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-page dark:border-zinc-800 dark:bg-zinc-950",
              side === "right" && "flex-row-reverse",
            )}
          >
            <PanelToggle id={id} title={title} side={side} open onToggle={onToggle} />
            {heading ?? (
              <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                {title}
              </span>
            )}
          </div>
          {/* flex-1 takes up the spare height, pushing the footer down. */}
          <div className="flex-1">{children}</div>
          {footer && (
            // sticky bottom-0: when the contents are long, the footer
            // stays in view and they scroll under it. It's as tall as the
            // header (+1 for its top border), so its middle lines up with
            // the chart's bottom controls (the zoom buttons), which sit
            // TOGGLE_INSET from the bottom and are TOGGLE_SIZE tall.
            <div
              style={{ height: PANEL_HEADER_HEIGHT + 1, paddingInline: TOGGLE_INSET }}
              className="sticky bottom-0 z-10 flex shrink-0 items-center gap-3 border-t border-zinc-200 bg-page dark:border-zinc-800 dark:bg-zinc-950"
            >
              {footer}
            </div>
          )}
        </div>
      </aside>

      {open && (
        // The drag handle on the edge facing the chart (wide screens only).
        // It's invisible and takes no space: an 8px strip centered on the
        // sidebar's border line, so pointing at the line shows the resize
        // cursor without a visible bar beside it.
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
          className={cn(
            "absolute inset-y-0 hidden w-2 cursor-col-resize focus-visible:bg-sky-500/50 focus-visible:outline-none lg:block",
            side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
          )}
        />
      )}
    </div>
  );
}

// The sidebar toggle. The same button is drawn in the sidebar's corner
// when it's open and floating on the chart (at the same spot) when it's
// collapsed.
export function PanelToggle({
  id,
  title,
  side,
  open,
  badge,
  onToggle,
}: {
  id: string;
  title: string;
  side: "left" | "right";
  open: boolean;
  // Shown while collapsed, e.g. an issue count.
  badge?: ReactNode;
  onToggle: () => void;
}) {
  const label = `${open ? "Collapse" : "Show"} ${title.toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-controls={id}
      aria-expanded={open}
      aria-label={label}
      title={label}
      style={{ width: TOGGLE_SIZE, height: TOGGLE_SIZE }}
      className={cn(
        "group relative",
        HEADER_BUTTON,
        // Floating on the chart it needs a background to stand out, and
        // waits for the sidebar to finish sliding shut (see globals.css).
        !open && "after-panel-slide border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
      )}
    >
      <SidebarIcon side={side} open={open} />
      {!open && badge && <span className="absolute -top-2 -right-2">{badge}</span>}
    </button>
  );
}
