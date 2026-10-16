import { earliestSatisfyingTerm, placementTerms } from "./catalog.js";
import { chartGpa } from "./grades.js";
import {
  EXTERNAL_TERM,
  type Catalog,
  type Category,
  type Chart,
  type ChartIssue,
  type Requirements,
} from "./types.js";

export interface RequirementReport {
  // Term index -> credits placed in that term.
  creditsByTerm: Record<number, number>;
  totalCredits: number;
  creditsByCategory: Partial<Record<Category, number>>;
  missingRequired: string[];
  // Credits counted toward more than one category.
  sharedCredits: number;
  // Undefined until something is graded.
  gpa?: number;
  issues: ChartIssue[];
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

    // Term 0 is credit earned elsewhere, so the per-term limit doesn't apply.
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
      message: `Required object ${id} is not in the chart.`,
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
        message: `${category} has ${earned} credits; ${minimum} are required.`,
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
    missingRequired,
    sharedCredits,
    gpa,
    issues,
  };
}
