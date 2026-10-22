import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { applyOverrides } from "../src/engine/overrides";
import { closestOption, describeRequired, requiredIds, stillNeededIds } from "../src/engine/required";
import { evaluateRequirements } from "../src/engine/requirements";
import { buildChart } from "../src/engine/scheduler";
import { validateChart } from "../src/engine/validate";
import { chartLayout } from "../src/planner/layout";
import { mergeRequirementSets } from "../src/engine/scopes";
import { parseSchoolData } from "../src/engine/school";
import { sampleSchoolData } from "../src/fixtures/sampleSchool";
import type { RequiredChoice } from "../src/engine/types";
import { chartOf, obj, requirements } from "./helpers";

// "MATH 230, or MATH 230H, or MATH 231 & MATH 232", like Penn State's.
const calculus: RequiredChoice = { oneOf: ["M230", "M230H", ["M231", "M232"]] };

const catalog = createCatalog([
  obj("M230", { credits: 4 }),
  obj("M230H", { credits: 4 }),
  obj("M231", { credits: 2 }),
  obj("M232", { credits: 2, previous: ["M231"] }),
  obj("CS101"),
]);

const missing = (terms: string[][]) =>
  evaluateRequirements(catalog, chartOf(terms), requirements({ requiredObjectIds: [calculus] })).issues;

describe("required choices", () => {
  it("is met by any one option", () => {
    expect(missing([[], ["M230"]])).toEqual([]);
    expect(missing([[], ["M230H"]])).toEqual([]);
    expect(missing([[], ["M231"], ["M232"]])).toEqual([]);
  });

  it("reports a choice with nothing on the plan once, about its first option", () => {
    const issues = missing([[], ["CS101"]]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "MISSING_REQUIRED_OBJECT", objectId: "M230" });
    expect(issues[0].message).toBe("Required: M230, M230H, or M231 & M232; none is in the chart.");
  });

  it("names what's missing from a partly taken option", () => {
    const issues = missing([[], ["M231"]]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ objectId: "M232", summary: "Required with M231, not on the plan" });
  });

  it("lists every option's courses as still needed until one is met", () => {
    const placed = new Set(["M231"]);
    expect(stillNeededIds([calculus, "CS101"], (id) => placed.has(id))).toEqual(["M230", "M230H", "M232", "CS101"]);
    placed.add("M232");
    expect(stillNeededIds([calculus, "CS101"], (id) => placed.has(id))).toEqual(["CS101"]);
  });

  it("is written out as a list", () => {
    expect(describeRequired(calculus)).toBe("M230, M230H, or M231 & M232");
    expect(describeRequired({ oneOf: ["A", "B"] })).toBe("A or B");
    expect(requiredIds([calculus, "M230"])).toEqual(["M230", "M230H", "M231", "M232"]);
  });

  it("gives every option a minimum grade asked for in one of them", () => {
    const merged = mergeRequirementSets([
      { id: "cs", name: "CS", scope: "local", requiredObjectIds: [calculus], minGrades: { M230: "C" } },
    ]);
    expect(merged.minGrades).toEqual({ M230: "C", M230H: "C", M231: "C", M232: "C" });
  });

  it("keeps a choice listed by two sets once", () => {
    const merged = mergeRequirementSets([
      { id: "a", name: "A", scope: "global", requiredObjectIds: [calculus] },
      { id: "b", name: "B", scope: "local", requiredObjectIds: [{ oneOf: ["M230", "M230H", ["M231", "M232"]] }] },
    ]);
    expect(merged.requiredObjectIds).toHaveLength(1);
  });

  it("is waived whole by waiving any of its courses", () => {
    const { requirements: waived } = applyOverrides(catalog, requirements({ requiredObjectIds: [calculus, "CS101"] }), [
      { id: "w", kind: "waive-requirement", objectId: "M231", reason: "test" },
    ]);
    expect(waived.requiredObjectIds).toEqual(["CS101"]);
  });

  it("is built from its first option, or the one Pre-Credit started", () => {
    const first = buildChart(catalog, requirements({ requiredObjectIds: [calculus] }));
    expect(first.chart.terms.flatMap((t) => t.objectIds)).toEqual(["M230"]);

    // With MATH 231 already done, the rest of its option is what's needed.
    expect(closestOption(calculus, (id) => id === "M231")).toEqual(["M231", "M232"]);
    expect(closestOption(calculus, (id) => id === "M230H")).toEqual(["M230H"]);
  });

  it("parses from school data, and rejects a one-option choice", () => {
    // The sample school, with one more school-wide set holding the choice.
    const school = (oneOf: unknown[]) => ({
      ...sampleSchoolData,
      programRequirements: [
        ...(sampleSchoolData.programRequirements ?? []),
        { degree: "choice", requiredObjectIds: [{ oneOf }] },
      ],
    });
    expect(parseSchoolData(school(["CS101", ["CS102", "CS102L"]])).ok).toBe(true);
    expect(parseSchoolData(school(["CS101"])).ok).toBe(false);
    // An unknown course inside a choice is caught like any other.
    expect(parseSchoolData(school(["CS101", "NOPE999"])).ok).toBe(false);
  });
});

describe("requisite choices", () => {
  // CALC needs "M230, or M230H, or M231 & M232" first.
  const withCalc = createCatalog([...catalog.values(), obj("CALC", { previous: [calculus] })]);
  const problems = (terms: string[][]) => validateChart(withCalc, chartOf(terms));

  it("is met by any one option taken earlier", () => {
    expect(problems([[], ["M230H"], ["CALC"]])).toEqual([]);
    expect(problems([[], ["M231"], ["M232"], ["CALC"]])).toEqual([]);
  });

  it("names the choice, and the course out of place in the closest option", () => {
    const [issue] = problems([[], ["M231"], ["CALC", "M232"]]);
    expect(issue).toMatchObject({ code: "PREVIOUS_REQUISITE_NOT_MET", objectId: "CALC", requisiteId: "M232" });
    expect(issue.message).toBe("CALC needs M230, M230H, or M231 & M232 completed in an earlier term.");
  });

  it("is waived whole by waiving any of its courses", () => {
    const { catalog: waived } = applyOverrides(withCalc, requirements(), [
      { id: "w", kind: "waive-requisite", objectId: "CALC", requisiteId: "M230H", reason: "test" },
    ]);
    expect(waived.get("CALC")!.requisites.previous).toEqual([]);
  });

  it("is built from its first option", () => {
    const { chart } = buildChart(withCalc, requirements({ requiredObjectIds: ["CALC"] }));
    expect(chart.terms.map((t) => t.objectIds)).toEqual([[], ["M230"], ["CALC"]]);
  });

  it("draws arrows from the option that's met, not the others", () => {
    const { edges } = chartLayout(withCalc, chartOf([[], ["M230", "M231"], ["CALC"]]), [], {}, 18);
    expect(edges.filter((e) => e.target === "CALC").map((e) => e.source)).toEqual(["M230"]);
  });
});
