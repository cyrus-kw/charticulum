// A school split across several JSON files, instead of one big one:
//
//   school.json          the school's id and name, calendar, school-wide
//                        rules, and AP/transfer table
//   subjects.json        { "subjects": [{ "code": "CMPSC", "name": "Computer Science" }, ...] }
//   objects/cmpsc.json   { "subject": "CMPSC", "objects": [{ "number": 121, "type": "course", "title": ..., ... }] }
//   programs/*.json      program templates (one, or a list)
//
// A subject's file names its subject (which must be in subjects.json),
// and its objects only give their number and letter: CMPSC + 121 makes the
// id CMPSC121. combineSchoolFiles puts the files back together into one
// SchoolData and checks it like any import. This file does no reading from
// disk (the engine never does); the caller passes in each file's contents.
import { z } from "zod";
import { courseCodeId } from "./codes";
import { objectFields, parseSchoolData, withOldNamesRenamed, schoolDataSchema, subjectSchema, type ParseResult, type SchoolDataInput } from "./school";

const schoolFileSchema = schoolDataSchema.omit({ objects: true, subjects: true, templates: true });

const subjectsFileSchema = z.object({ subjects: z.array(subjectSchema) });

const subjectObjectsFileSchema = z.object({
  subject: subjectSchema.shape.code,
  objects: z.array(
    objectFields.extend({
      number: z.number().int().min(0),
      suffix: z.string().regex(/^[A-Z]+$/, "Use capital letters only, e.g. A.").optional(),
    }),
  ),
});

const programFileSchema = z.union([schoolDataSchema.shape.templates.unwrap().element, schoolDataSchema.shape.templates.unwrap()]);

// One file's name (for error messages) and its parsed JSON.
export interface SchoolFile {
  name: string;
  json: unknown;
}

export interface SchoolFiles {
  school: SchoolFile;
  subjects: SchoolFile;
  objects: SchoolFile[];
  programs?: SchoolFile[];
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
  const subjects = read(files.subjects, subjectsFileSchema, errors);

  // Which file each object came from, so later errors can name it.
  const fileOf = new Map<string, string>();
  const objects: SchoolDataInput["objects"] = [];
  for (const file of files.objects) {
    const data = read({ ...file, json: withOldNamesRenamed(file.json) }, subjectObjectsFileSchema, errors);
    if (!data) continue;
    for (const { number, suffix, ...fields } of data.objects) {
      const code = { subject: data.subject, number, ...(suffix ? { suffix } : {}) };
      const id = courseCodeId(code);
      if (fileOf.has(id)) errors.push(`${file.name}: ${id} is also in ${fileOf.get(id)}`);
      fileOf.set(id, file.name);
      objects.push({ id, code, ...fields });
    }
  }

  const templates = (files.programs ?? []).flatMap((file) => {
    const data = read(file, programFileSchema, errors);
    return data === undefined ? [] : Array.isArray(data) ? data : [data];
  });

  if (errors.length > 0 || !school || !subjects) return { ok: false, errors };

  const result = parseSchoolData({ ...school, subjects: subjects.subjects, objects, templates });
  if (result.ok) return result;
  // Errors about one object ("objects.CMPSC465.requisites: ...") also say
  // which file it's in.
  return {
    ok: false,
    errors: result.errors.map((error) => {
      const id = /^objects\.([^.:]+)/.exec(error)?.[1];
      return id && fileOf.has(id) ? `${fileOf.get(id)}: ${error}` : error;
    }),
  };
}
