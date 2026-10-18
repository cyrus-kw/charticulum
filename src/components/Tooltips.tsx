"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The little label that appears when you point at a button, used everywhere
// in the app instead of the browser's plain "title" box, so they all match
// (they look like the account menu's popup). To give anything one, write
//
//   <button data-tooltip="Undo (Ctrl+Z)">…</button>
//
// and this component, mounted once in the root layout, does the rest. One
// shared label (rather than one per button) is drawn on top of the whole
// page, so it's never cut off by a scrolling sidebar or the chart, and it
// can move to stay inside the window.

const SHOW_DELAY = 300; // ms of pointing before it appears, like the browser's
const GAP = 6; // px between the element and the label
const EDGE = 8; // px the label keeps from the window's edges

// The nearest element (this one or one it's inside) that has a tooltip.
function tooltipOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
}

export function Tooltips() {
  // The element being pointed at (or reached with Tab), and its text.
  const [tip, setTip] = useState<{ text: string; target: HTMLElement } | null>(null);
  // Where to draw the label; null until it has been measured.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Listen on the whole document once, instead of on every button.
  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: number | undefined;
    // The element last pressed (clicked or dragged). Its label waits until
    // the pointer has moved off it, so it doesn't pop up right after a
    // click or as a dragged card is let go.
    let pressed: HTMLElement | null = null;

    function show(el: HTMLElement | null, delay: number) {
      if (el === current) return;
      window.clearTimeout(timer);
      current = el;
      setTip(null);
      if (!el) return;
      timer = window.setTimeout(() => {
        const text = el.dataset.tooltip;
        if (text && el.isConnected) setTip({ text, target: el });
      }, delay);
    }
    const hide = () => show(null, 0);

    // pointerover fires each time the pointer moves onto a new element, so
    // moving off a button onto something without a tooltip hides it.
    // Touch screens skip it: a tap would show a label that never goes away.
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      // e.buttons is 0 unless a mouse button is held down. While dragging
      // a card, the card moves along under the pointer, so pointerover
      // keeps firing on it; no label while anything is held.
      if (e.buttons !== 0) return;
      const el = tooltipOf(e.target);
      if (el && el === pressed) return;
      pressed = null;
      show(el, SHOW_DELAY);
    };
    const onDown = (e: PointerEvent) => {
      pressed = tooltipOf(e.target);
      hide();
    };
    // relatedTarget is null when the pointer leaves the window.
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    // Reaching a button with Tab shows its label straight away (but not a
    // click, which also focuses it; :focus-visible tells the two apart).
    const onFocus = (e: FocusEvent) => {
      const el = tooltipOf(e.target);
      if (el && el === e.target && el.matches(":focus-visible")) show(el, 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    // Clicking, dragging, or scrolling: the label would be in the way, or
    // left behind in the wrong spot.
    // Capture (true): hear the press before anything inside the page can
    // stop it from spreading, as the chart does when a drag starts.
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("wheel", hide, { passive: true });
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("wheel", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Place the label once it's drawn (useLayoutEffect runs before the
  // browser paints, so it never shows in the wrong spot): centered under
  // the element, above it if there's no room below, and slid sideways to
  // stay inside the window.
  useLayoutEffect(() => {
    if (!tip || !box.current) {
      setPos(null);
      return;
    }
    const at = tip.target.getBoundingClientRect();
    const { width, height } = box.current.getBoundingClientRect();
    const below = at.bottom + GAP;
    const top = below + height <= window.innerHeight - EDGE ? below : at.top - GAP - height;
    const centered = at.left + at.width / 2 - width / 2;
    const left = Math.min(Math.max(centered, EDGE), window.innerWidth - width - EDGE);
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      // Hidden until placed. pointer-events-none: the label never gets in
      // the way of the pointer. whitespace-pre-line: a "\n" in the text
      // starts a new line (a course card lists its issues this way).
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
      className="pointer-events-none fixed z-[1000] max-w-xs rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm whitespace-pre-line text-ink shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {tip.text}
    </div>
  );
}
