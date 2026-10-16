import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { evaluateRequirements } from "../src/engine/requirements";
import { chartOf, obj, requirements } from "./helpers";

const catalog = createCatalog([
  obj("CS101", { categories: ["major"], credits: 4 }),
  obj("CS102", { categories: ["major"], credits: 4 }),
  obj("STAT200", { categories: ["major", "general-education"], credits: 3 }),
  obj("ART100", { categories: ["general-education"], credits: 3 }),
  obj("HON101", { internalEquivalents: ["CS101"], categories: ["major"], credits: 4 }),
]);

const codes = (report: { issues: { code: string }[] }) => report.issues.map((i) => i.code);

describe("evaluateRequirements", () => {
  it("totals credits per term and overall", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["CS101", "ART100"], ["CS102"]]),
      requirements(),
    );
    expect(report.creditsByTerm).toEqual({ 0: 0, 1: 7, 2: 4 });
    expect(report.totalCredits).toBe(11);
  });

  it("flags a term over the credit limit", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["CS101", "CS102", "STAT200"]]),
      requirements({ maxCreditsPerTerm: 10 }),
    );
    expect(codes(report)).toEqual(["TERM_OVER_CREDIT_LIMIT"]);
  });

  it("does not apply the credit limit to Term 0", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([["CS101", "CS102", "STAT200"]]),
      requirements({ maxCreditsPerTerm: 10 }),
    );
    expect(codes(report)).toEqual([]);
  });

  it("reports missing required objects", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["CS101"]]),
      requirements({ requiredObjectIds: ["CS101", "CS102"] }),
    );
    expect(report.missingRequired).toEqual(["CS102"]);
    expect(codes(report)).toEqual(["MISSING_REQUIRED_OBJECT"]);
  });

  it("counts an internal equivalent toward a required object", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["HON101"]]),
      requirements({ requiredObjectIds: ["CS101"] }),
    );
    expect(report.missingRequired).toEqual([]);
  });

  it("double counts across categories when policy allows", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["STAT200"]]),
      requirements({ allowDoubleCounting: true }),
    );
    expect(report.creditsByCategory).toEqual({ major: 3, "general-education": 3 });
  });

  it("counts only the first category when double counting is off", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["STAT200"]]),
      requirements({ allowDoubleCounting: false }),
    );
    expect(report.creditsByCategory).toEqual({ major: 3 });
  });

  it("flags category and total credit shortfalls", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["CS101"]]),
      requirements({ minCreditsByCategory: { major: 8 }, minTotalCredits: 12 }),
    );
    expect(codes(report)).toEqual(["CATEGORY_SHORTFALL", "TOTAL_CREDITS_SHORTFALL"]);
  });

  it("does not count duplicate placements twice", () => {
    const report = evaluateRequirements(
      catalog,
      chartOf([[], ["CS101"], ["CS101"]]),
      requirements(),
    );
    expect(report.totalCredits).toBe(4);
  });
});
