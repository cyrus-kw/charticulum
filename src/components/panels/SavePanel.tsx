"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Chart } from "../../engine/index";
import { serverChartStore } from "../../storage/stores";
import { Button, Panel } from "../ui";
import type { PanelProps } from "./types";

const store = serverChartStore();

// Save this chart, or save a copy and open it.
export function SavePanel({
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
  const [error, setError] = useState<string | null>(null);

  const save = async (asCopy: boolean) => {
    setBusy(true);
    setError(null);
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Save">
      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={busy || !unsaved} onClick={() => void save(false)}>
          Save
        </Button>
        <Button disabled={busy} onClick={() => void save(true)}>
          Save a copy
        </Button>
        <span role="status" className="ml-auto text-xs text-zinc-500">
          {busy ? "Saving…" : unsaved ? "Unsaved changes" : "Saved"}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
    </Panel>
  );
}
