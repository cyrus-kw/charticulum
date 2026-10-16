// The two places charts can be saved, as seen from the browser.
import { chartSchema } from "../engine/index";
import type { ChartStore, SavedChart, SaveChartInput, SavedChartSummary } from "./types";

const STORAGE_KEY = "charticulum.charts.v1";

// Even reading `localStorage` can throw when a browser blocks storage.
export function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Saves in this browser's localStorage: works with no setup, but only on
// this device. Storage can be blocked (private windows, strict settings),
// so every access is wrapped in try/catch. Pass null for "no storage".
export function browserChartStore(storage: Storage | null = defaultStorage()): ChartStore {
  const readAll = (): SavedChart[] => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      const rows: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) return [];
      // Drop anything that no longer matches the chart format.
      return rows.flatMap((row) => {
        const chart = chartSchema.safeParse(row?.chart);
        return chart.success && typeof row.id === "string" ? [{ ...row, chart: chart.data } as SavedChart] : [];
      });
    } catch {
      return [];
    }
  };
  const writeAll = (rows: SavedChart[]) => {
    const blocked = new Error("This browser won't let Charticulum save (storage may be full or blocked).");
    if (!storage) throw blocked;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      throw blocked;
    }
  };
  const summary = ({ chart: _chart, ...rest }: SavedChart): SavedChartSummary => rest;

  return {
    kind: "browser",
    async list(schoolId) {
      return readAll()
        .filter((r) => r.schoolId === schoolId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summary);
    },
    async load(id) {
      return readAll().find((r) => r.id === id) ?? null;
    },
    async save({ id, schoolId, chart }: SaveChartInput) {
      const rows = readAll();
      const existing = id ? rows.find((r) => r.id === id) : undefined;
      const row: SavedChart = {
        id: existing?.id ?? crypto.randomUUID(),
        name: chart.name,
        schoolId,
        updatedAt: new Date().toISOString(),
        chart,
      };
      writeAll([row, ...rows.filter((r) => r.id !== row.id)]);
      return summary(row);
    },
    async remove(id) {
      writeAll(readAll().filter((r) => r.id !== id));
    },
  };
}

// Saves through the app's API to the server's database.
export function serverChartStore(fetchImpl: typeof fetch = fetch): ChartStore {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetchImpl(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Request failed (${response.status}).`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  };

  return {
    kind: "server",
    list: (schoolId) => request(`/api/charts?schoolId=${encodeURIComponent(schoolId)}`),
    load: async (id) => {
      try {
        return await request<SavedChart>(`/api/charts/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    save: (input) => request(`/api/charts`, { method: "POST", body: JSON.stringify(input) }),
    remove: (id) => request(`/api/charts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

// Use the database if the server has one, otherwise this browser.
export async function chooseChartStore(fetchImpl: typeof fetch = fetch): Promise<ChartStore> {
  try {
    const response = await fetchImpl("/api/storage");
    const { database } = (await response.json()) as { database?: boolean };
    if (database) return serverChartStore(fetchImpl);
  } catch {
    // Server unreachable: fall back to the browser.
  }
  return browserChartStore();
}
