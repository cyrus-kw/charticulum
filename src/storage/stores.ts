// Saving charts, as seen from the browser: requests to the app's
// /api/charts routes, which store them in the server's database.
import type { ChartStore, SavedChart } from "./types";

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
