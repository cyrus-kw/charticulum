import type { Catalog, Chart, Grade } from "./types";

// Points per letter grade on a 4.0 scale.
export const GRADE_POINTS: Record<Grade, number> = {
  A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0,
};

export function meetsGrade(earned: Grade, minimum: Grade): boolean {
  return GRADE_POINTS[earned] >= GRADE_POINTS[minimum];
}

// Credit-weighted GPA over the chart's graded objects. Objects worth
// 0 credits don't affect it. Undefined if nothing is graded yet.
export function chartGpa(catalog: Catalog, chart: Chart): number | undefined {
  let points = 0;
  let credits = 0;
  for (const [id, grade] of Object.entries(chart.grades ?? {})) {
    const object = catalog.get(id);
    if (!object || object.credits === 0) continue;
    points += GRADE_POINTS[grade] * object.credits;
    credits += object.credits;
  }
  return credits === 0 ? undefined : points / credits;
}
