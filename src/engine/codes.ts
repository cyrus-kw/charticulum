// Course codes: the subject, number, and optional letter that name a
// course ("CAS 100A" is subject CAS, number 100, letter A). Objects that
// aren't numbered courses (a proficiency like SPAN-PROF) have no code.
import type { CourseCode, CurriculumObject } from "./types";

// Subject letters, then the number, then any letters after it. Spaces are
// allowed between the parts, so both "CAS100A" and "CAS 100A" read. A few
// subjects have a hyphen or underscore inside (Penn State's A-I and BE_T).
export const SUBJECT_PATTERN = /^[A-Z][A-Z_-]*$/;
const CODE_PATTERN = /^([A-Z][A-Z_-]*?)\s*(\d+)([A-Z]*)$/;

// Read a code out of text like "CAS 100A" or an id like "CAS100A".
// Returns undefined for anything else (e.g. "SPAN-PROF").
export function parseCourseCode(text: string): CourseCode | undefined {
  const match = CODE_PATTERN.exec(text.trim().toUpperCase());
  if (!match) return undefined;
  const [, subject, number, suffix] = match;
  return { subject, number: Number(number), ...(suffix ? { suffix } : {}) };
}

// The id a code belongs to: the parts run together, "CAS100A".
export function courseCodeId(code: CourseCode): string {
  return `${code.subject}${code.number}${code.suffix ?? ""}`;
}

// A code written for people: "CAS 100A".
export function formatCourseCode(code: CourseCode): string {
  return `${code.subject} ${code.number}${code.suffix ?? ""}`;
}

// Sort order for objects: by subject, then number (as a number, so 97
// comes before 100), then letter (none first: CAS 100, CAS 100A, CAS 100B).
// Objects without a code go after all coded ones, by id.
type Coded = Pick<CurriculumObject, "id" | "code">;
export function compareByCode(a: Coded, b: Coded): number {
  if (!a.code || !b.code) return Number(!a.code) - Number(!b.code) || a.id.localeCompare(b.id);
  return (
    a.code.subject.localeCompare(b.code.subject) ||
    a.code.number - b.code.number ||
    (a.code.suffix ?? "").localeCompare(b.code.suffix ?? "")
  );
}
