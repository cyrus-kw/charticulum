"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "./icons";
import { ICON_BUTTON } from "./ui";

// The floating Settings panel, over whatever page was open (the page stays
// as it was behind it, unsaved planner changes included). It's at the
// address /settings, so Back closes it, like on claude.ai.
//
// Closing (the X, Escape, or clicking the dimmed page around it) goes
// back to the page underneath. Opened directly at /settings (a refresh, a
// new tab), there's no page to go back to, so `closeHref` says where to go.
export function SettingsDialog({ children, closeHref }: { children: ReactNode; closeHref?: string }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const close = () => (closeHref ? router.push(closeHref) : router.back());

  useEffect(() => {
    // Start keyboard focus inside the panel, so Tab moves through it.
    panel.current?.focus();
    // The page behind shouldn't scroll while the panel is open.
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKeyDown);
    };
    // Runs once, when the panel opens.
  }, []);

  return (
    // The dimmed page. A click on it (not on the panel) closes.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 motion-safe:animate-[fade-in_150ms_ease-out]"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        // A column: the title row stays put while the sections scroll.
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-md border border-zinc-200 bg-white text-ink shadow-lg outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 py-3 pr-3 pl-4 dark:border-zinc-800">
          <h2 id="settings-title" className="text-base font-semibold">
            Settings
          </h2>
          <button type="button" onClick={close} aria-label="Close" data-tooltip="Close" className={ICON_BUTTON}>
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
