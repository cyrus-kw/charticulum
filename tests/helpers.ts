import type { Chart, CourseObject, Requirements } from "../src/engine/types";

// Build a CourseObject with sensible defaults so tests only spell out
// the fields they care about. `Partial<CourseObject>` makes every field
// optional; the "..." spread copies the overrides on top of the defaults.
export function obj(
  id: string,
  overrides: Partial<Omit<CourseObject, "requisites">> & {
    previous?: string[];
    concurrent?: string[];
    minGrades?: CourseObject["requisites"]["minGrades"];
  } = {},
): CourseObject {
  const { previous = [], concurrent = [], minGrades, ...rest } = overrides;
  return {
    id,
    kind: "course",
    title: id,
    credits: 3,
    internalEquivalents: [],
    externalEquivalents: [],
    categories: [],
    ...rest,
    requisites: { previous, concurrent, ...(minGrades && { minGrades }) },
  };
}

// Build a chart from a list of terms, where index 0 of the list is Term 0.
export function chartOf(termObjectIds: string[][], extra: Partial<Chart> = {}): Chart {
  return {
    name: "test chart",
    terms: termObjectIds.map((objectIds, index) => ({
      index,
      label: `Term ${index}`,
      objectIds,
    })),
    completedExternal: [],
    ...extra,
  };
}

export function requirements(overrides: Partial<Requirements> = {}): Requirements {
  return {
    requiredObjectIds: [],
    minCreditsByCategory: {},
    minTotalCredits: 0,
    maxCreditsPerTerm: 18,
    allowDoubleCounting: true,
    ...overrides,
  };
}
