import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_CREDITS_PER_TERM, mergeRequirementSets } from "../src/engine/scopes.js";
import type { RequirementSet } from "../src/engine/types.js";

const genEd: RequirementSet = {
  id: "ge",
  name: "General education",
  scope: "global",
  requiredObjectIds: ["ENG101"],
  minCreditsByCategory: { "general-education": 12 },
  maxCreditsPerTerm: 18,
};

const major: RequirementSet = {
  id: "cs",
  name: "Computer science major",
  scope: "local",
  requiredObjectIds: ["CS101", "ENG101"],
  minCreditsByCategory: { major: 32, "general-education": 6 },
  minTotalCredits: 40,
  maxCreditsPerTerm: 15,
};

describe("mergeRequirementSets", () => {
  it("combines required objects without duplicates", () => {
    expect(mergeRequirementSets([genEd, major]).requiredObjectIds).toEqual(["ENG101", "CS101"]);
  });

  it("keeps the stricter rule", () => {
    const merged = mergeRequirementSets([genEd, major]);
    // A local set can't lower the global general education minimum.
    expect(merged.minCreditsByCategory).toEqual({ "general-education": 12, major: 32 });
    expect(merged.minTotalCredits).toBe(40);
    expect(merged.maxCreditsPerTerm).toBe(15);
  });

  it("forbids double counting if any set does", () => {
    expect(mergeRequirementSets([genEd, major]).allowDoubleCounting).toBe(true);
    expect(
      mergeRequirementSets([genEd, { ...major, allowDoubleCounting: false }]).allowDoubleCounting,
    ).toBe(false);
  });

  it("fills in defaults when nothing is set", () => {
    expect(mergeRequirementSets([])).toEqual({
      requiredObjectIds: [],
      minCreditsByCategory: {},
      minTotalCredits: 0,
      maxCreditsPerTerm: DEFAULT_MAX_CREDITS_PER_TERM,
      allowDoubleCounting: true,
    });
  });
});
