"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";
import { ICON_BUTTON } from "./ui";

// The floating Settings panel, over whatever page is open. The page stays
// as it was behind it (unsaved planner changes included), and the address
// doesn't change, so a refresh simply shows the page without it.
//
// Closing: the X, Escape, or clicking the dimmed page around it.
export function SettingsDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  // Kept in a ref so the effect below, which runs once, always calls the
  // latest onClose.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    // Remember what had keyboard focus (the Settings button), start focus
    // inside the panel so Tab moves through it, and put it back on close.
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    // The page behind shouldn't scroll while the panel is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
      before?.focus();
    };
  }, []);

  // createPortal draws it straight into <body>, so it sits above everything
  // on the page, whichever box (the side panel, the top bar) opened it.
  return createPortal(
    // The dimmed page. A click on it (not on the panel) closes.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 motion-safe:animate-[fade-in_150ms_ease-out]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
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
          <button type="button" onClick={onClose} aria-label="Close" data-tooltip="Close" className={ICON_BUTTON}>
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
