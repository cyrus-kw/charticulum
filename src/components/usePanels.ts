"use client";

// Which sidebars are open. Remembered in this browser as a convenience; if
// storage is unavailable, both start open.
import { useCallback, useEffect, useState } from "react";

const KEY = "charticulum.panels.v1";

export interface PanelsOpen {
  left: boolean;
  right: boolean;
}

export function usePanels() {
  // Both open on the first render, on server and browser alike, so the
  // page loads without a mismatch; the saved choice is applied right after.
  const [open, setOpen] = useState<PanelsOpen>({ left: true, right: true });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && typeof saved.left === "boolean" && typeof saved.right === "boolean") {
        setOpen({ left: saved.left, right: saved.right });
      }
    } catch {
      // Blocked or corrupted storage: keep the defaults.
    }
  }, []);

  const toggle = useCallback((side: keyof PanelsOpen) => {
    setOpen((current) => {
      const next = { ...current, [side]: !current[side] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not saved; the toggle still works for this visit.
      }
      return next;
    });
  }, []);

  return { open, toggle };
}
