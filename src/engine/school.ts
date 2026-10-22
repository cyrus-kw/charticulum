// School data: everything one school publishes (catalog, rules, templates,
// calendar, and policy) as a single JSON document that can be imported.
import { z } from "zod";
import { createCatalog } from "./catalog";
import { courseCodeId, formatCourseCode, parseCourseCode, SUBJECT_PATTERN } from "./codes";
import { requiredIds } from "./required";
import { publishTemplate, type TemplateLibrary } from "./templates";
import {
  categoryHeading,
  EVERY_TERM,
  type Catalog,
  type ChartTemplate,
  type CourseCode,
  type CurriculumObject,
  type RequirementSet,
} from "./types";

// ---------------------------------------------------------------------------
// Schema. Zod checks data at runtime (TypeScript types only exist while
// compiling), which matters for files uploaded by people.
// ---------------------------------------------------------------------------

const id = z.string().min(1);
const season = z.enum(["winter", "spring", "summer", "fall"]);
const grade = z.enum(["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"]);
const category = z.enum(["major", "minor", "general-education", "elective", "focus"]);
const credits = z.number().min(0);

const subjectCode = z.string().regex(SUBJECT_PATTERN, "Use capital letters (and - or _), e.g. CAS.");

const courseCode = z.object({
  subject: subjectCode,
  number: z.number().int().min(0),
  suffix: z.string().regex(/^[A-Z]+$/, "Use capital letters only, e.g. A.").optional(),
});

// A required object's (or a requisite's) id, or a choice: { "oneOf":
// ["MATH230", "MATH230H", ["MATH231", "MATH232"]] }, where a list is an
// option of several objects taken together. A choice needs at least two
// options, and a list at least two objects (one would just be an id).
const requiredItem = z.union([id, z.object({ oneOf: z.array(z.union([id, z.array(id).min(2)])).min(2) })]);

// Everything about an object except its id and code. Kept apart so a
// subject's file (schoolFiles.ts) can list objects by number alone.
export const objectFields = z.object({
  type: z.enum(["course", "experience", "milestone", "proficiency"]),
  title: z.string(),
  description: z.string().optional(),
  credits,
  requisites: z
    .object({
      previous: z.array(requiredItem).default([]),
      concurrent: z.array(requiredItem).default([]),
      minGrades: z.record(id, grade).optional(),
    })
    .default({ previous: [], concurrent: [] }),
  internalEquivalents: z.array(id).default([]),
  externalEquivalents: z.array(z.object({ institution: z.string(), externalId: id })).default([]),
  categories: z.array(category).default([]),
  genEdAreas: z.array(z.string().min(1)).min(1).optional(),
  // Files may leave availability (or its seasons) out; it's then filled in
  // as every term, so the rest of the app always sees the seasons listed.
  availability: z
    .object({ seasons: z.array(season).default(EVERY_TERM), yearParity: z.enum(["odd", "even"]).optional() })
    .default({ seasons: EVERY_TERM }),
});

const courseObject = objectFields
  .extend({ id, code: courseCode.optional() })
  // Files may leave the code out; it's then read from the id when the id
  // looks like one ("CAS100A"), so the rest of the app can rely on it.
  .transform(({ code, ...object }): typeof object & { code?: CourseCode } => {
    const filled = code ?? parseCourseCode(object.id);
    return filled ? { ...object, code: filled } : object;
  });

export const subjectSchema = z.object({ code: subjectCode, name: z.string().min(1) });

const creditRule = z
  .object({
    id,
    name: z.string().min(1).optional(),
    credits,
    area: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    notArea: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    subjects: z.array(subjectCode).optional(),
    minNumber: z.number().int().min(0).optional(),
    objectIds: z.array(id).optional(),
    minGrade: grade.optional(),
  })
  // Without a name, it's named after its area, so it needs just one.
  .refine((rule) => rule.name !== undefined || typeof rule.area === "string", {
    message: "Give a name (or one area to name it after).",
    path: ["name"],
  });

