// A school split across several JSON files, instead of one big one:
//
//   school.json          the school's id and name, and its calendar
//   structure.json       levels (with their course numbers), credentials,
//                        and divisions (colleges) with their departments
//                        (optional)
//   attributes.json      { "groups": [...], "attributes": [...] }: the labels
//                        courses carry, like gen ed areas (optional)
//   subjects.json        { "subjects": [{ "code": "CMPSC", "name": "Computer Science" }, ...] }
//   courses/cmpsc.json   { "subject": "CMPSC", "courses": [{ "number": 121, "title": ..., ... }] }
//   requirements/credentials/bachelors.json
//                        the rules every program of one credential
//                        follows (optional; the file's name is the credential)
//   programs/bachelors/cmpsc-bs.json
//                        program templates (one, or a list), in a folder
//                        named for their programType (a credential)
//
// A subject's file names its subject (which must be in subjects.json),
// and its courses only give their number and letter: CMPSC + 121 makes
// the id CMPSC121. A course's type can be left out when it's "course",
// and its credits can be a range ({ "min": 1, "max": 9 }).
// combineSchoolFiles puts the files back together into one SchoolData and
// checks it like any import. This file does no reading from disk (the
// engine never does); the caller passes in each file's contents.
import { z } from "zod";
import { courseCodeId } from "./codes";
import {
  attributeGroupSchema,
  attributeSchema,
  objectFields,
  parseSchoolData,
  schoolDataSchema,
  structureSchema,
  subjectSchema,
  type ParseResult,
  type SchoolDataInput,
} from "./school";

const schoolFileSchema = schoolDataSchema.pick({ formatVersion: true, school: true, calendar: true, equivalencyTable: true });

const attributesFileSchema = z.object({
  groups: z.array(attributeGroupSchema).default([]),
  attributes: z.array(attributeSchema),
});

const subjectsFileSchema = z.object({ subjects: z.array(subjectSchema) });

const credits = z.number().min(0);
const subjectCoursesFileSchema = z.object({
  subject: subjectSchema.shape.code,
  courses: z.array(
    objectFields.extend({
      number: z.number().int().min(0),
      suffix: z.string().regex(/^[A-Z]+$/, "Use capital letters only, e.g. A.").optional(),
      type: objectFields.shape.type.default("course"),
      credits: z.union([
        credits,
        z.object({ min: credits, max: credits }).refine((range) => range.max >= range.min, "max is less than min"),
      ]),
    }),
  ),
});

// A credential's rules: a school-wide set (programRequirements) without
// its programType, which is the file's name.
const requirementsFileSchema = schoolDataSchema.shape.programRequirements.unwrap().element.omit({ programType: true });

const programFileSchema = z.union([schoolDataSchema.shape.templates.unwrap().element, schoolDataSchema.shape.templates.unwrap()]);

// One file's name (for error messages) and its parsed JSON.
export interface SchoolFile {
  name: string;
  json: unknown;
}

// A requirements file also names its credential, from its file name
// (requirements/credentials/bachelors.json is "bachelors").
export interface RequirementsFile extends SchoolFile {
  credential: string;
}

// A program file also names the folder it's in, which is its programs'
// type ("bachelors"), so a program in the wrong folder is caught.
export interface ProgramFile extends SchoolFile {
  programType: string;
}

export interface SchoolFiles {
  school: SchoolFile;
  structure?: SchoolFile;
  attributes?: SchoolFile;
  subjects: SchoolFile;
  courses: SchoolFile[];
  requirements?: RequirementsFile[];
  programs?: ProgramFile[];
}

// Check one file against its schema; errors start with the file's name.
function read<T>(file: SchoolFile, schema: z.ZodType<T>, errors: string[]): T | undefined {
  const result = schema.safeParse(file.json);
  if (result.success) return result.data;
  for (const issue of result.error.issues) errors.push(`${file.name}: ${issue.path.join(".") || "(top level)"}: ${issue.message}`);
  return undefined;
}

export function combineSchoolFiles(files: SchoolFiles): ParseResult {
  const errors: string[] = [];
  const school = read(files.school, schoolFileSchema, errors);
  const structure = files.structure ? read(files.structure, structureSchema, errors) : undefined;
  const attributes = files.attributes ? read(files.attributes, attributesFileSchema, errors) : undefined;
  const subjects = read(files.subjects, subjectsFileSchema, errors);

  // Which file each course came from, so later errors can name it.
  const fileOf = new Map<string, string>();
  const objects: SchoolDataInput["objects"] = [];
  for (const file of files.courses) {
    const data = read(file, subjectCoursesFileSchema, errors);
    if (!data) continue;
    for (const { number, suffix, credits, ...fields } of data.courses) {
      const code = { subject: data.subject, number, ...(suffix ? { suffix } : {}) };
      const id = courseCodeId(code);
      if (fileOf.has(id)) errors.push(`${file.name}: ${id} is also in ${fileOf.get(id)}`);
      fileOf.set(id, file.name);
      const range = typeof credits === "number" ? { credits } : { credits: credits.min, maxCredits: credits.max };
      objects.push({ id, code, ...fields, ...range });
    }
  }

  const programRequirements = (files.requirements ?? []).flatMap((file) => {
    const data = read(file, requirementsFileSchema, errors);
    return data ? [{ ...data, programType: file.credential }] : [];
  });

  const templates = (files.programs ?? []).flatMap((file) => {
    const data = read(file, programFileSchema, errors);
    const programs = data === undefined ? [] : Array.isArray(data) ? data : [data];
    for (const program of programs) {
      if (program.programType !== file.programType) {
        errors.push(`${file.name}: ${program.code} is a ${program.programType} program, so it goes in programs/${program.programType}/`);
      }
    }
    return programs;
  });

  if (errors.length > 0 || !school || !subjects) return { ok: false, errors };

  const result = parseSchoolData({
    ...school,
    ...(structure ? { structure } : {}),
    // Without structure.json, the program types are the ones the folders use.
    ...(structure ? {} : { programs: [...new Set([...programRequirements, ...templates].map((p) => p.programType))] }),
    attributeGroups: attributes?.groups ?? [],
    attributes: attributes?.attributes ?? [],
    subjects: subjects.subjects,
    objects,
    programRequirements,
    templates,
  });
  if (result.ok) return result;
  // Errors about one course ("objects.CMPSC465.requisites: ...") also say
  // which file it's in.
  return {
    ok: false,
    errors: result.errors.map((error) => {
      const id = /^objects\.([^.:]+)/.exec(error)?.[1];
      return id && fileOf.has(id) ? `${fileOf.get(id)}: ${error}` : error;
    }),
  };
}
