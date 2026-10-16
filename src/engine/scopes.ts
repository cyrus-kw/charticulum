import type { Category, RequirementSet, Requirements } from "./types.js";

// Used when no set says otherwise.
export const DEFAULT_MAX_CREDITS_PER_TERM = 18;

// Combine requirement sets into the single Requirements the checks use.
// Global sets are applied before local ones, and where two sets disagree
// the stricter rule wins:
// - required objects: all of them
// - minimums: the highest
// - credit limit per term: the lowest
// - double counting: allowed only if no set forbids it
export function mergeRequirementSets(sets: RequirementSet[]): Requirements {
  const ordered = [
    ...sets.filter((set) => set.scope === "global"),
    ...sets.filter((set) => set.scope === "local"),
  ];

  const required = new Set<string>();
  const minCreditsByCategory: Partial<Record<Category, number>> = {};
  let minTotalCredits = 0;
  let maxCreditsPerTerm: number | undefined;
  let allowDoubleCounting = true;

  for (const set of ordered) {
    for (const id of set.requiredObjectIds ?? []) required.add(id);

    for (const [category, minimum] of Object.entries(set.minCreditsByCategory ?? {}) as [
      Category,
      number,
    ][]) {
      minCreditsByCategory[category] = Math.max(minCreditsByCategory[category] ?? 0, minimum);
    }

    minTotalCredits = Math.max(minTotalCredits, set.minTotalCredits ?? 0);
    if (set.maxCreditsPerTerm !== undefined) {
      maxCreditsPerTerm = Math.min(maxCreditsPerTerm ?? Infinity, set.maxCreditsPerTerm);
    }
    if (set.allowDoubleCounting === false) allowDoubleCounting = false;
  }

  return {
    requiredObjectIds: [...required],
    minCreditsByCategory,
    minTotalCredits,
    maxCreditsPerTerm: maxCreditsPerTerm ?? DEFAULT_MAX_CREDITS_PER_TERM,
    allowDoubleCounting,
  };
}
