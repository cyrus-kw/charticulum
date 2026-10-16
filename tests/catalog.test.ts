import { describe, expect, it } from "vitest";
import {
  createCatalog,
  earliestSatisfyingTerm,
  placementTerms,
  satisfies,
} from "../src/engine/catalog.js";
import { chartOf, obj } from "./helpers.js";

describe("createCatalog", () => {
  it("looks objects up by id", () => {
    const catalog = createCatalog([obj("CS101"), obj("CS102")]);
    expect(catalog.get("CS102")?.id).toBe("CS102");
  });

  it("rejects duplicate ids", () => {
    expect(() => createCatalog([obj("CS101"), obj("CS101")])).toThrow(/Duplicate/);
  });
});

describe("satisfies", () => {
  const catalog = createCatalog([
    obj("CS101", { internalEquivalents: ["CS101H"] }),
    obj("CS101H"),
    obj("MATH101"),
  ]);

  it("is true for the same object", () => {
    expect(satisfies(catalog, "CS101", "CS101")).toBe(true);
  });

  it("works in both directions for internal equivalents", () => {
    expect(satisfies(catalog, "CS101", "CS101H")).toBe(true);
    expect(satisfies(catalog, "CS101H", "CS101")).toBe(true);
  });

  it("is false for unrelated objects", () => {
    expect(satisfies(catalog, "CS101", "MATH101")).toBe(false);
  });
});

describe("placementTerms / earliestSatisfyingTerm", () => {
  const catalog = createCatalog([
    obj("CS101", { internalEquivalents: ["CS101H"] }),
    obj("CS101H"),
  ]);
  const chart = chartOf([[], ["CS101H"], ["CS101"]]);

  it("records the earliest term for each object", () => {
    expect(placementTerms(chart).get("CS101")).toBe(2);
  });

  it("finds the earliest term where an equivalent is placed", () => {
    expect(earliestSatisfyingTerm(catalog, placementTerms(chart), "CS101")).toBe(1);
  });

  it("returns undefined when nothing satisfies", () => {
    expect(earliestSatisfyingTerm(catalog, placementTerms(chart), "NOPE")).toBeUndefined();
  });
});
