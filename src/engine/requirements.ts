import { earliestSatisfyingTerm, placementTerms, satisfies } from "./catalog";
import { chartGpa, meetsGrade } from "./grades";
import {
  CATEGORY_NAMES,
  EXTERNAL_TERM,
  type Catalog,
  type Category,
  type Chart,
  type ChartIssue,
  type CreditRule,
  type CurriculumObject,
  type Requirements,
} from "./types";

export interface RequirementReport {
  // Term index -> credits placed in that term.
  creditsByTerm: Record<number, number>;
  totalCredits: number;
  creditsByCategory: Partial<Record<Category, number>>;
  // Credit rule id -> credits counted toward it.
  creditsByRule: Record<string, number>;
  missingRequired: string[];
  // Credits counted toward more than one category.
  sharedCredits: number;
  // Undefined until something is graded.
  gpa?: number;
  issues: ChartIssue[];
}

// Does a course count toward a credit rule? It has to fit every field
// the rule gives (see CreditRule).
export function matchesCreditRule(rule: CreditRule, object: CurriculumObject): boolean {
  if (rule.objectIds && !rule.objectIds.includes(object.id)) return false;
  if (rule.genEdAreas && !(object.genEdArea && rule.genEdAreas.includes(object.genEdArea))) return false;
  if (rule.subjects && !(object.code && rule.subjects.includes(object.code.subject))) return false;
  if (rule.minNumber !== undefined && !(object.code && object.code.number >= rule.minNumber)) return false;
  return true;
}

// Measure a chart against its requirements (the MVP's r-o-s).
export function evaluateRequirements(
  catalog: Catalog,
  chart: Chart,
  requirements: Requirements,
): RequirementReport {
  const issues: ChartIssue[] = [];
  const creditsByTerm: Record<number, number> = {};
  const creditsByCategory: Partial<Record<Category, number>> = {};
  const counted = new Set<string>();
  // The objects counted, for the credit rules below.
  const countedObjects: CurriculumObject[] = [];
  let totalCredits = 0;
  let sharedCredits = 0;

  for (const term of chart.terms) {
    creditsByTerm[term.index] = 0;
    for (const id of term.objectIds) {
      const object = catalog.get(id);
      // Unknown or duplicate objects are validateChart's job; skip them here
      // so their credits aren't counted twice.
      if (!object || counted.has(id)) continue;
      counted.add(id);
      countedObjects.push(object);

      creditsByTerm[term.index] += object.credits;
      totalCredits += object.credits;

      // Policy: without double counting, only the first category counts.
      const categories = requirements.allowDoubleCounting
        ? object.categories
        : object.categories.slice(0, 1);
      for (const category of categories) {
        creditsByCategory[category] = (creditsByCategory[category] ?? 0) + object.credits;
      }
      if (categories.length > 1) sharedCredits += object.credits;
    }

    // Pre-Credit is credit earned elsewhere, so the per-term limit doesn't apply.
    if (
      term.index !== EXTERNAL_TERM &&
      creditsByTerm[term.index] > requirements.maxCreditsPerTerm
    ) {
      issues.push({
        code: "TERM_OVER_CREDIT_LIMIT",
        message: `${term.label} has ${creditsByTerm[term.index]} credits; the limit is ${requirements.maxCreditsPerTerm}.`,
        termIndex: term.index,
      });
    }
  }

  const placements = placementTerms(chart);
  const missingRequired = requirements.requiredObjectIds.filter(
    (id) => earliestSatisfyingTerm(catalog, placements, id) === undefined,
  );
  for (const id of missingRequired) {
    issues.push({
      code: "MISSING_REQUIRED_OBJECT",
      // Named by its type: "Required course CS390…", "Required milestone…".
      message: `Required ${catalog.get(id)?.type ?? "item"} ${id} is not in the chart.`,
      objectId: id,
    });
  }

  // Object.entries turns { major: 30 } into [["major", 30]]. The "as" tells
  // TypeScript the keys are Categories, which it can't work out by itself.
  for (const [category, minimum] of Object.entries(requirements.minCreditsByCategory) as [
    Category,
    number,
  ][]) {
    const earned = creditsByCategory[category] ?? 0;
    if (earned < minimum) {
      issues.push({
        code: "CATEGORY_SHORTFALL",
        message: `${CATEGORY_NAMES[category]} has ${earned} credits; ${minimum} are required.`,
      });
    }
  }

  // Credit rules. A graded course under the rule's minimum grade doesn't
  // count; one not graded yet is planned, so it counts for now.
  const creditsByRule: Record<string, number> = {};
  for (const rule of requirements.creditRules ?? []) {
    let earned = 0;
    for (const object of countedObjects) {
      if (!matchesCreditRule(rule, object)) continue;
      const grade = chart.grades?.[object.id];
      if (rule.minGrade && grade && !meetsGrade(grade, rule.minGrade)) continue;
      earned += object.credits;
    }
    creditsByRule[rule.id] = earned;
    if (earned < rule.credits) {
      issues.push({
        code: "CREDIT_RULE_SHORTFALL",
        message: `${rule.name} has ${earned} credits; ${rule.credits} are required.`,
      });
    }
  }

  // Minimum grades in required courses ("C or better"). Whatever stands in
  // for the course (an equivalent) needs the grade; one passing (or not
  // yet graded) placement is enough.
  for (const [id, minimum] of Object.entries(requirements.minGrades ?? {})) {
    const taken = [...placements.keys()].filter((placedId) => satisfies(catalog, id, placedId));
    const passed = taken.some((placedId) => {
      const grade = chart.grades?.[placedId];
      return grade === undefined || meetsGrade(grade, minimum);
    });
    if (taken.length === 0 || passed) continue;
    for (const placedId of taken) {
      issues.push({
        code: "REQUIRED_GRADE_TOO_LOW",
        message: `${placedId} needs at least a ${minimum}; the grade is ${chart.grades![placedId]}.`,
        objectId: placedId,
        termIndex: placements.get(placedId),
      });
    }
  }

  if (totalCredits < requirements.minTotalCredits) {
    issues.push({
      code: "TOTAL_CREDITS_SHORTFALL",
      message: `The chart has ${totalCredits} credits; ${requirements.minTotalCredits} are required.`,
    });
  }

  if (requirements.maxSharedCredits !== undefined && sharedCredits > requirements.maxSharedCredits) {
    issues.push({
      code: "SHARED_CREDITS_OVER_LIMIT",
      message: `${sharedCredits} credits count toward more than one category; at most ${requirements.maxSharedCredits} may.`,
    });
  }

  const gpa = chartGpa(catalog, chart);
  if (requirements.minGpa !== undefined && gpa !== undefined && gpa < requirements.minGpa) {
    issues.push({
      code: "GPA_BELOW_MINIMUM",
      message: `GPA is ${gpa.toFixed(2)}; at least ${requirements.minGpa.toFixed(2)} is required.`,
    });
  }

  return {
    creditsByTerm,
    totalCredits,
    creditsByCategory,
    creditsByRule,
    missingRequired,
    sharedCredits,
    gpa,
    issues,
  };
}
