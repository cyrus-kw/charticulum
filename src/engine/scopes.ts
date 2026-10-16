import type { Category, OverrideKind, RequirementSet, Requirements } from "./types";

// Used when no set says otherwise.
export const DEFAULT_MAX_CREDITS_PER_TERM = 18;

// Combine requirement sets into the single Requirements the checks use.
// Global sets are applied before local ones, and where two sets disagree
// the stricter rule wins:
// - required objects: all of them
// - minimums: the highest
// - credit limit per term and shared-credit limit: the lowest
// - double counting: allowed only if no set forbids it
// - override kinds: only those every set allows
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
  let minGpa: number | undefined;
  let allowedOverrides: OverrideKind[] | undefined;
  let maxSharedCredits: number | undefined;

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
    if (set.minGpa !== undefined) minGpa = Math.max(minGpa ?? 0, set.minGpa);
    if (set.allowedOverrides) {
      allowedOverrides = allowedOverrides
        ? allowedOverrides.filter((kind) => set.allowedOverrides!.includes(kind))
        : [...set.allowedOverrides];
    }
    if (set.maxSharedCredits !== undefined) {
      maxSharedCredits = Math.min(maxSharedCredits ?? Infinity, set.maxSharedCredits);
    }
  }

  return {
    requiredObjectIds: [...required],
    minCreditsByCategory,
    minTotalCredits,
    maxCreditsPerTerm: maxCreditsPerTerm ?? DEFAULT_MAX_CREDITS_PER_TERM,
    allowDoubleCounting,
    // Only include the key when some set gave a value.
    ...(minGpa !== undefined && { minGpa }),
    ...(allowedOverrides && { allowedOverrides }),
    ...(maxSharedCredits !== undefined && { maxSharedCredits }),
  };
}
