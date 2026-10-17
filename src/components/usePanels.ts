"use client";

// Whether the Tools sidebar is open, how wide it is, and which of its tabs
// is showing, and whether the Pre-Credit column is shown. Remembered in this browser as a convenience;
// if storage is unavailable, everything starts shown at default widths.
import { useCallback, useEffect, useState } from "react";

const KEY = "charticulum.panels.v1";

export const PANEL_MIN_WIDTH = 220;
export const PANEL_MAX_WIDTH = 560;
// Dragged narrower than this, a sidebar collapses to its icon.
export const PANEL_COLLAPSE_BELOW = 160;

// The Tools sidebar's tabs: the plan (programs, requirements, ...) or the
// school's courses and data.
export type ToolsTab = "plan" | "catalog";

export interface PanelsOpen {
  left: boolean;
  // Show the Pre-Credit column in the chart.
  preCredit: boolean;
  leftWidth: number;
  tab: ToolsTab;
}

const DEFAULTS: PanelsOpen = { left: true, preCredit: true, leftWidth: 320, tab: "plan" };

export const clampPanelWidth = (width: number) =>
  Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)));

function save(panels: PanelsOpen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(panels));
  } catch {
    // Not saved; it still works for this visit.
  }
}

export function usePanels() {
  // Defaults on the first render, on server and browser alike, so the page
  // loads without a mismatch; the saved choice is applied right after.
  const [open, setOpen] = useState<PanelsOpen>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && typeof saved.left === "boolean") {
        setOpen({
          left: saved.left,
          // Saved before these settings existed: their defaults.
          preCredit: saved.preCredit !== false,
          leftWidth: typeof saved.leftWidth === "number" ? clampPanelWidth(saved.leftWidth) : DEFAULTS.leftWidth,
          tab: saved.tab === "catalog" ? "catalog" : "plan",
        });
      }
    } catch {
      // Blocked or corrupted storage: keep the defaults.
    }
  }, []);

  const toggle = useCallback((setting: "left" | "preCredit") => {
    setOpen((current) => {
      const next = { ...current, [setting]: !current[setting] };
      save(next);
      return next;
    });
  }, []);

  // Set the sidebar's width. `done` saves it (at the end of a drag); while
  // dragging it just updates.
  const setWidth = useCallback((width: number, done: boolean) => {
    setOpen((current) => {
      const next = { ...current, leftWidth: clampPanelWidth(width) };
      if (done) save(next);
      return next;
    });
  }, []);

  const setTab = useCallback((tab: ToolsTab) => {
    setOpen((current) => {
      const next = { ...current, tab };
      save(next);
      return next;
    });
  }, []);

  return { open, toggle, setWidth, setTab };
}
