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

  it("does not apply the credit limit to Pre-Credit", () => {
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

  it("names a missing required object by its type", () => {
    const withMilestone = createCatalog([...catalog.values(), obj("REVIEW", { type: "milestone", credits: 0 })]);
    const report = evaluateRequirements(
      withMilestone,
      chartOf([[], []]),
      requirements({ requiredObjectIds: ["CS101", "REVIEW"] }),
    );
    expect(report.issues.map((i) => i.message)).toEqual([
      "Required course CS101 is not in the chart.",
      "Required milestone REVIEW is not in the chart.",
    ]);
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

  describe("credit rules", () => {
    const courses = createCatalog([
      obj("MATH140", { code: { subject: "MATH", number: 140 }, genEdAreas: ["Quantification"], credits: 4 }),
      obj("STAT200", { code: { subject: "STAT", number: 200 }, genEdAreas: ["Quantification"], credits: 4 }),
      obj("CMPSC221", { code: { subject: "CMPSC", number: 221 } }),
      obj("CMPSC465", { code: { subject: "CMPSC", number: 465 } }),
      obj("CMPSC473", { code: { subject: "CMPSC", number: 473 } }),
    ]);
    const chart = chartOf([[], ["MATH140", "STAT200", "CMPSC221"], ["CMPSC465", "CMPSC473"]]);

    it("counts courses by gen ed area, by subject and number, or from a list", () => {
      const report = evaluateRequirements(
        courses,
        chart,
        requirements({
          creditRules: [
            { category: "general-education", name: "General Education", rules: [{ id: "Q", credits: 6, area: "Quantification" }] },
            {
              category: "elective",
              name: "Electives",
              rules: [
                { id: "upper", name: "400-level CMPSC", credits: 6, subjects: ["CMPSC"], minNumber: 400 },
                { id: "list", name: "From the list", credits: 9, objectIds: ["CMPSC221", "CMPSC465"] },
              ],
            },
          ],
        }),
      );
      expect(report.creditsByRule).toEqual({ Q: 8, upper: 6, list: 6 });
      expect(report.issues).toEqual([
        {
          code: "CREDIT_RULE_SHORTFALL",
          message: "From the list has 6 credits; 9 are required.",
          requirement: "From the list",
          summary: "3 more credits",
        },
      ]);
    });

    it("leaves out graded courses under the rule's minimum grade", () => {
      const report = evaluateRequirements(
        courses,
        { ...chart, grades: { MATH140: "D", STAT200: "B" } },
        requirements({
          creditRules: [
            { category: "general-education", name: "General Education", rules: [{ id: "Q", credits: 6, area: "Quantification", minGrade: "C" }] },
          ],
        }),
      );
      expect(report.creditsByRule).toEqual({ Q: 4 });
      expect(codes(report)).toEqual(["CREDIT_RULE_SHORTFALL"]);
    });

    it("counts courses by attribute, leaving out notAttributes", () => {
      const labeled = createCatalog([
        obj("ENGL15", { credits: 3, attributes: ["GWS"] }),
        obj("CAS100A", { credits: 3, attributes: ["GWS", "US"] }),
        obj("AFAM100", { credits: 3, attributes: ["GWS", "INTER"] }),
      ]);
      const report = evaluateRequirements(
        labeled,
        chartOf([[], ["ENGL15", "CAS100A", "AFAM100"]]),
        requirements({
          creditRules: [
            {
              category: "general-education",
              name: "General Education",
              rules: [
                { id: "WS", name: "Writing and Speaking", credits: 9, attributes: ["GWS"], notAttributes: ["INTER"] },
                { id: "US", name: "United States Cultures", credits: 3, attributes: ["US"] },
              ],
            },
          ],
        }),
      );
      expect(report.creditsByRule).toEqual({ WS: 6, US: 3 });
    });

    it("leaves out courses over a rule's maxNumber", () => {
      const withGraduate = createCatalog([...courses.values(), obj("CMPSC565", { code: { subject: "CMPSC", number: 565 } })]);
      const report = evaluateRequirements(
        withGraduate,
        chartOf([[], ["CMPSC465", "CMPSC565"]]),
        requirements({
          creditRules: [
            { category: "elective", name: "Electives", rules: [{ id: "upper", name: "400-level CMPSC", credits: 6, subjects: ["CMPSC"], minNumber: 400, maxNumber: 499 }] },
          ],
        }),
      );
      expect(report.creditsByRule).toEqual({ upper: 3 });
    });
  });

  describe("gen ed rules counting each course once", () => {
    const courses = createCatalog([
      obj("BIO1", { genEdAreas: ["Natural Sciences"] }),
      obj("BIO2", { genEdAreas: ["Natural Sciences"] }),
      obj("BIO3", { genEdAreas: ["Natural Sciences"] }),
      obj("ID1", { genEdAreas: ["Humanities", "Natural Sciences", "Inter-Domain"] }),
    ]);
    // Like Penn State's: Knowledge Domains GN (not Inter-Domain), then
    // Exploration GN (may be).
    const genEd = (eachCourseOnce: boolean) =>
      requirements({
        creditRules: [
          {
            category: "general-education",
            name: "General Education",
            eachCourseOnce,
            rules: [
              { id: "N", area: "Natural Sciences", credits: 3, notArea: "Inter-Domain" },
              { id: "EXN", name: "Exploration: Natural Sciences", area: "Natural Sciences", credits: 3 },
            ],
          },
        ],
      });

    it("puts each course in the first rule that still needs it", () => {
      const report = evaluateRequirements(courses, chartOf([[], ["BIO1", "BIO2"]]), genEd(true));
      expect(report.creditsByRule).toEqual({ N: 3, EXN: 3 });
    });

    it("counts a course in every rule it fits without it", () => {
      const report = evaluateRequirements(courses, chartOf([[], ["BIO1"]]), genEd(false));
      expect(report.creditsByRule).toEqual({ N: 3, EXN: 3 });
    });

    it("leaves out courses in a rule's notArea", () => {
      const report = evaluateRequirements(courses, chartOf([[], ["ID1"]]), genEd(true));
      expect(report.creditsByRule).toEqual({ N: 0, EXN: 3 });
    });

    it("puts extra credits in the first rule the course fits", () => {
      const report = evaluateRequirements(courses, chartOf([[], ["BIO1", "BIO2", "BIO3"]]), genEd(true));
      expect(report.creditsByRule).toEqual({ N: 6, EXN: 3 });
    });
  });

  describe("minimum grades in required courses", () => {
    const rules = requirements({ minGrades: { CS101: "C" } });

    it("passes a course that isn't graded yet, or has the grade", () => {
      expect(codes(evaluateRequirements(catalog, chartOf([[], ["CS101"]]), rules))).toEqual([]);
      const graded = chartOf([[], ["CS101"]], { grades: { CS101: "C" } });
      expect(codes(evaluateRequirements(catalog, graded, rules))).toEqual([]);
    });

    it("flags a grade under the minimum, on the course", () => {
      const report = evaluateRequirements(catalog, chartOf([[], ["CS101"]], { grades: { CS101: "D" } }), rules);
      expect(report.issues).toEqual([
        {
          code: "REQUIRED_GRADE_TOO_LOW",
          message: "CS101 needs at least a C; the grade is D.",
          objectId: "CS101",
          termIndex: 1,
        },
      ]);
    });

    it("checks an equivalent taken in its place", () => {
      const report = evaluateRequirements(catalog, chartOf([[], ["HON101"]], { grades: { HON101: "D" } }), rules);
      expect(report.issues.map((i) => i.objectId)).toEqual(["HON101"]);
    });
  });
});
