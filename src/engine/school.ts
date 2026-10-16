// School data: everything one school publishes (catalog, rules, templates,
// calendar, and policy) as a single JSON document that can be imported.
import { z } from "zod";
import { createCatalog } from "./catalog";
import { publishTemplate, type TemplateLibrary } from "./templates";
import type { Catalog, CourseObject, RequirementSet } from "./types";

// ---------------------------------------------------------------------------
// Schema. Zod checks data at runtime (TypeScript types only exist while
// compiling), which matters for files uploaded by people.
// ---------------------------------------------------------------------------

const id = z.string().min(1);
const season = z.enum(["winter", "spring", "summer", "fall"]);
const grade = z.enum(["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"]);
const category = z.enum(["major", "minor", "general-education", "elective", "focus"]);
const credits = z.number().min(0);

const courseObject = z.object({
  id,
  kind: z.enum(["course", "experience", "milestone", "proficiency"]),
  title: z.string(),
  credits,
  requisites: z
    .object({
      previous: z.array(id).default([]),
      concurrent: z.array(id).default([]),
      minGrades: z.record(id, grade).optional(),
    })
    .default({ previous: [], concurrent: [] }),
  internalEquivalents: z.array(id).default([]),
  externalEquivalents: z.array(z.object({ institution: z.string(), externalId: id })).default([]),
  categories: z.array(category).default([]),
  availability: z
    .object({ seasons: z.array(season).optional(), yearParity: z.enum(["odd", "even"]).optional() })
    .optional(),
});

const requirementSet = z.object({
  id,
  name: z.string(),
  scope: z.enum(["global", "local"]),
  requiredObjectIds: z.array(id).optional(),
  minCreditsByCategory: z.partialRecord(category, credits).optional(),
  minTotalCredits: credits.optional(),
  maxCreditsPerTerm: credits.optional(),
  allowDoubleCounting: z.boolean().optional(),
  minGpa: z.number().min(0).max(4).optional(),
  allowedOverrides: z.array(z.enum(["waive-requirement", "waive-requisite", "substitute"])).optional(),
  maxSharedCredits: credits.optional(),
});

const term = z.object({
  index: z.number().int().min(0),
  label: z.string(),
  objectIds: z.array(id),
  season: season.optional(),
  year: z.number().int().optional(),
});

const template = z.object({
  id,
  version: z.string().regex(/^\d{4}-\d{2}$/, 'Use an academic year like "2026-27".'),
  name: z.string(),
  requirementSets: z.array(requirementSet),
  terms: z.array(term),
});

export const schoolDataSchema = z.object({
  formatVersion: z.literal(1),
  school: z.object({ id, name: z.string() }),
  calendar: z.object({
    start: z.object({ season, year: z.number().int() }),
    seasons: z.array(season).min(1),
  }),
  objects: z.array(courseObject).min(1),
  globalRequirementSets: z.array(requirementSet).default([]),
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

export type ParseResult = { ok: true; data: SchoolData } | { ok: false; errors: string[] };

// Check unknown input (e.g. from JSON.parse) and return either the data or
// readable error messages. Checks both shape and cross-references.
export function parseSchoolData(input: unknown): ParseResult {
  const parsed = schoolDataSchema.safeParse(input);
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
  const check = (where: string, refs: string[]) => {
    for (const ref of refs) if (!ids.has(ref)) errors.push(`${where}: unknown object ${ref}`);
  };

  for (const object of data.objects) {
    const where = `objects.${object.id}`;
    check(`${where}.requisites`, [
      ...object.requisites.previous,
      ...object.requisites.concurrent,
      ...Object.keys(object.requisites.minGrades ?? {}),
    ]);
    check(`${where}.internalEquivalents`, object.internalEquivalents);
  }
  for (const set of [...data.globalRequirementSets, ...data.templates.flatMap((t) => t.requirementSets)]) {
    check(`requirementSets.${set.id}`, set.requiredObjectIds ?? []);
  }
  const versions = new Set<string>();
  for (const t of data.templates) {
    const key = `${t.id} ${t.version}`;
    if (versions.has(key)) errors.push(`templates: ${key} appears twice`);
    versions.add(key);
    check(`templates.${t.id}`, t.terms.flatMap((term) => term.objectIds));
  }
  data.equivalencyTable.forEach((row, i) => check(`equivalencyTable.${i}`, [row.objectId]));
  if (!data.calendar.seasons.includes(data.calendar.start.season)) {
    errors.push("calendar: start season is not one of the calendar's seasons");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
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
  const objects: CourseObject[] = data.objects.map((object) => ({
    ...object,
    externalEquivalents: [
      ...object.externalEquivalents,
      ...data.equivalencyTable
        .filter((row) => row.objectId === object.id)
        .map(({ institution, externalId }) => ({ institution, externalId })),
    ],
  }));

  let library: TemplateLibrary = [];
  for (const t of data.templates) library = publishTemplate(library, t);

  return { data, catalog: createCatalog(objects), library, globalSets: data.globalRequirementSets };
}
