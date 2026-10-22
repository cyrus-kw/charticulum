// Small shared building blocks so panels look and behave the same.
import {
  Children,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import type { ObjectType, Season } from "../engine/index";

// Join class names, skipping false/undefined ones:
// cn("a", isOn && "b") -> "a b" or "a".
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// `toolbar` makes the title row as tall as a toolbar button (30px) and
// 15px from the top, the same as the undo/redo and zoom row beside it
// above the chart, so the titles and those buttons sit on one line. Its
// contents then start 6px below (mb-1.5), so their first line is centered
// on the line under that row in the Plan column (61px down): a 20px row
// starting at 15 + 30 + 6 = 51px has its middle at 61px.
export function Panel({
  title,
  children,
  actions,
  toolbar = false,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  toolbar?: boolean;
}) {
  return (
    // A divider between sections; the last one has nothing below it, so
    // it skips its divider (last:border-b-0).
    <section
      className={cn("border-b border-zinc-200 px-4 py-3 last:border-b-0 dark:border-zinc-800", toolbar && "pt-[15px]")}
    >
      {/* A fixed height, so a button here (like Close) doesn't push the
          title down; the button just overhangs a little. shrink-0 keeps
          that height even when a long list below it is squeezed to fit. */}
      <div className={cn("flex shrink-0 items-center justify-between gap-2", toolbar ? "mb-1.5 h-[30px]" : "mb-2 h-5")}>
        <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

// A group's heading inside a Panel (Issues' "On the chart", Requirements'
// "General Education"), in the same grey text as the Plan box's labels
// (School, Program, ...), so it reads as quieter than the panel's title
// above it, with a thin line running from it to the right side, so the
// groups read as separate sections. `end` goes after the line, at the
// right edge (Requirements puts a group's credit count there). It's in a
// 20px row (h-5), so a first group's heading is centered on the line
// under the undo/redo row in the Plan column (see Panel's `toolbar`).
export function GroupHeading({ children, end }: { children: string; end?: ReactNode }) {
  return (
    <h3 className="mb-1.5 flex h-5 items-center gap-2 text-sm font-normal text-zinc-500">
      {children}
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" aria-hidden />
      {end}
    </h3>
  );
}

// "destructive" is the solid rose twin of "primary", for the main button
// of a question about deleting something (in ConfirmDialog).
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive";
// ComponentProps<"button"> includes ref, so a Button can be focused.
type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant };

// The look of a Button, on its own, so a link that acts like a button
// (e.g. "Open your dashboard") can look exactly like one.
export function buttonClass(variant: ButtonVariant = "secondary"): string {
  return cn(
    "inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
    variant === "primary" && "bg-sky-600 text-white hover:bg-sky-700",
    variant === "secondary" &&
      "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
    variant === "ghost" && "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
    variant === "danger" && "text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950",
    variant === "destructive" && "bg-rose-600 text-white hover:bg-rose-700",
  );
}

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return <button type="button" className={cn(buttonClass(variant), className)} {...props} />;
}

// Small square icon-only buttons inside boxes and menus (28px). The
// plain one is grey; the danger one is rose, for removing or leaving
// (the course trash button, Sign out). Icon-only buttons also need an
// aria-label and a data-tooltip. While a button's menu is open
// (aria-expanded), it's highlighted in the menu's own background color
// (white, dark zinc-900), so it's clear which button the menu belongs to.
export const ICON_BUTTON_BASE = "flex size-7 shrink-0 items-center justify-center rounded-md";
export const ICON_BUTTON = cn(
  ICON_BUTTON_BASE,
  "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 aria-expanded:bg-white aria-expanded:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-expanded:bg-zinc-900 dark:aria-expanded:text-zinc-100",
);
export const DANGER_ICON_BUTTON = cn(
  ICON_BUTTON_BASE,
  "text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950 dark:hover:text-rose-300",
);
// In the title rows of the panel above the chart, icon buttons are 30px
// like undo/redo and zoom beside them, so every icon up there is spaced
// the same (34px apart with gap-1). A style, since it must beat size-7.
export const TOOLBAR_BUTTON_SIZE = { width: 30, height: 30 };

// How a form field looks while it's being typed in: a sky border with a
// soft sky glow around it (instead of the browser's own black outline).
// "focus:" rather than "focus-visible:" because a text box is in use
// whenever it has focus, however it got there.
export const FIELD_FOCUS = "focus:border-sky-500 focus:outline-2 focus:outline-sky-500/40";

// Form fields here always show app state. autoComplete="off" stops Firefox
// from restoring old values on reload, which would make the screen
// disagree with the app.
// `compact` shrinks the box to the size of a tag (Badge), for dropdowns that
// sit beside tags, like Term and Grade in the course details.
export function Select({
  className,
  compact = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <select
      autoComplete="off"
      className={cn(
        "min-w-0 rounded-md border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900",
        FIELD_FOCUS,
        compact ? "mt-0.5 h-5 px-1 py-0 text-xs" : "px-2 py-1.5 text-sm",
        className,
      )}
      {...props}
    />
  );
}

export const inputClass = cn(
  "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900",
  FIELD_FOCUS,
);

// The tint for courses offered in only one season: the chart's cards and
// the tags in the details use the same.
export const SEASON_TINT: Record<Season, string> = {
  // Baby blue, the same as an "info" tag.
  winter: "bg-sky-100 dark:bg-sky-950",
  // In dark mode a deep orange, as dark as the spring and summer shades.
  fall: "bg-orange-100 dark:bg-[#4f2a08]",
  // The same green as a "good" tag (e.g. the Issues count at 0).
  spring: "bg-emerald-100 dark:bg-emerald-950",
  // Baby yellow (a soft pastel); in dark mode a deep yellow, since the
  // stock dark yellows look brown.
  summer: "bg-[#fff5ba] dark:bg-[#4a3f05]",
};

// A small tag, in title case ("Spring", "4 Credits"). Every tag looks
// alike. Text given to it is title-cased here, so callers needn't.
export function Badge({
  children,
  tone = "neutral",
  square = false,
  keepCase = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "bad" | "good" | "info" | Season;
  // A square for an icon or a single digit (wider only if it must be).
  square?: boolean;
  // Show a name exactly as it's written (e.g. a program's rule, "PHYS 213
  // or 214"), instead of in title case.
  keepCase?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded leading-none",
        square ? "h-4 min-w-4 justify-center px-0.5" : "px-1.5 py-0.5",
        "text-xs font-normal",
        tone === "neutral" && "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        tone === "bad" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
        tone === "good" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        tone === "info" && "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
        tone === "winter" && cn(SEASON_TINT.winter, "text-sky-800 dark:text-sky-300"),
        tone === "fall" && cn(SEASON_TINT.fall, "text-orange-800 dark:text-orange-300"),
        tone === "spring" && cn(SEASON_TINT.spring, "text-emerald-800 dark:text-emerald-300"),
        tone === "summer" && cn(SEASON_TINT.summer, "text-yellow-800 dark:text-yellow-300"),
      )}
    >
      {keepCase ? children : Children.map(children, (child) => (typeof child === "string" ? titleCase(child) : child))}
    </span>
  );
}

