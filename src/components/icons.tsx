// The chart's icons, all drawn the same way so they match: a 24-unit grid
// shown at 16px, 2-unit strokes, rounded ends and corners, in the text
// color. Add new icons here rather than drawing them inline.
import type { ReactNode } from "react";

function Icon({ children, flip = false }: { children: ReactNode; flip?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
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

// A window with a sidebar on the left (flipped for the right).
export function SidebarIcon({ side }: { side: "left" | "right" }) {
  return (
    <Icon flip={side === "right"}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
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

// Two chevrons pointing in at a center line (>|<): squeeze the chart back
// to fit the width.
export function FitIcon() {
  return (
    <Icon>
      <path d="m3 7 5 5-5 5" />
      <path d="m21 7-5 5 5 5" />
      <path d="M12 4v16" />
    </Icon>
  );
}