const creditRuleGroup = z.object({
  category: id,
  name: z.string().min(1),
  eachCourseOnce: z.boolean().optional(),
  rules: z.array(creditRule),
});

// The rules a requirement set can hold (see Requirements in types.ts).
const requirementRules = z.object({
  requiredObjectIds: z.array(requiredItem).optional(),
  minCreditsByCategory: z.partialRecord(category, credits).optional(),
  minTotalCredits: credits.optional(),
  maxCreditsPerTerm: credits.optional(),
  allowDoubleCounting: z.boolean().optional(),
  minGpa: z.number().min(0).max(4).optional(),
  allowedOverrides: z.array(z.enum(["waive-requirement", "waive-requisite", "substitute"])).optional(),
  maxSharedCredits: credits.optional(),
  creditRules: z.array(creditRuleGroup).optional(),
  minGrades: z.record(id, grade).optional(),
});

// One category of a program's requirements ("major", "elective",
// "seminars"): its required courses, minimum grades, and credit rules
// (`rules`, shown in Requirements under the category's heading, e.g.
// "Electives"; see categoryHeading). See templateFromData for how it
// becomes the engine's RequirementSet.
const categorySet = requirementRules.omit({ creditRules: true, minTotalCredits: true }).extend({
  category: id,
  eachCourseOnce: z.boolean().optional(),
  rules: z.array(creditRule).optional(),
});

// A school-wide set, for every program toward one kind of degree
// ("baccalaureate"). Every one is global, and the degree names it. Its
// requirements by category (gen ed) are listed like a program's.
const programRequirement = requirementRules.omit({ creditRules: true }).extend({
  degree: id,
  globalRequirements: z.array(categorySet).optional(),
});

const term = z.object({
  index: z.number().int().min(0),
  label: z.string(),
  objectIds: z.array(id),
  season: season.optional(),
  year: z.number().int().optional(),
});

const template = z.object({
  code: id,
  version: z.string().regex(/^\d{4}-\d{2}$/, 'Use an academic year like "2026-27".'),
  title: z.string(),
  degree: id,
  // Credits the whole program needs (more than the degree's 120, say).
  minTotalCredits: credits.optional(),
  // Its own requirements by category (the degree's are global).
  localRequirements: z.array(categorySet),
  terms: z.array(term),
});

// A saved student chart. Saved charts come back from storage or over the
// network, so they're checked like any other outside data.
const overrideBase = {
  id,
  reason: z.string(),
  condition: z.object({ objectId: id, minGrade: grade }).optional(),
};

export const chartSchema = z.object({
  name: z.string().max(200),
  terms: z.array(term),
  completedExternal: z.array(z.object({ institution: z.string(), externalId: id })),
  grades: z.record(id, grade).optional(),
  overrides: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ ...overrideBase, kind: z.literal("waive-requirement"), objectId: id }),
        z.object({ ...overrideBase, kind: z.literal("waive-requisite"), objectId: id, requisiteId: id }),
        z.object({ ...overrideBase, kind: z.literal("substitute"), objectId: id, substituteId: id }),
      ]),
    )
    .optional(),
  pinnedTemplates: z.array(z.object({ templateId: id, version: z.string() })).optional(),
});

export const schoolDataSchema = z.object({
  formatVersion: z.literal(1),
  school: z.object({ id, name: z.string() }),
  calendar: z.object({
    start: z.object({ season, year: z.number().int() }),
    seasons: z.array(season).min(1),
  }),
  // The subjects courses are taught in. Optional; when listed, every
  // course's subject must be one of them.
  subjects: z.array(subjectSchema).default([]),
  objects: z.array(courseObject).min(1),
  programRequirements: z.array(programRequirement).default([]),
  templates: z.array(template).default([]),
  // A school's transfer/AP table, kept separate from the objects because
  // it's usually maintained separately. Each row adds an external equivalent.
  equivalencyTable: z
    .array(z.object({ institution: z.string(), externalId: id, objectId: id }))
    .default([]),
});

