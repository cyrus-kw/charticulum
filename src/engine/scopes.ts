import { GRADE_POINTS } from "./grades";
import type { Category, CreditRule, Grade, OverrideKind, RequirementSet, Requirements } from "./types";

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
// - credit rules: all of them; one id in two sets keeps the higher credits
// - minimum grades: the highest per course
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
  const creditRules = new Map<string, CreditRule>();
  const minGrades: Record<string, Grade> = {};

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
    for (const rule of set.creditRules ?? []) {
      const current = creditRules.get(rule.id);
      if (!current || rule.credits > current.credits) creditRules.set(rule.id, rule);
    }
    for (const [id, grade] of Object.entries(set.minGrades ?? {})) {
      const current = minGrades[id];
      if (!current || GRADE_POINTS[grade] > GRADE_POINTS[current]) minGrades[id] = grade;
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
    ...(creditRules.size > 0 && { creditRules: [...creditRules.values()] }),
    ...(Object.keys(minGrades).length > 0 && { minGrades }),
  };
}
