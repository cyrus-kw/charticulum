"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Chart } from "../../engine/index";
import { serverChartStore } from "../../storage/stores";
import { CopyIcon, SaveIcon } from "../icons";
import { cn, ICON_BUTTON, ICON_BUTTON_BASE, TOOLBAR_BUTTON_SIZE } from "../ui";
import type { PanelProps } from "./types";

const store = serverChartStore();

// Save this chart, or save a copy and open it: two icon buttons in the
// Plan box's title row, left of Build for me.
export function SaveButtons({
  state,
  dispatch,
  unsaved,
  onSaved,
}: PanelProps & {
  // True when the chart differs from its last saved version.
  unsaved: boolean;
  onSaved: (chart: Chart) => void;
}) {
  const schoolId = state.school.data.school.id;
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const save = async (asCopy: boolean) => {
    setBusy(true);
    try {
      if (asCopy) {
        const copy = { ...state.chart, name: `${state.chart.name} (copy)` };
        const result = await store.save({ schoolId, chart: copy });
        // Open the copy: a new address, so a new page.
        router.push(`/chart/${encodeURIComponent(result.id)}`);
      } else {
        const chart = state.chart;
        const result = await store.save({ ...(state.savedId && { id: state.savedId }), schoolId, chart });
        dispatch({ type: "saved", savedId: result.id });
        onSaved(chart);
      }
    } catch (e) {
      // There's no room for a message in the title row, so a failed save
      // says why in a browser popup instead.
      window.alert(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // The save button says whether there's anything to save: sky blue
  // (the accent) with unsaved changes, faded once everything is saved.
  const status = busy ? "Saving…" : unsaved ? "Save (unsaved changes)" : "Saved";
  return (
    <>
      <button
        type="button"
        aria-label={status}
        data-tooltip={status}
        disabled={busy || !unsaved}
        onClick={() => void save(false)}
        style={TOOLBAR_BUTTON_SIZE}
        // ICON_BUTTON's grey, or the same button in sky. (Both colors
        // can't be listed at once: whichever Tailwind wrote last would win.)
        className={cn(
          unsaved
            ? cn(
                ICON_BUTTON_BASE,
                "text-sky-600 hover:bg-zinc-100 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-zinc-800 dark:hover:text-sky-300",
              )
            : ICON_BUTTON,
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        )}
      >
        <SaveIcon />
      </button>
      <button
        type="button"
        aria-label="Save a copy"
        data-tooltip="Save a copy"
        disabled={busy}
        onClick={() => void save(true)}
        style={TOOLBAR_BUTTON_SIZE}
        className={cn(ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}
      >
        <CopyIcon />
      </button>
    </>
  );
}
