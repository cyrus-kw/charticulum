"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Chart } from "../../engine/index";
import { serverChartStore } from "../../storage/stores";
import { CopyIcon, SaveIcon } from "../icons";
import { Popover } from "../TermMenu";
import { cn, ICON_BUTTON, ICON_BUTTON_BASE, TOOLBAR_BUTTON_SIZE } from "../ui";
import type { PanelProps } from "./types";

const store = serverChartStore();

// The save menu's width (pixels), so it can line up under the button.
const MENU_WIDTH = 160;
// A menu item with its icon in front, greyed out when it can't be used.
const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-zinc-800";

// Save this chart, or save a copy and open it: the save button in the
// Plan box's title row, left of Build for me, opens a menu of the two.
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

  // Where the menu opens (window pixels), or null while it's shut.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const choose = (asCopy: boolean) => {
    setMenuAt(null);
    void save(asCopy);
  };

  // The save button says whether there's anything to save: sky blue
  // (the accent) with unsaved changes, grey once everything is saved.
  // Clicking it opens a small menu: Save, and Save a copy.
  const status = busy ? "Saving…" : unsaved ? "Save (unsaved changes)" : "Saved";
  return (
    <>
      <button
        type="button"
        aria-label={status}
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        data-tooltip={status}
        disabled={busy}
        onClick={(e) => {
          // Just under the button, lined up with its right edge.
          const box = e.currentTarget.getBoundingClientRect();
          setMenuAt(menuAt ? null : { x: box.right - MENU_WIDTH, y: box.bottom + 4 });
        }}
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
      {menuAt && (
        <Popover x={menuAt.x} y={menuAt.y} width={MENU_WIDTH} height={76} label="Save options" onClose={() => setMenuAt(null)}>
          {/* Nothing to save once it's all saved, but the menu still
              opens for Save a copy. */}
          <button
            type="button"
            role="menuitem"
            disabled={!unsaved}
            data-tooltip={unsaved ? undefined : "Everything is saved."}
            onClick={() => choose(false)}
            className={MENU_ITEM}
          >
            <SaveIcon />
            Save
          </button>
          <button type="button" role="menuitem" onClick={() => choose(true)} className={MENU_ITEM}>
            <CopyIcon />
            Save a copy
          </button>
        </Popover>
      )}
    </>
  );
}
