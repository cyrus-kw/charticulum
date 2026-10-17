import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { checkChart } from "../src/engine/check";
import { buildChart } from "../src/engine/scheduler";
import { obj, requirements } from "./helpers";

// Term number for each object in a built chart.
const termOf = (chart: ReturnType<typeof buildChart>["chart"]) =>
  Object.fromEntries(chart.terms.flatMap((t) => t.objectIds.map((id) => [id, t.index])));

describe("buildChart", () => {
  it("orders a prerequisite chain across terms", () => {
    const catalog = createCatalog([
      obj("A"),
      obj("B", { previous: ["A"] }),
      obj("C", { previous: ["B"] }),
    ]);
    const { chart, issues } = buildChart(catalog, requirements({ requiredObjectIds: ["C"] }));
    expect(issues).toEqual([]);
    expect(termOf(chart)).toEqual({ A: 1, B: 2, C: 3 });
  });

  it("pulls in requisites that weren't listed as required", () => {
    const catalog = createCatalog([obj("A"), obj("B", { previous: ["A"] })]);
    const { chart } = buildChart(catalog, requirements({ requiredObjectIds: ["B"] }));
    expect(termOf(chart)).toHaveProperty("A");
  });

  it("respects the per-term credit limit", () => {
    const catalog = createCatalog([obj("A"), obj("B"), obj("C")]);
    const { chart } = buildChart(
      catalog,
      requirements({ requiredObjectIds: ["A", "B", "C"], maxCreditsPerTerm: 6 }),
    );
    expect(chart.terms[1].objectIds).toHaveLength(2);
    expect(chart.terms[2].objectIds).toHaveLength(1);
  });

  it("places concurrent requisites in the same term", () => {
    const catalog = createCatalog([
      obj("LAB", { concurrent: ["LECTURE"], credits: 1 }),
      obj("LECTURE"),
    ]);
    const { chart } = buildChart(catalog, requirements({ requiredObjectIds: ["LAB"] }));
    expect(termOf(chart)).toEqual({ LECTURE: 1, LAB: 1 });
  });

  it("schedules long chains first", () => {
    // A starts a 3-long chain, so it should take the one open seat in Term 1.
    const catalog = createCatalog([
      obj("A"),
      obj("B", { previous: ["A"] }),
      obj("C", { previous: ["B"] }),
      obj("Z"),
    ]);
    const { chart } = buildChart(
      catalog,
      requirements({ requiredObjectIds: ["C", "Z"], maxCreditsPerTerm: 3 }),
    );
    expect(chart.terms[1].objectIds).toEqual(["A"]);
  });

  it("uses Pre-Credit credit instead of scheduling the object", () => {
    const catalog = createCatalog([
      obj("MATH101", { externalEquivalents: [{ institution: "AP", externalId: "CALC-AB" }] }),
      obj("MATH102", { previous: ["MATH101"] }),
    ]);
    const { chart } = buildChart(catalog, requirements({ requiredObjectIds: ["MATH102"] }), {
      completedExternal: [{ institution: "AP", externalId: "CALC-AB" }],
    });
    expect(termOf(chart)).toEqual({ MATH101: 0, MATH102: 1 });
  });

  it("reports prerequisite cycles", () => {
    const catalog = createCatalog([obj("A", { previous: ["B"] }), obj("B", { previous: ["A"] })]);
    const { issues } = buildChart(catalog, requirements({ requiredObjectIds: ["A"] }));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("REQUISITE_CYCLE");
    expect(codes.filter((c) => c === "UNSCHEDULABLE")).toHaveLength(2);
  });

  it("reports unknown objects and objects over the term limit", () => {
    const catalog = createCatalog([obj("HUGE", { credits: 30 })]);
    const { issues } = buildChart(
      catalog,
      requirements({ requiredObjectIds: ["HUGE", "GHOST"] }),
    );
    expect(issues.map((i) => i.code).sort()).toEqual([
      "OBJECT_EXCEEDS_TERM_LIMIT",
      "UNKNOWN_OBJECT",
    ]);
  });

  it("produces charts that pass checkChart", () => {
    const catalog = createCatalog([
      obj("A", { categories: ["major"] }),
      obj("B", { previous: ["A"], categories: ["major"] }),
      obj("LAB", { concurrent: ["B"], credits: 1 }),
      obj("GE1", { categories: ["general-education"] }),
    ]);
    const reqs = requirements({
      requiredObjectIds: ["B", "LAB", "GE1"],
      maxCreditsPerTerm: 6,
    });
    const { chart, issues } = buildChart(catalog, reqs);
    expect(issues).toEqual([]);
    expect(checkChart(catalog, chart, reqs).issues).toEqual([]);
  });
});
