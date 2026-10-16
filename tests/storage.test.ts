import { describe, expect, it } from "vitest";
import type { Chart } from "../src/engine/index";
import { chartHandlers } from "../src/server/chartHandlers";
import { memoryChartRepository, type ChartRepository } from "../src/server/chartRepository";
import { browserChartStore, chooseChartStore, serverChartStore } from "../src/storage/stores";
import { chartOf } from "./helpers";

const chart: Chart = chartOf([[], ["CS101"]], { name: "My plan", grades: { CS101: "A" } });

// A fake localStorage, so the browser store can be tested in Node.
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

// fetch that goes straight to the route handlers, no server needed.
function fetchInto(repo: ChartRepository | null, owner = "local"): typeof fetch {
  const handlers = chartHandlers(() => repo, () => owner);
  return async (input, init) => {
    const request = new Request(new URL(String(input), "http://test"), init);
    const { pathname } = new URL(request.url);
    if (pathname === "/api/storage") return Response.json({ database: repo !== null });
    const id = pathname.match(/^\/api\/charts\/(.+)$/)?.[1];
    if (id && request.method === "GET") return handlers.get(request, decodeURIComponent(id));
    if (id && request.method === "DELETE") return handlers.remove(request, decodeURIComponent(id));
    if (request.method === "POST") return handlers.save(request);
    return handlers.list(request);
  };
}

describe("chart handlers", () => {
  const post = (body: unknown) =>
    new Request("http://test/api/charts", { method: "POST", body: JSON.stringify(body) });

  it("returns 503 when there is no database", async () => {
    const handlers = chartHandlers(() => null);
    expect((await handlers.list(new Request("http://test/api/charts?schoolId=s"))).status).toBe(503);
  });

  it("creates, updates, lists, loads, and deletes", async () => {
    const handlers = chartHandlers(() => repo);
    const repo = memoryChartRepository();

    const created = await handlers.save(post({ schoolId: "s", chart }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const updated = await handlers.save(post({ id, schoolId: "s", chart: { ...chart, name: "Renamed" } }));
    expect(updated.status).toBe(200);

    const list = (await (await handlers.list(new Request("http://test/api/charts?schoolId=s"))).json()) as unknown[];
    expect(list).toEqual([expect.objectContaining({ id, name: "Renamed" })]);

    const loaded = (await (await handlers.get(new Request("http://test"), id)).json()) as { chart: Chart };
    expect(loaded.chart.grades).toEqual({ CS101: "A" });

    expect((await handlers.remove(new Request("http://test"), id)).status).toBe(204);
    expect((await handlers.get(new Request("http://test"), id)).status).toBe(404);
  });

  it("rejects bad input", async () => {
    const handlers = chartHandlers(() => memoryChartRepository());
    expect((await handlers.save(post({ schoolId: "s" }))).status).toBe(400);
    expect((await handlers.save(post({ schoolId: "s", chart: { ...chart, terms: "nope" } }))).status).toBe(400);
    const notJson = new Request("http://test/api/charts", { method: "POST", body: "{" });
    expect((await handlers.save(notJson)).status).toBe(400);
    expect((await handlers.list(new Request("http://test/api/charts"))).status).toBe(400);
    expect((await handlers.save(post({ id: "missing", schoolId: "s", chart }))).status).toBe(404);
  });

  it("rejects oversized bodies", async () => {
    const handlers = chartHandlers(() => memoryChartRepository());
    const huge = { schoolId: "s", chart: { ...chart, name: "x".repeat(1_100_000) } };
    expect((await handlers.save(post(huge))).status).toBe(413);
  });

  it("keeps each owner's charts separate", async () => {
    const repo = memoryChartRepository();
    const alice = chartHandlers(() => repo, () => "alice");
    const bob = chartHandlers(() => repo, () => "bob");
    const { id } = (await (await alice.save(post({ schoolId: "s", chart }))).json()) as { id: string };

    expect((await bob.get(new Request("http://test"), id)).status).toBe(404);
    expect((await bob.save(post({ id, schoolId: "s", chart }))).status).toBe(404);
    expect((await bob.remove(new Request("http://test"), id)).status).toBe(404);
    expect((await alice.get(new Request("http://test"), id)).status).toBe(200);
  });
});

describe.each([
  ["browser", () => browserChartStore(fakeStorage())],
  ["server", () => serverChartStore(fetchInto(memoryChartRepository()))],
])("%s chart store", (_name, makeStore) => {
  it("saves, lists per school, loads, updates, and removes", async () => {
    const store = makeStore();
    const first = await store.save({ schoolId: "s", chart });
    await store.save({ schoolId: "other", chart: { ...chart, name: "Elsewhere" } });

    expect((await store.list("s")).map((c) => c.name)).toEqual(["My plan"]);
    expect((await store.load(first.id))?.chart).toEqual(chart);

    await store.save({ id: first.id, schoolId: "s", chart: { ...chart, name: "Renamed" } });
    expect((await store.list("s")).map((c) => [c.id, c.name])).toEqual([[first.id, "Renamed"]]);

    await store.remove(first.id);
    expect(await store.list("s")).toEqual([]);
    expect(await store.load(first.id)).toBeNull();
  });
});

describe("browserChartStore", () => {
  it("ignores corrupted saved data instead of crashing", async () => {
    const storage = fakeStorage();
    storage.setItem("charticulum.charts.v1", "{not json");
    expect(await browserChartStore(storage).list("s")).toEqual([]);
    storage.setItem("charticulum.charts.v1", JSON.stringify([{ id: "x", schoolId: "s", chart: { bad: true } }]));
    expect(await browserChartStore(storage).list("s")).toEqual([]);
  });

  it("lists nothing and explains failed saves when storage is unavailable", async () => {
    const store = browserChartStore(null);
    expect(await store.list("s")).toEqual([]);
    await expect(store.save({ schoolId: "s", chart })).rejects.toThrow(/won't let Charticulum save/);
  });
});

describe("chooseChartStore", () => {
  it("uses the server when it has a database", async () => {
    expect((await chooseChartStore(fetchInto(memoryChartRepository()))).kind).toBe("server");
  });

  it("falls back to the browser otherwise", async () => {
    expect((await chooseChartStore(fetchInto(null))).kind).toBe("browser");
    const offline: typeof fetch = async () => {
      throw new Error("offline");
    };
    expect((await chooseChartStore(offline)).kind).toBe("browser");
  });
});
