"use client";

import { useCallback, useEffect, useState } from "react";
import { chooseChartStore } from "../../storage/stores";
import type { ChartStore, SavedChartSummary } from "../../storage/types";
import { Button, Panel } from "../ui";
import type { PanelProps } from "./types";

// Save the current chart and reopen saved ones. Uses the database when the
// server has one, otherwise this browser's storage.
export function SavePanel({ state, dispatch }: PanelProps) {
  const schoolId = state.school.data.school.id;
  const [store, setStore] = useState<ChartStore | null>(null);
  const [saved, setSaved] = useState<SavedChartSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Pick a store once, when the panel first appears.
  useEffect(() => {
    let cancelled = false;
    void chooseChartStore().then((s) => !cancelled && setStore(s));
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!store) return;
    try {
      setSaved(await store.list(schoolId));
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  }, [store, schoolId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Run a storage action with a busy flag and an error message on failure.
  const run = async (action: () => Promise<string | void>) => {
    if (!store) return;
    setBusy(true);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ text: done });
      await refresh();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const save = (asNew: boolean) =>
    run(async () => {
      const id = asNew ? undefined : (state.savedId ?? undefined);
      const result = await store!.save({ ...(id && { id }), schoolId, chart: state.chart });
      dispatch({ type: "saved", savedId: result.id });
      return `Saved “${result.name}”.`;
    });

  return (
    <Panel title="Saved plans">
      <p className="mb-2 text-xs text-zinc-500">
        {store === null
          ? "Checking where to save…"
          : store.kind === "server"
            ? "Saving to the database."
            : "Saving in this browser only (no database is set up)."}
      </p>
      <div className="mb-2 flex gap-2">
        <Button variant="primary" disabled={!store || busy} onClick={() => void save(false)}>
          {state.savedId ? "Save" : "Save plan"}
        </Button>
        {state.savedId && (
          <Button disabled={!store || busy} onClick={() => void save(true)}>
            Save as new
          </Button>
        )}
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mb-2 text-sm text-rose-700 dark:text-rose-400" : "mb-2 text-sm text-emerald-700 dark:text-emerald-400"}>
          {message.text}
        </p>
      )}
      <ul className="space-y-1">
        {saved.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate">
                {s.name}
                {s.id === state.savedId && <span className="text-zinc-500"> (open)</span>}
              </div>
              <div className="text-xs text-zinc-500">{new Date(s.updatedAt).toLocaleString()}</div>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const loaded = await store!.load(s.id);
                  if (!loaded) throw new Error("That plan couldn't be loaded.");
                  dispatch({ type: "loadChart", chart: loaded.chart, savedId: loaded.id });
                })
              }
            >
              Open
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              aria-label={`Delete ${s.name}`}
              onClick={() => {
                if (!window.confirm(`Delete “${s.name}”? This can't be undone.`)) return;
                void run(async () => {
                  await store!.remove(s.id);
                  if (s.id === state.savedId) dispatch({ type: "saved", savedId: null });
                });
              }}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
