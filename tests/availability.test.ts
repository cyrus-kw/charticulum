import { describe, expect, it } from "vitest";
import { isOffered, slotLabel, termCalendar } from "../src/engine/availability.js";
import { createCatalog } from "../src/engine/catalog.js";
import { buildChart } from "../src/engine/scheduler.js";
import { validateChart } from "../src/engine/validate.js";
import { chartOf, obj, requirements } from "./helpers.js";

describe("isOffered", () => {
  const fallOnly = obj("A", { availability: { seasons: ["fall"] } });
  const oddYears = obj("B", { availability: { yearParity: "odd" } });

  it("checks the season", () => {
    expect(isOffered(fallOnly, { season: "fall" })).toBe(true);
    expect(isOffered(fallOnly, { season: "spring" })).toBe(false);
  });

  it("checks odd and even years", () => {
    expect(isOffered(oddYears, { year: 2027 })).toBe(true);
    expect(isOffered(oddYears, { year: 2026 })).toBe(false);
  });

  it("treats objects and terms without calendar data as offered", () => {
    expect(isOffered(obj("C"), { season: "summer" })).toBe(true);
    expect(isOffered(fallOnly, {})).toBe(true);
  });
});

describe("termCalendar", () => {
  it("rolls the year over between fall and spring", () => {
    const slots = termCalendar({ season: "fall", year: 2026 }, ["fall", "spring"], 4);
    expect(slots.map(slotLabel)).toEqual(["Fall 2026", "Spring 2027", "Fall 2027", "Spring 2028"]);
  });

  it("rejects a start season outside the calendar", () => {
    expect(() => termCalendar({ season: "summer", year: 2026 }, ["fall", "spring"], 2)).toThrow();
  });
});

describe("availability in validation and building", () => {
  const catalog = createCatalog([
    obj("INTRO"),
    obj("FALLONLY", { previous: ["INTRO"], availability: { seasons: ["fall"] } }),
  ]);

  it("flags objects placed in a term they aren't offered", () => {
    const chart = chartOf([[], ["INTRO"]]);
    chart.terms.push({ index: 2, label: "Spring 2027", season: "spring", year: 2027, objectIds: ["FALLONLY"] });
    expect(validateChart(catalog, chart).map((i) => i.code)).toEqual(["NOT_OFFERED"]);
  });

  it("waits for the next offering, leaving a gap if needed", () => {
    const { chart, issues } = buildChart(
      catalog,
      requirements({ requiredObjectIds: ["FALLONLY"] }),
      { calendar: { start: { season: "fall", year: 2026 }, seasons: ["fall", "spring"] } },
    );
    expect(issues).toEqual([]);
    expect(chart.terms.map((t) => [t.label, t.objectIds])).toEqual([
      ["Term 0 (External)", []],
      ["Fall 2026", ["INTRO"]],
      ["Spring 2027", []],
      ["Fall 2027", ["FALLONLY"]],
    ]);
    expect(validateChart(catalog, chart)).toEqual([]);
  });

  it("reports objects that are never offered in the calendar", () => {
    const summerOnly = createCatalog([obj("S", { availability: { seasons: ["summer"] } })]);
    const { issues } = buildChart(summerOnly, requirements({ requiredObjectIds: ["S"] }), {
      calendar: { start: { season: "fall", year: 2026 }, seasons: ["fall", "spring"] },
    });
    expect(issues.map((i) => i.code)).toEqual(["UNSCHEDULABLE"]);
  });
});
