import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { checkChart } from "../src/engine/check";
import { applyOverrides } from "../src/engine/overrides";
import { buildChart } from "../src/engine/scheduler";
import type { Override } from "../src/engine/types";
import { chartOf, obj, requirements } from "./helpers";

const catalog = createCatalog([
  obj("CS101"),
  obj("CS102", { previous: ["CS101"], minGrades: { CS101: "C" } }),
  obj("CS210", { previous: ["CS102"] }),
  obj("PHIL120"),
  obj("PHIL130"),
]);

const reqs = requirements({ requiredObjectIds: ["CS102", "PHIL120"] });
const codes = (result: { issues: { code: string }[] }) => result.issues.map((i) => i.code);

describe("overrides in checkChart", () => {
  it("waive-requisite removes the requisite for that object only", () => {
    const waive: Override = {
      id: "o1",
      kind: "waive-requisite",
      objectId: "CS102",
      requisiteId: "CS101",
      reason: "Placement exam",
    };
    const chart = chartOf([[], ["CS102", "PHIL120"]], { overrides: [waive] });
    const result = checkChart(catalog, chart, reqs);
    expect(codes(result)).toEqual([]);
    expect(result.appliedOverrides).toEqual([waive]);
  });

  it("substitute lets another object fill a requirement", () => {
    const chart = chartOf([[], ["CS101"], ["CS102", "PHIL130"]], {
      overrides: [
        { id: "o2", kind: "substitute", objectId: "PHIL120", substituteId: "PHIL130", reason: "Advisor" },
      ],
    });
    expect(codes(checkChart(catalog, chart, reqs))).toEqual([]);
  });

  it("waive-requirement drops a required object", () => {
    const chart = chartOf([[], ["CS101"], ["CS102"]], {
      overrides: [{ id: "o3", kind: "waive-requirement", objectId: "PHIL120", reason: "Transfer" }],
    });
    expect(codes(checkChart(catalog, chart, reqs))).toEqual([]);
  });

  it("applies a conditional override only when the grade condition is met", () => {
    const override: Override = {
      id: "o4",
      kind: "waive-requirement",
      objectId: "PHIL120",
      reason: "Honors standing",
      condition: { objectId: "CS101", minGrade: "B" },
    };
    const chartWith = (grade: "A" | "C") =>
      chartOf([[], ["CS101"], ["CS102"]], { overrides: [override], grades: { CS101: grade } });

    expect(codes(checkChart(catalog, chartWith("A"), reqs))).toEqual([]);
    expect(codes(checkChart(catalog, chartWith("C"), reqs))).toEqual([
      "OVERRIDE_CONDITION_NOT_MET",
      "MISSING_REQUIRED_OBJECT",
    ]);
  });

  it("rejects override kinds school policy doesn't allow", () => {
    const chart = chartOf([[], ["CS101"], ["CS102"]], {
      overrides: [{ id: "o5", kind: "waive-requirement", objectId: "PHIL120", reason: "?" }],
    });
    const strict = { ...reqs, allowedOverrides: ["substitute" as const] };
    expect(codes(checkChart(catalog, chart, strict))).toEqual([
      "OVERRIDE_NOT_ALLOWED",
      "MISSING_REQUIRED_OBJECT",
    ]);
  });

  it("reports overrides that mention unknown objects", () => {
    const chart = chartOf([[], ["CS101"], ["CS102", "PHIL120"]], {
      overrides: [{ id: "o6", kind: "substitute", objectId: "PHIL120", substituteId: "GHOST", reason: "?" }],
    });
    expect(codes(checkChart(catalog, chart, reqs))).toEqual(["OVERRIDE_UNKNOWN_OBJECT"]);
  });
});

describe("applyOverrides", () => {
  it("does not change the original catalog or requirements", () => {
    applyOverrides(catalog, reqs, [
      { id: "o7", kind: "waive-requisite", objectId: "CS102", requisiteId: "CS101", reason: "" },
      { id: "o8", kind: "waive-requirement", objectId: "PHIL120", reason: "" },
    ]);
    expect(catalog.get("CS102")!.requisites.previous).toEqual(["CS101"]);
    expect(reqs.requiredObjectIds).toEqual(["CS102", "PHIL120"]);
  });
});

describe("overrides in buildChart", () => {
  it("builds with overrides applied and keeps them on the chart", () => {
    const overrides: Override[] = [
      { id: "o9", kind: "waive-requisite", objectId: "CS210", requisiteId: "CS102", reason: "Exam" },
    ];
    const { chart, issues } = buildChart(
      catalog,
      requirements({ requiredObjectIds: ["CS210"] }),
      { overrides },
    );
    expect(issues).toEqual([]);
    expect(chart.terms[1].objectIds).toEqual(["CS210"]);
    expect(chart.overrides).toEqual(overrides);
    expect(checkChart(catalog, chart, requirements({ requiredObjectIds: ["CS210"] })).valid).toBe(true);
  });
});