// The red count of problems on a course card or a term's title. One
// component for both, so they're always the same size. It sits in a
// corner (the caller places it with `className`), so it never pushes the
// text beside it aside.
export function IssueCount({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} issue${count > 1 ? "s" : ""}`}
      className={cn(
        "absolute flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] leading-none font-bold text-white",
        className,
      )}
    >
      {count}
    </span>
  );
}

// How one tab looks: a sky underline when chosen, grey text otherwise.
// Shared by Tabs below and the site's top-bar links (Dashboard, Schools),
// so every tab in the app looks the same. -mb-px: the chosen tab's
// underline sits on the row's border line instead of just above it.
export function tabClass(selected: boolean) {
  return cn(
    "-mb-px border-b-2 px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500",
    selected
      ? "border-sky-600 text-zinc-900 dark:border-sky-400 dark:text-zinc-100"
      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
  );
}

// A row of tabs with the content of the chosen one below. Every tab's
// content stays mounted (just hidden), so what's typed in one (like a
// search) is still there after switching away and back.
// Keyboard: Left/Right arrows move between tabs, as screen readers expect.
export function Tabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
  stickyTop,
}: {
  // Prefix for the ids that tie each tab to its content.
  id: string;
  // What the tab row is, for screen readers ("Tools").
  label: string;
  tabs: { value: T; label: string; content: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  // Keep the tab row in view this far from the top while the rest scrolls
  // (e.g. just below a sticky header).
  stickyTop?: number;
}) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = tabs.findIndex((t) => t.value === value);
    // Wraps around: right from the last tab goes to the first.
    const next = tabs[(at + step + tabs.length) % tabs.length];
    onChange(next.value);
    document.getElementById(`${id}-tab-${next.value}`)?.focus();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        style={stickyTop === undefined ? undefined : { top: stickyTop }}
        // A solid background (the page's) and z-10 cover what scrolls
        // under it, like the sticky header above.
        className={cn(
          "flex border-b border-zinc-200 bg-page dark:border-zinc-800 dark:bg-zinc-950",
          stickyTop !== undefined && "sticky z-10",
        )}
      >
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${tab.value}`}
              // Only the chosen tab is a Tab stop; arrows reach the others.
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.value)}
              // py-3, like a Panel's top padding, so in the planner the
              // tab names line up with the Plan box's title beside them.
              className={cn(tabClass(selected), "flex-1 py-3")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.value}
          role="tabpanel"
          id={`${id}-panel-${tab.value}`}
          aria-labelledby={`${id}-tab-${tab.value}`}
          hidden={tab.value !== value}
        >
          {tab.content}
        </div>
      ))}
    </>
  );
}

// Capitalize the first letter of each word: "odd years" -> "Odd Years".
export function titleCase(text: string): string {
  return text.replace(/(^|[\s-])(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

// Ask for a reason before recording an exception. Returns null if cancelled.
export function askReason(what: string): string | null {
  const reason = window.prompt(`Reason for this exception (${what}):`, "");
  if (reason === null) return null;
  return reason.trim() || "No reason given";
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const TYPE_PLURALS: Record<ObjectType, string> = {
  course: "courses",
  experience: "experiences",
  milestone: "milestones",
  proficiency: "proficiencies",
};

// "14 courses · 2 experiences · 1 milestone": the catalog by type, with
// types the school doesn't use left out.
export function countsByType(objects: { type: ObjectType }[]): string {
  return (Object.keys(TYPE_PLURALS) as ObjectType[])
    .map((type) => [type, objects.filter((o) => o.type === type).length] as const)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${count === 1 ? type : TYPE_PLURALS[type]}`)
    .join(" · ");
}
