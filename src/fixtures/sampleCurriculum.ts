// A small, made-up curriculum for demos and tests. "Example State
// University" is fictional; the courses are generic placeholders.
import { createCatalog, type Chart, type CourseObject, type Requirements } from "../engine/index.js";

// Shorthand for the many fields that are usually empty.
function course(
  id: string,
  title: string,
  credits: number,
  fields: Partial<CourseObject> = {},
): CourseObject {
  return {
    id,
    kind: "course",
    title,
    credits,
    requisites: { previous: [], concurrent: [] },
    internalEquivalents: [],
    externalEquivalents: [],
    categories: [],
    ...fields,
  };
}

const prev = (...ids: string[]) => ({ previous: ids, concurrent: [] });

export const sampleCatalog = createCatalog([
  course("CS101", "Intro to Programming", 4, { categories: ["major"] }),
  course("CS102", "Data Structures", 4, { requisites: prev("CS101"), categories: ["major"] }),
  course("CS102L", "Data Structures Lab", 1, {
    requisites: { previous: [], concurrent: ["CS102"] },
    categories: ["major"],
  }),
  course("CS201", "Algorithms", 4, { requisites: prev("CS102", "MATH201"), categories: ["major"] }),
  course("CS210", "Computer Systems", 4, { requisites: prev("CS102"), categories: ["major"] }),
  course("CS301", "Software Engineering", 4, {
    requisites: prev("CS201", "CS210"),
    categories: ["major"],
    availability: { seasons: ["spring"] },
  }),
  course("CS390", "Industry Internship", 3, {
    kind: "experience",
    requisites: prev("CS201"),
    categories: ["elective"],
  }),
  course("CS400", "Capstone Project", 4, {
    requisites: prev("CS301"),
    categories: ["major"],
    availability: { seasons: ["fall"] },
  }),
  course("MATH101", "Calculus I", 4, {
    categories: ["major", "general-education"],
    externalEquivalents: [{ institution: "AP", externalId: "CALC-AB" }],
  }),
  course("MATH201", "Discrete Mathematics", 3, {
    requisites: prev("MATH101"),
    categories: ["major"],
  }),
  course("ENG101", "Composition", 3, {
    categories: ["general-education"],
    externalEquivalents: [{ institution: "Valley Community College", externalId: "ENGL-1A" }],
  }),
  course("HIST110", "World History", 3, { categories: ["general-education"] }),
  course("PHIL120", "Ethics in Technology", 3, { categories: ["general-education"] }),
  course("PHIL121", "Ethics in Technology (Honors)", 3, {
    internalEquivalents: ["PHIL120"],
    categories: ["general-education"],
  }),
  course("SPAN-PROF", "Spanish Proficiency", 0, {
    kind: "proficiency",
    categories: ["general-education"],
  }),
  course("SOPH-REV", "Sophomore Review", 0, {
    kind: "milestone",
    requisites: prev("CS102", "MATH201"),
  }),
  course("ART100", "Intro to Design", 3, { categories: ["elective"] }),
]);

export const sampleRequirements: Requirements = {
  requiredObjectIds: [
    "CS102L",
    "CS390",
    "CS400",
    "ENG101",
    "HIST110",
    "PHIL120",
    "SPAN-PROF",
    "SOPH-REV",
  ],
  minCreditsByCategory: { major: 32, "general-education": 12, elective: 3 },
  minTotalCredits: 40,
  maxCreditsPerTerm: 12,
  allowDoubleCounting: true,
};

// Two terms a year, starting Fall 2026.
export const sampleCalendar = {
  start: { season: "fall" as const, year: 2026 },
  seasons: ["fall" as const, "spring" as const],
};

// A student's hand-made draft with a few deliberate mistakes, to show
// how the engine reports problems.
export const sampleDraftChart: Chart = {
  name: "Student draft (with mistakes)",
  completedExternal: [{ institution: "AP", externalId: "CALC-AB" }],
  terms: [
    { index: 0, label: "Term 0 (External)", objectIds: ["MATH101"] },
    { index: 1, label: "Term 1", objectIds: ["CS101", "CS102", "ENG101"] },
    { index: 2, label: "Term 2", objectIds: ["CS102L", "MATH201", "HIST110"] },
    { index: 3, label: "Term 3", objectIds: ["CS201", "CS210", "PHIL121"] },
  ],
};
