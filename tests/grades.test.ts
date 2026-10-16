import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog.js";
import { chartGpa, meetsGrade } from "../src/engine/grades.js";
import { evaluateRequirements } from "../src/engine/requirements.js";
import { mergeRequirementSets } from "../src/engine/scopes.js";
import { validateChart } from "../src/engine/validate.js";
import { chartOf, obj, requirements } from "./helpers.js";

const catalog = createCatalog([
  obj("CS101", { credits: 4, internalEquivalents: ["CS101H"] }),
  obj("CS101H", { credits: 4 }),
  obj("CS102", { previous: ["CS101"], minGrades: { CS101: "C" } }),
  obj("ORIENT", { credits: 0 }),
]);

describe("meetsGrade", () => {
  it("compares on the 4.0 scale", () => {
    expect(meetsGrade("B-", "C")).toBe(true);
    expect(meetsGrade("C", "C")).toBe(true);
    expect(meetsGrade("C-", "C")).toBe(false);
  });
});

describe("requisite minimum grades", () => {
  const codes = (grades: Record<string, "A" | "C-" | "B">, first = ["CS101"]) =>
    validateChart(catalog, chartOf([[], first, ["CS102"]], { grades })).map((i) => i.code);

  it("flags a requisite passed below the minimum", () => {
    expect(codes({ CS101: "C-" })).toEqual(["REQUISITE_GRADE_TOO_LOW"]);
  });

  it("accepts a grade at or above the minimum", () => {
    expect(codes({ CS101: "B" })).toEqual([]);
  });

  it("treats ungraded requisites as still planned", () => {
    expect(codes({})).toEqual([]);
  });

  it("accepts a passing grade in any equivalent", () => {
    expect(codes({ CS101: "C-", CS101H: "A" }, ["CS101", "CS101H"])).toEqual([]);
  });
});

describe("GPA", () => {
  it("weights by credits and ignores 0-credit objects", () => {
    const chart = chartOf([[], ["CS101", "CS102", "ORIENT"]], {
      grades: { CS101: "A", CS102: "C", ORIENT: "F" },
    });
    // (4.0 * 4 + 2.0 * 3) / 7
    expect(chartGpa(catalog, chart)).toBeCloseTo(22 / 7);
  });

  it("is undefined with no grades", () => {
    expect(chartGpa(catalog, chartOf([[], ["CS101"]]))).toBeUndefined();
  });

  it("flags a GPA below the minimum", () => {
    const chart = chartOf([[], ["CS101"]], { grades: { CS101: "C" } });
    const report = evaluateRequirements(catalog, chart, requirements({ minGpa: 2.5 }));
    expect(report.issues.map((i) => i.code)).toEqual(["GPA_BELOW_MINIMUM"]);
  });

  it("keeps the higher GPA minimum when merging sets", () => {
    const merged = mergeRequirementSets([
      { id: "g", name: "g", scope: "global", minGpa: 2.0 },
      { id: "l", name: "l", scope: "local", minGpa: 2.5 },
    ]);
    expect(merged.minGpa).toBe(2.5);
  });
});
