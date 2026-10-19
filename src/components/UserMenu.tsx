"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { signOutAction } from "../app/auth/actions";
import { ChevronDownIcon, SettingsIcon, SignOutIcon } from "./icons";
import { SettingsDialog } from "./SettingsDialog";
import { Settings } from "./site/Settings";
import { cn, DANGER_ICON_BUTTON, ICON_BUTTON } from "./ui";

// "Ana Lucía Pérez" → "Ana P": the first name and the last name's
// initial, to keep the side panel tidy. A single name stays as it is.
function shortName(name: string): string {
  // split(/\s+/) breaks the name at any run of spaces.
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}`;
}

export type MenuUser = { name: string; email: string; role?: "user" | "admin" };

// The signed-in account, which opens a small menu: your name and email,
// with icon buttons for Settings (a gear; floats over the page) and Sign out
// beside them. This menu also opens and closes the Settings panel.
// Two looks:
// - "circle": just the circle with your initial, in the site's top bar;
//   the menu drops down below it.
// - "row": the circle, your name, and a chevron, at the bottom of the
//   planner's side panel; the menu opens upward, since there's no room below.
// <details> is a built-in show/hide element: clicking its <summary> opens
// and closes it.
export function UserMenu({
  user,
  look,
  confirmLeave,
}: {
  user: MenuUser;
  look: "circle" | "row";
  // Asked before leaving the page (the planner uses it to warn about
  // unsaved changes). Returning false stays put.
  confirmLeave?: () => boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Whether the Settings panel is open. Only in this page's memory, so a
  // refresh closes it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Close it when clicking anywhere outside it.
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  // preventDefault cancels the click or the form's submit, so nothing happens.
  const guard = (event: MouseEvent | FormEvent) => {
    if (confirmLeave && !confirmLeave()) event.preventDefault();
  };

  const initial = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
      {user.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );

  return (
    <>
      {/* "group" lets the chevron inside turn over while the menu is open
        (Tailwind's group-open: reacts to the <details> being open). */}
      <details ref={ref} className={cn("group relative", look === "row" && "min-w-0 flex-1")}>
        <summary
          aria-label="Account menu"
          data-tooltip={user.name}
          className={cn(
            "flex cursor-pointer list-none items-center select-none [&::-webkit-details-marker]:hidden",
            look === "circle"
              ? "rounded-full hover:opacity-90"
              : // w-fit: the highlight hugs the circle, name, and chevron,
                // the same distance from each, instead of stretching to the
                // dashboard button.
                "w-fit max-w-full gap-2.5 rounded-md p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          {initial}
          {look === "row" && (
            <>
              {/* min-w-0 + truncate: a long name ends in "…" instead of
                pushing the dashboard button off the edge. */}
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium">{shortName(user.name)}</span>
                {user.role === "admin" && <span className="text-zinc-500"> · Admin</span>}
              </span>
              <span className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180">
                <ChevronDownIcon />
              </span>
            </>
          )}
        </summary>
        <div
          className={cn(
            "absolute z-20 flex w-64 items-center gap-1 rounded-md border border-zinc-200 bg-white py-1.5 pr-1.5 pl-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900",
            look === "circle" ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2",
          )}
        >
          {/* min-w-0 + truncate: a long name or email ends in "…" and
            leaves room for the buttons. */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-zinc-500">{user.email}</div>
          </div>
          {/* Settings floats over this page rather than leaving it, so
            unsaved changes in the planner are safe: no need to ask. The
            menu closes behind it. */}
          <button
            type="button"
            onClick={() => {
              ref.current?.removeAttribute("open");
              setSettingsOpen(true);
            }}
            aria-label="Settings"
            data-tooltip="Settings"
            className={ICON_BUTTON}
          >
            <SettingsIcon />
          </button>
          {/* Rose, like the course trash button: it takes you out. */}
          <form action={signOutAction} onSubmit={guard}>
            <button type="submit" aria-label="Sign out" data-tooltip="Sign out" className={DANGER_ICON_BUTTON}>
              <SignOutIcon />
            </button>
          </form>
        </div>
      </details>
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)}>
          <Settings user={user} />
        </SettingsDialog>
      )}
    </>
  );
}
