import { describe, expect, it } from "vitest";
import type { Chart } from "../src/engine/index";
import { chartHandlers } from "../src/server/chartHandlers";
import { memoryChartRepository, type ChartRepository } from "../src/server/chartRepository";
import { serverChartStore } from "../src/storage/stores";
import { chartOf } from "./helpers";

const chart: Chart = chartOf([[], ["CS101"]], { name: "My plan", grades: { CS101: "A" } });

// fetch that goes straight to the route handlers, no server needed.
function fetchInto(repo: ChartRepository | null, owner = "local"): typeof fetch {
  const handlers = chartHandlers(() => repo, async () => owner);
  return async (input, init) => {
    const request = new Request(new URL(String(input), "http://test"), init);
    const { pathname } = new URL(request.url);
    const id = pathname.match(/^\/api\/charts\/(.+)$/)?.[1];
    if (id && request.method === "GET") return handlers.get(request, decodeURIComponent(id));
    if (id && request.method === "DELETE") return handlers.remove(request, decodeURIComponent(id));
    if (request.method === "POST") return handlers.save(request);
    return handlers.list(request);
  };
}

// Who the handlers think is asking: someone signed in, or nobody.
const signedIn = async () => "me";
const nobody = async () => null;

describe("chart handlers", () => {
  const post = (body: unknown) =>
    new Request("http://test/api/charts", { method: "POST", body: JSON.stringify(body) });

  it("returns 503 when there is no database", async () => {
    const handlers = chartHandlers(() => null, signedIn);
    expect((await handlers.list(new Request("http://test/api/charts?schoolId=s"))).status).toBe(503);
  });

  it("returns 401 when nobody is signed in", async () => {
    const handlers = chartHandlers(() => memoryChartRepository(), nobody);
    const response = await handlers.list(new Request("http://test/api/charts?schoolId=s"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/Sign in/);
  });

  it("explains a database that is down or not set up", async () => {
    // A repository whose every call fails the way Prisma does.
    const failing = (code: string): ChartRepository => {
      const fail = () => Promise.reject(Object.assign(new Error("db"), { code }));
      return { list: fail, get: fail, save: fail, remove: fail };
    };
    const quiet = console.error;
    console.error = () => {}; // the handler logs the error; keep test output clean
    try {
      const down = await chartHandlers(() => failing("ECONNREFUSED"), signedIn).list(new Request("http://test/api/charts?schoolId=s"));
      expect(down.status).toBe(503);
      expect((await down.json()).error).toMatch(/Couldn't reach the database while loading your saved plans/);

      const unmigrated = await chartHandlers(() => failing("P2021"), signedIn).save(post({ schoolId: "s", chart }));
      expect((await unmigrated.json()).error).toMatch(/db:migrate/);
    } finally {
      console.error = quiet;
    }
  });

  it("creates, updates, lists, loads, and deletes", async () => {
    const handlers = chartHandlers(() => repo, signedIn);
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
    const handlers = chartHandlers(() => memoryChartRepository(), signedIn);
    expect((await handlers.save(post({ schoolId: "s" }))).status).toBe(400);
    expect((await handlers.save(post({ schoolId: "s", chart: { ...chart, terms: "nope" } }))).status).toBe(400);
    const notJson = new Request("http://test/api/charts", { method: "POST", body: "{" });
    expect((await handlers.save(notJson)).status).toBe(400);
    expect((await handlers.list(new Request("http://test/api/charts"))).status).toBe(400);
    expect((await handlers.save(post({ id: "missing", schoolId: "s", chart }))).status).toBe(404);
  });

  it("rejects oversized bodies", async () => {
    const handlers = chartHandlers(() => memoryChartRepository(), signedIn);
    const huge = { schoolId: "s", chart: { ...chart, name: "x".repeat(1_100_000) } };
    expect((await handlers.save(post(huge))).status).toBe(413);
  });

  it("keeps each owner's charts separate", async () => {
    const repo = memoryChartRepository();
    const alice = chartHandlers(() => repo, async () => "alice");
    const bob = chartHandlers(() => repo, async () => "bob");
    const { id } = (await (await alice.save(post({ schoolId: "s", chart }))).json()) as { id: string };

    expect((await bob.get(new Request("http://test"), id)).status).toBe(404);
    expect((await bob.save(post({ id, schoolId: "s", chart }))).status).toBe(404);
    expect((await bob.remove(new Request("http://test"), id)).status).toBe(404);
    expect((await alice.get(new Request("http://test"), id)).status).toBe(200);
  });
});

describe("server chart store", () => {
  it("saves, lists per school, loads, updates, and removes", async () => {
    const store = serverChartStore(fetchInto(memoryChartRepository()));
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

describe("memoryChartRepository", () => {
  it("lists every school's charts when no school is given", async () => {
    const repo = memoryChartRepository();
    await repo.save("me", { schoolId: "a", chart });
    await repo.save("me", { schoolId: "b", chart: { ...chart, name: "Second" } });
    await repo.save("someone else", { schoolId: "a", chart });
    expect((await repo.list("me")).map((c) => c.name)).toEqual(["Second", "My plan"]);
  });
});
