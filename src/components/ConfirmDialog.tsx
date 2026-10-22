"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";

// The app's own "Are you sure?" popup, in place of the browser's
// window.confirm (whose plain grey box looks different in every browser
// and can't match the app).
//
// Ask from anywhere with: if (await askToConfirm({ message: "…" })) { … }
// It waits until the person picks a button, then gives true (the main
// button) or false (Cancel, Escape, or a click on the dimmed page).
//
// <ConfirmDialogs /> (mounted once in the root layout, like Tooltips)
// draws the popup whenever askToConfirm is called.

export type ConfirmOptions = {
  message: string;
  // The main button's words ("Leave", "Delete"); "OK" if not given.
  confirmLabel?: string;
  // For something that can't be taken back (deleting): the main button
  // is rose, and Cancel starts with keyboard focus, so Enter is safe.
  danger?: boolean;
};

type Request = ConfirmOptions & { answer: (yes: boolean) => void };

// The mounted <ConfirmDialogs /> puts its "show this" function here.
let show: ((request: Request) => void) | null = null;

export function askToConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Nothing mounted to draw it (shouldn't happen): fall back to the
    // browser's own box rather than doing the action unasked.
    if (!show) resolve(window.confirm(options.message));
    else show({ ...options, answer: resolve });
  });
}

export function ConfirmDialogs() {
  const [request, setRequest] = useState<Request | null>(null);
  useEffect(() => {
    show = (next) =>
      setRequest((current) => {
        // A second question while one is open: the first counts as Cancel.
        current?.answer(false);
        return next;
      });
    return () => {
      show = null;
    };
  }, []);
  if (!request) return null;
  const finish = (yes: boolean) => {
    request.answer(yes);
    setRequest(null);
  };
  return <ConfirmBox request={request} onFinish={finish} />;
}

function ConfirmBox({ request, onFinish }: { request: Request; onFinish: (yes: boolean) => void }) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Kept in a ref so the effect below, which runs once, always calls the
  // latest onFinish.
  const finish = useRef(onFinish);
  finish.current = onFinish;

  useEffect(() => {
    // Remember what had keyboard focus, start it on a button so Enter
    // answers, and put it back afterward.
    const before = document.activeElement as HTMLElement | null;
    (request.danger ? cancelButton : confirmButton).current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Handled here, so a Settings panel underneath doesn't also close.
      event.preventDefault();
      event.stopImmediatePropagation();
      finish.current(false);
    };
    // Capture: hear Escape before anything else on the page does.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      before?.focus();
    };
  }, [request.danger]);

  // Drawn straight into <body>, above everything (z-[60]: over Settings).
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 motion-safe:animate-[fade-in_150ms_ease-out]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onFinish(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-4 text-ink shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <p id="confirm-message" className="text-sm">
          {request.message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button ref={cancelButton} onClick={() => onFinish(false)}>
            Cancel
          </Button>
          <Button
            ref={confirmButton}
            variant={request.danger ? "destructive" : "primary"}
            onClick={() => onFinish(true)}
          >
            {request.confirmLabel ?? "OK"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
