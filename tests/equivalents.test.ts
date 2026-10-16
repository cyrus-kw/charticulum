import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { checkChart } from "../src/engine/check";
import { applyExternalEquivalents, externalPlacements } from "../src/engine/equivalents";
import { chartOf, obj, requirements } from "./helpers";

const catalog = createCatalog([
  obj("MATH101", {
    categories: ["major"],
    externalEquivalents: [{ institution: "AP", externalId: "CALC-AB" }],
  }),
  obj("MATH102", { previous: ["MATH101"], categories: ["major"] }),
  obj("ENG101", {
    externalEquivalents: [{ institution: "Valley CC", externalId: "ENGL-1A" }],
  }),
]);

const apCalc = { institution: "AP", externalId: "CALC-AB" };

describe("externalPlacements", () => {
  it("matches on both institution and id", () => {
    expect(externalPlacements(catalog, [apCalc])).toEqual(["MATH101"]);
    expect(
      externalPlacements(catalog, [{ institution: "Other", externalId: "CALC-AB" }]),
    ).toEqual([]);
  });
});

describe("applyExternalEquivalents", () => {
  it("fills Term 0 and removes covered objects from later terms", () => {
    const chart = chartOf([[], ["MATH101", "ENG101"]], { completedExternal: [apCalc] });
    const applied = applyExternalEquivalents(catalog, chart);
    expect(applied.terms[0].objectIds).toEqual(["MATH101"]);
    expect(applied.terms[1].objectIds).toEqual(["ENG101"]);
  });

  it("does not change the original chart", () => {
    const chart = chartOf([[], ["MATH101"]], { completedExternal: [apCalc] });
    applyExternalEquivalents(catalog, chart);
    expect(chart.terms[1].objectIds).toEqual(["MATH101"]);
  });

  it("adds Term 0 if the chart had none", () => {
    const chart = {
      name: "no term 0",
      terms: [{ index: 1, label: "Term 1", objectIds: ["MATH102"] }],
      completedExternal: [apCalc],
    };
    const applied = applyExternalEquivalents(catalog, chart);
    expect(applied.terms.map((t) => t.index)).toEqual([0, 1]);
  });

  it("lets Term 0 satisfy requisites and requirements", () => {
    const chart = chartOf([[], ["MATH102"]], { completedExternal: [apCalc] });
    const result = checkChart(
      catalog,
      applyExternalEquivalents(catalog, chart),
      requirements({ requiredObjectIds: ["MATH101", "MATH102"], minCreditsByCategory: { major: 6 } }),
    );
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("checkChart", () => {
  it("combines validation and requirement issues", () => {
    const result = checkChart(
      catalog,
      chartOf([[], ["MATH102"]]),
      requirements({ requiredObjectIds: ["ENG101"] }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual([
      "PREVIOUS_REQUISITE_NOT_MET",
      "MISSING_REQUIRED_OBJECT",
    ]);
  });
});