// The TypeScript type, worked out from the schema so the two can't drift.
export type SchoolData = z.infer<typeof schoolDataSchema>;
// What a file must contain before defaults are filled in.
export type SchoolDataInput = z.input<typeof schoolDataSchema>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// An object's type used to be called "kind". Files and saved schools from
// before still say kind, so it's read as type. Only the "objects" list is
// touched; anything that isn't shaped like that is passed through as is,
// for the schema to report.
export function withOldNamesRenamed(input: unknown): unknown {
  if (typeof input !== "object" || input === null || !("objects" in input) || !Array.isArray(input.objects)) return input;
  const objects = input.objects.map((object: unknown) => {
    if (typeof object !== "object" || object === null || !("kind" in object) || "type" in object) return object;
    const { kind, ...rest } = object;
    return { ...rest, type: kind };
  });
  return { ...input, objects };
}

export type ParseResult = { ok: true; data: SchoolData } | { ok: false; errors: string[] };

// Check unknown input (e.g. from JSON.parse) and return either the data or
// readable error messages. Checks both shape and cross-references.
export function parseSchoolData(input: unknown): ParseResult {
  const parsed = schoolDataSchema.safeParse(withOldNamesRenamed(input));
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(top level)"}: ${issue.message}`,
      ),
    };
  }

  const data = parsed.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const object of data.objects) {
    if (ids.has(object.id)) errors.push(`objects: duplicate id ${object.id}`);
    ids.add(object.id);
  }
  const subjects = new Set<string>();
  for (const subject of data.subjects) {
    if (subjects.has(subject.code)) errors.push(`subjects: duplicate code ${subject.code}`);
    subjects.add(subject.code);
  }
  const check = (where: string, refs: string[]) => {
    for (const ref of refs) if (!ids.has(ref)) errors.push(`${where}: unknown object ${ref}`);
  };

  for (const object of data.objects) {
    const where = `objects.${object.id}`;
    // A code and its id must agree, or the same course could show up
    // under two names.
    if (object.code && courseCodeId(object.code) !== object.id) {
      errors.push(`${where}.code: ${formatCourseCode(object.code)} doesn't match the id (it would be ${courseCodeId(object.code)})`);
    }
    if (object.code && subjects.size > 0 && !subjects.has(object.code.subject)) {
      errors.push(`${where}.code: unknown subject ${object.code.subject}`);
    }
    check(`${where}.requisites`, [
      ...requiredIds([...object.requisites.previous, ...object.requisites.concurrent]),
      ...Object.keys(object.requisites.minGrades ?? {}),
    ]);
    check(`${where}.internalEquivalents`, object.internalEquivalents);
  }
  for (const set of [...globalSets(data), ...data.templates.flatMap((t) => templateFromData(t).requirementSets)]) {
    check(`requirementSets.${set.id}`, requiredIds(set.requiredObjectIds ?? []));
    check(`requirementSets.${set.id}.minGrades`, Object.keys(set.minGrades ?? {}));
    for (const rule of (set.creditRules ?? []).flatMap((group) => group.rules)) {
      check(`requirementSets.${set.id}.creditRules.${rule.id}`, rule.objectIds ?? []);
    }
  }
  const degrees = new Set(data.programRequirements.map((set) => set.degree));
  const versions = new Set<string>();
  for (const t of data.templates) {
    if (!degrees.has(t.degree)) errors.push(`templates.${t.code}.degree: no programRequirements for ${t.degree}`);
    const key = `${t.code} ${t.version}`;
    if (versions.has(key)) errors.push(`templates: ${key} appears twice`);
    versions.add(key);
    check(`templates.${t.code}`, t.terms.flatMap((term) => term.objectIds));
  }
  data.equivalencyTable.forEach((row, i) => check(`equivalencyTable.${i}`, [row.objectId]));
  if (!data.calendar.seasons.includes(data.calendar.start.season)) {
    errors.push("calendar: start season is not one of the calendar's seasons");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}

