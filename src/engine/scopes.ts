import { GRADE_POINTS } from "./grades";
import { requiredKey, requiredOptions } from "./required";
import type { Category, CreditRule, CreditRuleGroup, Grade, OverrideKind, RequiredItem, RequirementSet, Requirements } from "./types";

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
// - credit rules: all of them, in their groups (a group's category in
//   two sets holds both sets' rules); one rule id in two sets keeps the
//   higher credits
// - minimum grades: the highest per course; one asked for in a course of a
//   choice applies to all its options ("MATH 230 or MATH 231 & 232", C
//   or better: whichever is taken needs the C)
export function mergeRequirementSets(sets: RequirementSet[]): Requirements {
  const ordered = [
    ...sets.filter((set) => set.scope === "global"),
    ...sets.filter((set) => set.scope === "local"),
  ];

  // Keyed by requiredKey, so one listed by two sets is kept once.
  const required = new Map<string, RequiredItem>();
  const minCreditsByCategory: Partial<Record<Category, number>> = {};
  let minTotalCredits = 0;
  let maxCreditsPerTerm: number | undefined;
  let allowDoubleCounting = true;
  let minGpa: number | undefined;
  let allowedOverrides: OverrideKind[] | undefined;
  let maxSharedCredits: number | undefined;
  // Group category -> the group, with its rules by id.
  const creditRules = new Map<string, Omit<CreditRuleGroup, "rules"> & { rules: Map<string, CreditRule> }>();
  const minGrades: Record<string, Grade> = {};

  for (const set of ordered) {
    for (const item of set.requiredObjectIds ?? []) required.set(requiredKey(item), item);

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
    for (const { rules, ...group } of set.creditRules ?? []) {
      if (!creditRules.has(group.category)) creditRules.set(group.category, { ...group, rules: new Map() });
      const current = creditRules.get(group.category)!;
      // Counting each course once is the stricter rule.
      if (group.eachCourseOnce) current.eachCourseOnce = true;
      const merged = current.rules;
      for (const rule of rules) {
        const current = merged.get(rule.id);
        if (!current || rule.credits > current.credits) merged.set(rule.id, rule);
      }
    }
    for (const [id, grade] of Object.entries(set.minGrades ?? {})) {
      const current = minGrades[id];
      if (!current || GRADE_POINTS[grade] > GRADE_POINTS[current]) minGrades[id] = grade;
    }
  }

  for (const item of required.values()) {
    const ids = requiredOptions(item).flat();
    const strictest = ids
      .map((id) => minGrades[id])
      .filter((grade) => grade !== undefined)
      .sort((a, b) => GRADE_POINTS[b] - GRADE_POINTS[a])[0];
    if (!strictest) continue;
    for (const id of ids) {
      const current = minGrades[id];
      if (!current || GRADE_POINTS[strictest] > GRADE_POINTS[current]) minGrades[id] = strictest;
    }
  }

  return {
    requiredObjectIds: [...required.values()],
    minCreditsByCategory,
    minTotalCredits,
    maxCreditsPerTerm: maxCreditsPerTerm ?? DEFAULT_MAX_CREDITS_PER_TERM,
    allowDoubleCounting,
    // Only include the key when some set gave a value.
    ...(minGpa !== undefined && { minGpa }),
    ...(allowedOverrides && { allowedOverrides }),
    ...(maxSharedCredits !== undefined && { maxSharedCredits }),
    ...(creditRules.size > 0 && {
      creditRules: [...creditRules.values()].map((group) => ({ ...group, rules: [...group.rules.values()] })),
    }),
    ...(Object.keys(minGrades).length > 0 && { minGrades }),
  };
}
