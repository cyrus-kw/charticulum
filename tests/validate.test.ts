import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { validateChart } from "../src/engine/validate";
import { chartOf, obj } from "./helpers";

const catalog = createCatalog([
  obj("CS101", { internalEquivalents: ["CS101H"] }),
  obj("CS101H"),
  obj("CS102", { previous: ["CS101"] }),
  obj("LAB102", { concurrent: ["CS102"], credits: 1 }),
  obj("MATH101", {
    externalEquivalents: [{ institution: "AP", externalId: "CALC-AB" }],
  }),
]);

// Pull out just the codes so assertions stay short.
const codes = (chart: ReturnType<typeof chartOf>) =>
  validateChart(catalog, chart).map((issue) => issue.code);

describe("validateChart", () => {
  it("accepts a consistent chart", () => {
    expect(codes(chartOf([[], ["CS101"], ["CS102", "LAB102"]]))).toEqual([]);
  });

  it("flags objects not in the catalog", () => {
    expect(codes(chartOf([[], ["CS999"]]))).toEqual(["UNKNOWN_OBJECT"]);
  });

  it("flags duplicate placements", () => {
    expect(codes(chartOf([[], ["CS101"], ["CS101"]]))).toEqual(["DUPLICATE_PLACEMENT"]);
  });

  it("flags a previous requisite in the same term", () => {
    expect(codes(chartOf([[], ["CS101", "CS102"]]))).toEqual([
      "PREVIOUS_REQUISITE_NOT_MET",
    ]);
  });

  it("flags a previous requisite placed later", () => {
    expect(codes(chartOf([[], ["CS102"], ["CS101"]]))).toEqual([
      "PREVIOUS_REQUISITE_NOT_MET",
    ]);
  });

  it("accepts an internal equivalent as a requisite", () => {
    expect(codes(chartOf([[], ["CS101H"], ["CS102"]]))).toEqual([]);
  });

  it("flags a concurrent requisite placed later", () => {
    expect(codes(chartOf([[], ["CS101"], ["LAB102"], ["CS102"]]))).toEqual([
      "CONCURRENT_REQUISITE_NOT_MET",
    ]);
  });

  it("flags Term 0 objects with no backing external work", () => {
    expect(codes(chartOf([["MATH101"]]))).toEqual(["UNBACKED_EXTERNAL_TERM"]);
  });

  it("accepts Term 0 objects backed by external work", () => {
    const chart = chartOf([["MATH101"]], {
      completedExternal: [{ institution: "AP", externalId: "CALC-AB" }],
    });
    expect(codes(chart)).toEqual([]);
  });

  it("doesn't check requisites of objects in Term 0", () => {
    const withAp = createCatalog([
      obj("MATH101"),
      obj("STAT200", {
        previous: ["MATH101"],
        externalEquivalents: [{ institution: "AP", externalId: "STATS" }],
      }),
    ]);
    const chart = chartOf([["STAT200"]], {
      completedExternal: [{ institution: "AP", externalId: "STATS" }],
    });
    expect(validateChart(withAp, chart)).toEqual([]);
  });

  it("includes the term and object on each issue", () => {
    const [issue] = validateChart(catalog, chartOf([[], ["CS102"]]));
    expect(issue).toMatchObject({ objectId: "CS102", termIndex: 1, requisiteId: "CS101" });
  });
});
