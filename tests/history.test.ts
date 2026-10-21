import { describe, expect, it } from "vitest";
import { loadSampleSchool } from "../src/fixtures/sampleSchool";
import { HISTORY_LIMIT, historyReducer, startHistory, type HistoryAction, type PlannerHistory } from "../src/planner/history";
import { initialState } from "../src/planner/state";

const start = () => startHistory(initialState(loadSampleSchool(), "bs-cs"));
const run = (history: PlannerHistory, ...actions: HistoryAction[]) => actions.reduce(historyReducer, history);
const termOf = (h: PlannerHistory, id: string) => h.present.chart.terms.find((t) => t.objectIds.includes(id))?.index;

describe("undo and redo", () => {
  it("undoes and redoes a move", () => {
    const h0 = start();
    const before = termOf(h0, "HIST110");
    const moved = run(h0, { type: "move", objectId: "HIST110", termIndex: 1 });
    expect(termOf(moved, "HIST110")).toBe(1);
    const undone = run(moved, { type: "undo" });
    expect(termOf(undone, "HIST110")).toBe(before);
    expect(undone.present.chart).toBe(h0.present.chart);
    const redone = run(undone, { type: "redo" });
    expect(termOf(redone, "HIST110")).toBe(1);
  });

  it("steps back through several changes in order", () => {
    const h = run(
      start(),
      { type: "move", objectId: "HIST110", termIndex: 1 },
      { type: "setGrade", objectId: "CS101", grade: "A" },
      { type: "remove", objectId: "ENG101" },
    );
    expect(h.past).toHaveLength(3);
    const back2 = run(h, { type: "undo" }, { type: "undo" });
    expect(termOf(back2, "ENG101")).toBeDefined();
    expect(back2.present.chart.grades?.CS101).toBeUndefined();
    expect(termOf(back2, "HIST110")).toBe(1);
    expect(back2.future).toHaveLength(2);
  });

  it("drops the redo steps after a new change", () => {
    const h = run(start(), { type: "move", objectId: "HIST110", termIndex: 1 }, { type: "undo" });
    expect(h.future).toHaveLength(1);
    const changed = run(h, { type: "addTerm" });
    expect(changed.future).toHaveLength(0);
    expect(run(changed, { type: "redo" })).toBe(changed);
  });

  it("does nothing with nothing to undo or redo", () => {
    const h = start();
    expect(run(h, { type: "undo" })).toBe(h);
    expect(run(h, { type: "redo" })).toBe(h);
  });

  it("doesn't record selection as an undo step", () => {
    const h = run(start(), { type: "select", objectId: "CS101" });
    expect(h.past).toHaveLength(0);
  });

  it("keeps the saved copy and clears the selection when undoing", () => {
    let h = run(start(), { type: "move", objectId: "HIST110", termIndex: 1 });
    h = run(h, { type: "saved", savedId: "abc" }, { type: "select", objectId: "CS101" });
    const undone = run(h, { type: "undo" });
    expect(undone.present.savedId).toBe("abc");
    expect(undone.present.selectedId).toBeNull();
  });

  it("lays out fresh when undoing a whole new plan, but not a small change", () => {
    const h0 = start();
    const built = run(h0, { type: "build" });
    const undoneBuild = run(built, { type: "undo" });
    expect(undoneBuild.present.layoutVersion).toBeGreaterThan(built.present.layoutVersion);
    const moved = run(h0, { type: "move", objectId: "HIST110", termIndex: 1 });
    expect(run(moved, { type: "undo" }).present.layoutVersion).toBe(moved.present.layoutVersion);
  });

  it("starts over when a different plan is opened", () => {
    const h = run(start(), { type: "move", objectId: "HIST110", termIndex: 1 });
    const opened = run(h, { type: "loadChart", chart: h.present.chart, savedId: "x" });
    expect([opened.past.length, opened.future.length]).toEqual([0, 0]);
  });

  it("remembers at most HISTORY_LIMIT steps", () => {
    let h = start();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = run(h, { type: "addTerm" });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
