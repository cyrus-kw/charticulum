// The fictional "Example State University" as one SchoolData document:
// the same format a real school's JSON import uses.
import {
  EVERY_TERM,
  loadSchool,
  parseSchoolData,
  slotLabel,
  termCalendar,
  type CurriculumObject,
  type LoadedSchool,
  type SchoolData,
  type Season,
  type Term,
} from "../engine/index";
import type { SchoolDataInput } from "../engine/school";
import { sampleCatalog } from "./sampleCurriculum";

const statsCourses: CurriculumObject[] = [
  {
    id: "STAT200",
    kind: "course",
    title: "Intro to Statistics",
    credits: 3,
    requisites: { previous: ["MATH101"], concurrent: [] },
    internalEquivalents: [],
    externalEquivalents: [],
    categories: ["minor", "general-education"],
    availability: { seasons: EVERY_TERM },
  },
  {
    id: "STAT300",
    kind: "course",
    title: "Probability",
    credits: 3,
    requisites: { previous: ["STAT200"], concurrent: [], minGrades: { STAT200: "C" } },
    internalEquivalents: [],
    externalEquivalents: [],
    categories: ["minor"],
    availability: { seasons: EVERY_TERM },
  },
  {
    id: "STAT310",
    kind: "course",
    title: "Regression Analysis",
    credits: 3,
    requisites: { previous: ["STAT300"], concurrent: [] },
    internalEquivalents: [],
    externalEquivalents: [],
    categories: ["minor"],
    availability: { seasons: ["spring"] },
  },
];

// Lay out a suggested plan on a fall/spring calendar.
function plan(startYear: number, termObjectIds: string[][]): Term[] {
  const seasons: Season[] = ["fall", "spring"];
  const slots = termCalendar({ season: "fall", year: startYear }, seasons, termObjectIds.length);
  return [
    { index: 0, label: "Pre-Credit", objectIds: [] },
    ...termObjectIds.map((objectIds, i) => ({
      index: i + 1,
      label: slotLabel(slots[i]),
      season: slots[i].season,
      year: slots[i].year,
      objectIds,
    })),
  ];
}

const csCore = ["CS102L", "CS400", "ENG101", "HIST110", "PHIL120", "SPAN-PROF", "SOPH-REV"];

export const sampleSchoolData: SchoolDataInput = {
  formatVersion: 1,
  school: { id: "example-state", name: "Example State University" },
  calendar: { start: { season: "fall", year: 2026 }, seasons: ["fall", "spring"] },
  objects: [...sampleCatalog.values(), ...statsCourses],
  globalRequirementSets: [
    {
      id: "gen-ed",
      name: "General education",
      scope: "global",
      requiredObjectIds: ["ENG101", "HIST110", "PHIL120", "SPAN-PROF"],
      minCreditsByCategory: { "general-education": 12 },
      minTotalCredits: 40,
      maxCreditsPerTerm: 12,
      minGpa: 2.0,
      allowedOverrides: ["waive-requirement", "waive-requisite", "substitute"],
    },
  ],
  templates: [
    {
      id: "bs-cs",
      version: "2025-26",
      name: "B.S. Computer Science",
      requirementSets: [
        {
          id: "bs-cs-2025",
          name: "Computer science major (2025-26)",
          scope: "local",
          requiredObjectIds: csCore,
          minCreditsByCategory: { major: 32 },
        },
      ],
      terms: plan(2025, [
        ["CS101", "MATH101", "ENG101"],
        ["CS102", "CS102L", "MATH201", "HIST110"],
        ["CS201", "CS210", "SOPH-REV", "SPAN-PROF"],
        ["CS301", "PHIL120"],
        ["CS400"],
      ]),
    },
    {
      id: "bs-cs",
      version: "2026-27",
      name: "B.S. Computer Science",
      requirementSets: [
        {
          id: "bs-cs-2026",
          name: "Computer science major (2026-27)",
          scope: "local",
          // New this year: an internship is required.
          requiredObjectIds: [...csCore, "CS390"],
          minCreditsByCategory: { major: 32, elective: 3 },
        },
      ],
      terms: plan(2026, [
        ["CS101", "MATH101", "ENG101"],
        ["CS102", "CS102L", "MATH201", "HIST110"],
        ["CS201", "CS210", "SOPH-REV", "SPAN-PROF"],
        ["CS301", "PHIL120"],
        ["CS390", "CS400"],
      ]),
    },
    {
      id: "minor-stats",
      version: "2026-27",
      name: "Statistics minor",
      requirementSets: [
        {
          id: "minor-stats-2026",
          name: "Statistics minor (2026-27)",
          scope: "local",
          requiredObjectIds: ["STAT200", "STAT300", "STAT310"],
          minCreditsByCategory: { minor: 9 },
          maxSharedCredits: 8,
        },
      ],
      terms: plan(2026, [["MATH101"], ["STAT200"], ["STAT300"], ["STAT310"]]),
    },
  ],
  equivalencyTable: [
    { institution: "AP", externalId: "CS-A", objectId: "CS101" },
    { institution: "AP", externalId: "STATS", objectId: "STAT200" },
    { institution: "Valley Community College", externalId: "HIST-10", objectId: "HIST110" },
  ],
};

// The sample school's data, checked (defaults filled in).
export function sampleSchool(): SchoolData {
  const parsed = parseSchoolData(sampleSchoolData);
  if (!parsed.ok) throw new Error(`Sample school data is invalid:\n${parsed.errors.join("\n")}`);
  return parsed.data;
}

// The sample school, checked and ready for the engine.
export function loadSampleSchool(): LoadedSchool {
  return loadSchool(sampleSchool());
}
