import { describe, expect, it } from "vitest";
import { loadSchool, parseSchoolData } from "../src/engine/index";
import { sampleSchoolData } from "../src/fixtures/sampleSchool";
import { chartLayout, termIndexAt, COLUMN_WIDTH } from "../src/planner/layout";
import { derive, initialState, nextTerm, plannerReducer, type PlannerState } from "../src/planner/state";

function sampleState(): PlannerState {
  const parsed = parseSchoolData(sampleSchoolData);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return initialState(loadSchool(parsed.data), "bs-cs");
}

const termWith = (state: PlannerState, id: string) =>
  state.chart.terms.find((t) => t.objectIds.includes(id))?.index;

describe("plannerReducer", () => {
  it("starts from the latest version of the program", () => {
    const state = sampleState();
    expect(state.chart.pinnedTemplates).toEqual([{ templateId: "bs-cs", version: "2026-27" }]);
    expect(derive(state).check.valid).toBe(true);
  });

  it("moves an object and reports the resulting problem", () => {
    const state = plannerReducer(sampleState(), { type: "move", objectId: "CS301", termIndex: 1 });
    expect(termWith(state, "CS301")).toBe(1);
    const codes = derive(state).check.issues.map((i) => i.code);
    expect(codes).toContain("PREVIOUS_REQUISITE_NOT_MET");
    expect(codes).toContain("NOT_OFFERED"); // CS301 is spring-only; Term 1 is fall
  });

  it("refuses moves into Term 0 or unknown terms", () => {
    const state = sampleState();
    expect(plannerReducer(state, { type: "move", objectId: "CS101", termIndex: 0 })).toBe(state);
    expect(plannerReducer(state, { type: "move", objectId: "CS101", termIndex: 99 })).toBe(state);
  });

  it("removes an object and clears the selection", () => {
    let state = plannerReducer(sampleState(), { type: "select", objectId: "HIST110" });
    state = plannerReducer(state, { type: "remove", objectId: "HIST110" });
    expect(termWith(state, "HIST110")).toBeUndefined();
    expect(state.selectedId).toBeNull();
    expect(derive(state).check.issues.map((i) => i.code)).toContain("MISSING_REQUIRED_OBJECT");
  });

  it("adds the next calendar term", () => {
    const state = plannerReducer(sampleState(), { type: "addTerm" });
    expect(state.chart.terms.at(-1)?.label).toBe("Spring 2029");
  });

  it("moves outside credit into Term 0", () => {
    const state = plannerReducer(sampleState(), {
      type: "addExternal",
      work: { institution: "AP", externalId: "CS-A" },
    });
    const view = derive(state);
    expect(view.chart.terms[0].objectIds).toEqual(["CS101"]);
    expect(view.check.valid).toBe(true);
  });

  it("ignores duplicate outside credit and can remove it", () => {
    const work = { institution: "AP", externalId: "CS-A" };
    let state = plannerReducer(sampleState(), { type: "addExternal", work });
    state = plannerReducer(state, { type: "addExternal", work });
    expect(state.chart.completedExternal).toHaveLength(1);
    state = plannerReducer(state, { type: "removeExternal", work });
    expect(state.chart.completedExternal).toEqual([]);
  });

  it("sets and clears grades", () => {
    let state = plannerReducer(sampleState(), { type: "setGrade", objectId: "CS101", grade: "D" });
    expect(derive(state).check.report.gpa).toBe(1);
    expect(derive(state).check.issues.map((i) => i.code)).toContain("GPA_BELOW_MINIMUM");
    state = plannerReducer(state, { type: "setGrade", objectId: "CS101", grade: null });
    expect(state.chart.grades).toEqual({});
  });

  it("adds a minor by merging, and won't add it twice", () => {
    const ref = { templateId: "minor-stats", version: "2026-27" };
    const once = plannerReducer(sampleState(), { type: "addProgram", ref });
    expect(once.chart.pinnedTemplates).toHaveLength(2);
    expect(plannerReducer(once, { type: "addProgram", ref })).toBe(once);
    expect(derive(once).requirements.requiredObjectIds).toContain("STAT310");
  });

  it("builds a valid chart for a major plus a minor", () => {
    let state = plannerReducer(sampleState(), {
      type: "addProgram",
      ref: { templateId: "minor-stats", version: "2026-27" },
    });
    state = plannerReducer(state, { type: "build" });
    expect(state.builderIssues).toEqual([]);
    expect(state.chart.pinnedTemplates).toHaveLength(2);
    expect(derive(state).check.issues).toEqual([]);
  });

  it("applies and removes overrides", () => {
    // SPAN-PROF is worth 0 credits, so waiving it can't cause a credit shortfall.
    let state = plannerReducer(sampleState(), { type: "remove", objectId: "SPAN-PROF" });
    state = plannerReducer(state, {
      type: "addOverride",
      override: { id: "w1", kind: "waive-requirement", objectId: "SPAN-PROF", reason: "Native speaker" },
    });
    expect(derive(state).check.valid).toBe(true);
    state = plannerReducer(state, { type: "removeOverride", id: "w1" });
    expect(derive(state).check.valid).toBe(false);
  });

  it("switching programs keeps outside credit", () => {
    let state = plannerReducer(sampleState(), {
      type: "addExternal",
      work: { institution: "AP", externalId: "CS-A" },
    });
    state = plannerReducer(state, {
      type: "startProgram",
      ref: { templateId: "bs-cs", version: "2025-26" },
    });
    expect(state.chart.pinnedTemplates?.[0].version).toBe("2025-26");
    expect(state.chart.completedExternal).toHaveLength(1);
  });
});

describe("nextTerm", () => {
  it("falls back to plain numbering without calendar data", () => {
    const chart = { name: "x", completedExternal: [], terms: [{ index: 0, label: "T0", objectIds: [] }] };
    expect(nextTerm(chart, ["fall", "spring"])).toEqual({ index: 1, label: "Term 1", objectIds: [] });
  });
});

describe("chartLayout", () => {
  const state = sampleState();
  const view = derive(state);
  const { nodes, edges } = chartLayout(
    state.school.catalog,
    view.chart,
    view.check.issues,
    view.check.report.creditsByTerm,
    view.requirements.maxCreditsPerTerm,
  );

  it("makes a column per term and a card per object", () => {
    expect(nodes.filter((n) => n.type === "term")).toHaveLength(view.chart.terms.length);
    const placed = view.chart.terms.flatMap((t) => t.objectIds);
    expect(nodes.filter((n) => n.type === "course").map((n) => n.id).sort()).toEqual(placed.sort());
  });

  it("draws requisite arrows, red only when the order is wrong", () => {
    expect(edges.find((e) => e.id === "CS101->CS102")?.className).toBe("requisite-edge");
    const moved = plannerReducer(state, { type: "move", objectId: "CS101", termIndex: 3 });
    const movedView = derive(moved);
    const broken = chartLayout(moved.school.catalog, movedView.chart, movedView.check.issues, {}, 12);
    expect(broken.edges.find((e) => e.id === "CS101->CS102")?.className).toContain("broken");
  });

  it("maps a drop position to a term, never Term 0", () => {
    expect(termIndexAt(view.chart, 0)).toBe(1);
    expect(termIndexAt(view.chart, 2 * COLUMN_WIDTH + 30)).toBe(2);
    expect(termIndexAt(view.chart, 999 * COLUMN_WIDTH)).toBe(view.chart.terms.at(-1)!.index);
  });
});