// ---------------------------------------------------------------------------
// Compacting: the reverse of the defaults above. Leaves out every field
// parsing would fill in the same way anyway (empty lists, offered every
// term, a code the id already spells), and descriptions. For sending a big
// school to the browser, which parses it again to get the full data back.
// ---------------------------------------------------------------------------

export function compactSchoolData(data: SchoolData): SchoolDataInput {
  const objects = data.objects.map((object) => {
    const { code, description, requisites, internalEquivalents, externalEquivalents, categories, availability, ...rest } =
      object;
    const sameCode = code && JSON.stringify(parseCourseCode(object.id)) === JSON.stringify(code);
    const everyTerm =
      !availability.yearParity &&
      availability.seasons.length === EVERY_TERM.length &&
      EVERY_TERM.every((season) => availability.seasons.includes(season));
    const hasRequisites =
      requisites.previous.length > 0 || requisites.concurrent.length > 0 || requisites.minGrades !== undefined;
    return {
      ...rest,
      ...(code && !sameCode ? { code } : {}),
      ...(hasRequisites ? { requisites } : {}),
      ...(internalEquivalents.length > 0 ? { internalEquivalents } : {}),
      ...(externalEquivalents.length > 0 ? { externalEquivalents } : {}),
      ...(categories.length > 0 ? { categories } : {}),
      ...(everyTerm ? {} : { availability }),
    };
  });
  return { ...data, objects };
}

// ---------------------------------------------------------------------------
// Loading: turn school data into the engine's working objects.
// ---------------------------------------------------------------------------

export interface LoadedSchool {
  data: SchoolData;
  catalog: Catalog;
  library: TemplateLibrary;
  globalSets: RequirementSet[];
}

export function loadSchool(data: SchoolData): LoadedSchool {
  // Fold the equivalency table into each object's external equivalents.
  const objects: CurriculumObject[] = data.objects.map((object) => ({
    ...object,
    externalEquivalents: [
      ...object.externalEquivalents,
      ...data.equivalencyTable
        .filter((row) => row.objectId === object.id)
        .map(({ institution, externalId }) => ({ institution, externalId })),
    ],
  }));

  let library: TemplateLibrary = [];
  for (const t of data.templates) library = publishTemplate(library, templateFromData(t));

  return { data, catalog: createCatalog(objects), library, globalSets: globalSets(data) };
}

// A program as the engine's ChartTemplate: each category becomes a local
// RequirementSet (its credit rules one group, under the category), and the
// program's own total credits one more.
function templateFromData(t: SchoolData["templates"][number]): ChartTemplate {
  const { minTotalCredits, localRequirements, ...rest } = t;
  const sets = categorySets(t.code, "local", localRequirements);
  if (minTotalCredits !== undefined) sets.unshift({ id: t.code, name: t.title, scope: "local", minTotalCredits });
  return { ...rest, requirementSets: sets };
}

// The school-wide sets as the engine's RequirementSets: for each degree,
// one with its own rules (id and name: the degree), then one per category.
// Each carries the degree, so a chart gets only its programs' degree's.
function globalSets(data: Pick<SchoolData, "programRequirements">): RequirementSet[] {
  return data.programRequirements.flatMap(({ degree, globalRequirements = [], ...rules }) => [
    { id: degree, name: degree, scope: "global" as const, degree, ...rules },
    ...categorySets(degree, "global", globalRequirements).map((set) => ({ ...set, degree })),
  ]);
}

// A program's (or degree's) categories as RequirementSets, one each, its
// credit rules one group under the category's heading.
function categorySets(
  owner: string,
  scope: RequirementSet["scope"],
  sets: z.infer<typeof categorySet>[],
): RequirementSet[] {
  return sets.map(({ category, eachCourseOnce, rules, ...setRules }) => {
    const title = categoryHeading(category);
    return {
      id: `${owner} ${category}`,
      name: title,
      scope,
      ...setRules,
      ...(rules && { creditRules: [{ category, name: title, ...(eachCourseOnce && { eachCourseOnce }), rules }] }),
    };
  });
}
