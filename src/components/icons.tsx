// The chart's icons, all drawn the same way so they match: a 24-unit grid
// shown at 16px, 2-unit strokes, rounded ends and corners, in the text
// color. Add new icons here rather than drawing them inline.
import type { ReactNode } from "react";

function Icon({ children, flip = false, size = 16 }: { children: ReactNode; flip?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      {children}
    </svg>
  );
}

// A window with a sidebar on the left (flipped for the right). When the
// button holding it is pointed at, a chevron appears in the main part of
// the window showing which way the sidebar will move: "<" to slide it shut,
// ">" to slide it open. (The flip turns these around for a right sidebar.)
// It only shows on hover because the button's parent has Tailwind's
// "group" class, and "group-hover:" styles react to the parent's hover.
export function SidebarIcon({ side, open }: { side: "left" | "right"; open: boolean }) {
  return (
    <Icon flip={side === "right"}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
      <path
        d={open ? "m16.5 9-3 3 3 3" : "m13.5 9 3 3-3 3"}
        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </Icon>
  );
}

// "Go somewhere else": an arrow leaving the top right of a box.
export function OpenIcon() {
  return (
    <Icon>
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
      <path d="M15 4h5v5M10 14 20 4" />
    </Icon>
  );
}

// A sun (switch to light mode).
export function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

// A crescent moon (switch to dark mode): a big arc around the outside and a
// smaller arc cutting into its top right. The smaller the inner arc, the
// fatter the crescent; much thinner and it turns to mush at 16px.
export function MoonIcon() {
  return (
    <Icon>
      <path d="M20.5 12.7A8.5 8.5 0 1 1 11.3 3.5A6.5 6.5 0 0 0 20.5 12.7z" />
    </Icon>
  );
}

// A U-turn arrow: back for undo, forward (flipped) for redo.
export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  );
}

export function RedoIcon() {
  return (
    <Icon flip>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  );
}

export function MinusIcon() {
  return (
    <Icon>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M5 12h14M12 5v14" />
    </Icon>
  );
}

// Two chevrons pointing in toward the middle (><): squeeze the chart back
// to fit the width. It spans x 5–19, the same width as the plus beside it.
// Its stroke is a little thicker than the other icons' because slanted
// lines at 16px get spread over neighbouring pixels and look fainter than
// the plus's straight ones.
export function FitIcon() {
  return (
    <Icon>
      <path d="m5 7 5 5-5 5" strokeWidth="2.5" />
      <path d="m19 7-5 5 5 5" strokeWidth="2.5" />
    </Icon>
  );
}

// A trash can: remove.
export function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

// A "v" chevron for something that folds open and shut. It points down
// while shut ("there's more below") and turns to point up while open.
export function ChevronIcon({ open }: { open: boolean }) {
  return (
    // inline-flex: a plain inline span can't be rotated.
    <span className={open ? "inline-flex rotate-180 transition-transform" : "inline-flex transition-transform"}>
      <Icon size={14}>
        <path d="m6 9 6 6 6-6" />
      </Icon>
    </span>
  );
}
