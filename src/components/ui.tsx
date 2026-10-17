// Small shared building blocks so panels look and behave the same.
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { Season } from "../engine/index";

// Join class names, skipping false/undefined ones:
// cn("a", isOn && "b") -> "a b" or "a".
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      {/* A fixed height, so a button here (like Close) doesn't push the
          title down; the button just overhangs a little. */}
      <div className="mb-2 flex h-5 items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" };

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
        variant === "primary" && "bg-sky-600 text-white hover:bg-sky-700",
        variant === "secondary" &&
          "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
        variant === "ghost" && "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
        variant === "danger" && "text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950",
        className,
      )}
      {...props}
    />
  );
}

// Form fields here always show app state. autoComplete="off" stops Firefox
// from restoring old values on reload, which would make the screen
// disagree with the app.
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      autoComplete="off"
      className={cn(
        "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900",
        className,
      )}
      {...props}
    />
  );
}

export const inputClass =
  "min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// The tint for courses offered in only one season: the chart's cards and
// the tags in the details use the same.
export const SEASON_TINT: Partial<Record<Season, string>> = {
  fall: "bg-orange-100 dark:bg-amber-950",
  // The same green as a "good" tag (e.g. the Issues count at 0).
  spring: "bg-emerald-100 dark:bg-emerald-950",
};

// A small tag: capitals like panel titles, but regular weight. Every tag
// looks alike.
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "bad" | "good" | "info" | "fall" | "spring";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 leading-none",
        "text-xs font-normal tracking-wide uppercase",
        tone === "neutral" && "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        tone === "bad" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
        tone === "good" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        tone === "info" && "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
        tone === "fall" && cn(SEASON_TINT.fall, "text-orange-800 dark:text-amber-300"),
        tone === "spring" && cn(SEASON_TINT.spring, "text-emerald-800 dark:text-emerald-300"),
      )}
    >
      {children}
    </span>
  );
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
