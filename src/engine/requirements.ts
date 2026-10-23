import { earliestSatisfyingTerm, placementTerms, satisfies } from "./catalog";
import { chartGpa, meetsGrade } from "./grades";
import { closestOption, describeRequired, isRequiredMet, requiredOptions } from "./required";
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
  // Required objects not on the chart (for a choice, what its closest
  // option still needs).
  missingRequired: string[];
  // Credits counted toward more than one category.
  sharedCredits: number;
  // Undefined until something is graded.
  gpa?: number;
  issues: ChartIssue[];
}

// How a credit rule is written for people: its name, or else its area
// ("Quantification"), or else its id.
export function creditRuleName(rule: CreditRule): string {
  return rule.name ?? (typeof rule.area === "string" ? rule.area : rule.id);
}

// Does a course count toward a credit rule? It has to fit every field
// the rule gives (see CreditRule).
export function matchesCreditRule(rule: CreditRule, object: CurriculumObject): boolean {
  if (rule.objectIds && !rule.objectIds.includes(object.id)) return false;
  const list = (areas: string | string[]) => (typeof areas === "string" ? [areas] : areas);
  const courseAreas = object.genEdAreas ?? [];
  if (rule.area !== undefined && !list(rule.area).some((area) => courseAreas.includes(area))) return false;
  if (rule.notArea !== undefined && list(rule.notArea).some((area) => courseAreas.includes(area))) return false;
  if (rule.subjects && !(object.code && rule.subjects.includes(object.code.subject))) return false;
  if (rule.minNumber !== undefined && !(object.code && object.code.number >= rule.minNumber)) return false;
  if (rule.maxNumber !== undefined && !(object.code && object.code.number <= rule.maxNumber)) return false;
  const attributes = object.attributes ?? [];
  if (rule.attributes && !rule.attributes.some((a) => attributes.includes(a))) return false;
  if (rule.notAttributes && rule.notAttributes.some((a) => attributes.includes(a))) return false;
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
  const isDone = (id: string) => earliestSatisfyingTerm(catalog, placements, id) !== undefined;
  const missingRequired: string[] = [];
  // Named by its type: "Required course CS390…", "Required milestone…".
  const typeOf = (id: string) => catalog.get(id)?.type ?? "item";
  for (const item of requirements.requiredObjectIds) {
    if (isRequiredMet(item, isDone)) continue;
    const option = closestOption(item, isDone);
    const done = option.filter(isDone);
    const missing = option.filter((id) => !isDone(id));
    missingRequired.push(...missing);
    if (done.length > 0) {
      // Part of an option is there (MATH 231 of "MATH 231 & MATH 232"):
      // name each missing part, with what it goes with.
      for (const id of missing) {
        issues.push({
          code: "MISSING_REQUIRED_OBJECT",
          message: `Required ${typeOf(id)} ${id} is not in the chart (it goes with ${done.join(" & ")}).`,
          summary: `Required with ${done.join(" & ")}, not on the plan`,
          objectId: id,
        });
      }
    } else if (typeof item !== "string") {
      // Nothing of a choice yet: one problem, about its first option, so
      // "Add to plan" adds that one and "Waive" waives the whole choice.
      const others = requiredOptions(item).slice(1);
      issues.push({
        code: "MISSING_REQUIRED_OBJECT",
        message: `Required: ${describeRequired(item)}; none is in the chart.`,
        summary: `Or ${describeRequired({ oneOf: others })}; none on the plan`,
        objectId: option[0],
      });
    } else {
      issues.push({
        code: "MISSING_REQUIRED_OBJECT",
        message: `Required ${typeOf(item)} ${item} is not in the chart.`,
        summary: "Required, not on the plan",
        objectId: item,
      });
    }
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
        requirement: CATEGORY_NAMES[category],
        summary: moreCredits(minimum - earned),
      });
    }
  }

  // Credit rules. A graded course under the rule's minimum grade doesn't
  // count; one not graded yet is planned, so it counts for now.
  const counts = (rule: CreditRule, object: CurriculumObject) => {
    if (!matchesCreditRule(rule, object)) return false;
    const grade = chart.grades?.[object.id];
    return !(rule.minGrade && grade && !meetsGrade(grade, rule.minGrade));
  };
  const creditsByRule: Record<string, number> = {};
  for (const group of requirements.creditRules ?? []) {
    for (const rule of group.rules) creditsByRule[rule.id] = 0;
    for (const object of countedObjects) {
      const fits = group.rules.filter((rule) => counts(rule, object));
      if (fits.length === 0) continue;
      if (group.eachCourseOnce) {
        // The first rule that still needs credits; when every one it fits
        // is full, the first it fits (where it shows as extra).
        const rule = fits.find((r) => creditsByRule[r.id] < r.credits) ?? fits[0];
        creditsByRule[rule.id] += object.credits;
      } else {
        for (const rule of fits) creditsByRule[rule.id] += object.credits;
      }
    }
    for (const rule of group.rules) {
      const earned = creditsByRule[rule.id];
      if (earned < rule.credits) {
        issues.push({
          code: "CREDIT_RULE_SHORTFALL",
          message: `${creditRuleName(rule)} has ${earned} credits; ${rule.credits} are required.`,
          requirement: creditRuleName(rule),
          summary: moreCredits(rule.credits - earned),
        });
      }
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
      requirement: "Total Credits",
      summary: moreCredits(requirements.minTotalCredits - totalCredits),
    });
  }

  if (requirements.maxSharedCredits !== undefined && sharedCredits > requirements.maxSharedCredits) {
    issues.push({
      code: "SHARED_CREDITS_OVER_LIMIT",
      message: `${sharedCredits} credits count toward more than one category; at most ${requirements.maxSharedCredits} may.`,
      requirement: "Shared credits",
      summary: `${sharedCredits - requirements.maxSharedCredits} too many count twice`,
    });
  }

  const gpa = chartGpa(catalog, chart);
  if (requirements.minGpa !== undefined && gpa !== undefined && gpa < requirements.minGpa) {
    issues.push({
      code: "GPA_BELOW_MINIMUM",
      message: `GPA is ${gpa.toFixed(2)}; at least ${requirements.minGpa.toFixed(2)} is required.`,
      requirement: "GPA",
      summary: `${gpa.toFixed(2)}, under the minimum ${requirements.minGpa.toFixed(2)}`,
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

// "1 more credit", "15 more credits": how far a credit requirement is from
// being met, for the short summary beside its name in Issues.
function moreCredits(credits: number): string {
  return `${credits} more ${credits === 1 ? "credit" : "credits"}`;
}
