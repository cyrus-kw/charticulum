// Core data shapes for the chart engine.
//
// These are only *types*: they describe what data looks like, and
// TypeScript checks that our code follows them. They produce no
// JavaScript at runtime.

// ---------------------------------------------------------------------------
// Objects (the "o" in the o-a system)
// ---------------------------------------------------------------------------

// What sort of thing an object is. A string "union" type: the value must
// be exactly one of these strings.
// - course: a class with a number and credits, taken in a term (CMPSC 121).
// - experience: work done outside a classroom that counts toward the
//   degree, like an internship, co-op, or study abroad.
// - milestone: a checkpoint the student passes, usually with no credits,
//   like a sophomore review or applying to a major.
// - proficiency: a skill shown rather than a class taken, like passing a
//   language or placement exam.
export type ObjectType = "course" | "experience" | "milestone" | "proficiency";

export type Category =
  | "major"
  | "minor"
  | "general-education"
  | "elective"
  | "focus";

// How each category is written for people.
export const CATEGORY_NAMES: Record<Category, string> = {
  major: "Major",
  minor: "Minor",
  "general-education": "General Education",
  elective: "Elective",
  focus: "Focus",
};

export type Grade =
  | "A" | "A-"
  | "B+" | "B" | "B-"
  | "C+" | "C" | "C-"
  | "D+" | "D" | "D-"
  | "F";

export interface Requisites {
  // Must be completed in an EARLIER term.
  previous: string[];
  // Must be taken in the SAME term or earlier.
  concurrent: string[];
  // Lowest acceptable grade for a requisite, e.g. { CS101: "C" }.
  // Requisites without an entry accept any grade.
  minGrades?: Record<string, Grade>;
}

// An object at another institution that counts as this one
// (transfer credit, AP exams, etc.).
export interface ExternalEquivalent {
  institution: string;
  externalId: string;
}

export type Season = "winter" | "spring" | "summer" | "fall";

// The seasons a course runs in when a school doesn't say otherwise, in
// calendar order (winter is January).
export const EVERY_TERM: Season[] = ["winter", "spring", "summer", "fall"];

// When an object is offered. Seasons are always listed out (rather than
// leaving the field out to mean "any"), so the data says exactly what it
// means. An empty list means the school hasn't scheduled it yet ("TBA").
export interface Availability {
  seasons: Season[];
  // Offered only in odd or even calendar years.
  yearParity?: "odd" | "even";
}

// A course's code, in its parts: "CAS 100A" is subject "CAS", number
// 100, suffix "A". Kept apart (not just inside the id) so courses can be
// grouped by subject and sorted by number.
export interface CourseCode {
  subject: string;
  number: number;
  // Letters after the number, if any ("A" in CAS 100A, "W" in CMPSC 483W).
  suffix?: string;
}

// A subject a school teaches in, e.g. { code: "CMPSC", name: "Computer
// Science" }. Course codes start with a subject's code.
export interface Subject {
  code: string;
  name: string;
}

// One plannable thing: a course, internship, milestone, or proficiency.
// Its fields are its attributes (the "a" in the o-a system).
export interface CurriculumObject {
  id: string;
  // Numbered courses have a code, and their id is its parts run together
  // ("CAS100A"). Other objects (a milestone like SOPH-REV) have none.
  code?: CourseCode;
  type: ObjectType;
  title: string;
  // What the course covers, in the school's words. Optional.
  description?: string;
  credits: number;
  requisites: Requisites;
  // Other objects at this school that count as this one.
  internalEquivalents: string[];
  externalEquivalents: ExternalEquivalent[];
  // Which requirement categories this object counts toward.
  categories: Category[];
  // For general-education objects, which area they fill, e.g. "Humanities".
  // Cards show its first letter ("G-H").
  genEdArea?: string;
  availability: Availability;
}

// All known objects, looked up by id. A Map is a built-in key -> value store.
export type Catalog = Map<string, CurriculumObject>;

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

// The first term (index 0) is Pre-Credit: work the student already did
// elsewhere (AP exams, transfer courses) that counts here.
export const EXTERNAL_TERM = 0;
export const EXTERNAL_TERM_LABEL = "Pre-Credit";

export interface Term {
  index: number;
  label: string;
  objectIds: string[];
  // Optional calendar position, used for availability checks.
  season?: Season;
  year?: number;
}

// Something the student finished at another institution.
export interface CompletedExternal {
  institution: string;
  externalId: string;
}

export interface Chart {
  name: string;
  terms: Term[];
  completedExternal: CompletedExternal[];
  // Grades earned so far, by object id. Planned objects have no grade yet.
  grades?: Record<string, Grade>;
  overrides?: Override[];
  // The school templates (and their versions) this chart was forked from.
  pinnedTemplates?: TemplateRef[];
}

// ---------------------------------------------------------------------------
// Templates: school-defined charts, versioned by academic year.
// ---------------------------------------------------------------------------

export interface TemplateRef {
  templateId: string;
  // An academic year such as "2026-27".
  version: string;
}

export interface ChartTemplate {
  id: string;
  version: string;
  name: string;
  // This program's local r-o-s.
  requirementSets: RequirementSet[];
  // The school's suggested plan.
  terms: Term[];
}

// ---------------------------------------------------------------------------
// Overrides: recorded exceptions to the rules, e.g. an advisor waiving a
// prerequisite. An override can depend on a grade.
// ---------------------------------------------------------------------------

export type OverrideKind = "waive-requirement" | "waive-requisite" | "substitute";

export interface OverrideCondition {
  objectId: string;
  minGrade: Grade;
}

interface OverrideBase {
  id: string;
  reason: string;
  // Missing means the override always applies.
  condition?: OverrideCondition;
}

// A "discriminated union": the `kind` field tells TypeScript which of the
// three shapes an Override is, so it knows which other fields exist.
export type Override =
  // objectId is no longer required.
  | (OverrideBase & { kind: "waive-requirement"; objectId: string })
  // objectId no longer needs requisiteId.
  | (OverrideBase & { kind: "waive-requisite"; objectId: string; requisiteId: string })
  // substituteId counts as objectId.
  | (OverrideBase & { kind: "substitute"; objectId: string; substituteId: string });

// ---------------------------------------------------------------------------
// Required objects and satisfactions (r-o-s). MVP version: one flat set of
// rules. Global/local scopes, overrides, and school policy come later.
// ---------------------------------------------------------------------------

export interface Requirements {
  requiredObjectIds: string[];
  // Partial<...> means not every category needs an entry.
  minCreditsByCategory: Partial<Record<Category, number>>;
  minTotalCredits: number;
  maxCreditsPerTerm: number;
  // School policy: may one object count toward several categories?
  // If false, it only counts toward the first category it lists.
  allowDoubleCounting: boolean;
  // Lowest acceptable GPA across graded objects (4.0 scale).
  minGpa?: number;
  // School policy: which override kinds are accepted. Missing means all.
  allowedOverrides?: OverrideKind[];
  // School policy: most credits that may count toward more than one
  // category (e.g. shared between a major and a minor). Missing = no limit.
  maxSharedCredits?: number;
  // Credits needed from a group of courses: a gen ed area, a department,
  // or a list ("18 credits from the electives below").
  creditRules?: CreditRule[];
  // Lowest acceptable grade in a course, e.g. { CMPSC221: "C" } for a
  // "C-required" course. Courses not graded yet pass for now.
  minGrades?: Record<string, Grade>;
}

// "At least `credits` credits from courses that match." A course matches
// when it fits every field given; a list field matches any one of its
// entries. So { subjects: ["CMPSC"], minNumber: 400 } is "400-level CMPSC".
// A course can count toward several rules (a GQ math course also counts
// toward the major).
export interface CreditRule {
  id: string;
  // How it's written for people, e.g. "Quantification (GQ)".
  name: string;
  credits: number;
  // Gen ed areas, as the school names them ("Quantification").
  genEdAreas?: string[];
  // Subject codes ("CMPSC").
  subjects?: string[];
  // Course numbers at least this ("400-level" is 400).
  minNumber?: number;
  // Exactly these objects.
  objectIds?: string[];
  // Graded courses only count with at least this grade.
  minGrade?: Grade;
}

// Global sets apply to every chart (e.g. general education); local sets
// belong to one chart (e.g. a major or minor).
export type RequirementScope = "global" | "local";

// A named group of rules. Every rule field is optional, since a set
// usually covers only part of the picture.
export interface RequirementSet extends Partial<Requirements> {
  id: string;
  name: string;
  scope: RequirementScope;
}

// ---------------------------------------------------------------------------
// Issues: what the engine reports back (progressive error correction).
// ---------------------------------------------------------------------------

export type IssueCode =
  | "UNKNOWN_OBJECT"
  | "DUPLICATE_PLACEMENT"
  | "PREVIOUS_REQUISITE_NOT_MET"
  | "CONCURRENT_REQUISITE_NOT_MET"
  | "REQUISITE_GRADE_TOO_LOW"
  | "FAILING_GRADE"
  | "GPA_BELOW_MINIMUM"
  | "UNBACKED_EXTERNAL_TERM"
  | "NOT_OFFERED"
  | "TERM_OVER_CREDIT_LIMIT"
  | "MISSING_REQUIRED_OBJECT"
  | "CATEGORY_SHORTFALL"
  | "CREDIT_RULE_SHORTFALL"
  | "REQUIRED_GRADE_TOO_LOW"
  | "TOTAL_CREDITS_SHORTFALL"
  | "SHARED_CREDITS_OVER_LIMIT"
  | "TEMPLATE_NOT_FOUND"
  | "OVERRIDE_NOT_ALLOWED"
  | "OVERRIDE_CONDITION_NOT_MET"
  | "OVERRIDE_UNKNOWN_OBJECT"
  | "REQUISITE_CYCLE"
  | "OBJECT_EXCEEDS_TERM_LIMIT"
  | "UNSCHEDULABLE";

export interface ChartIssue {
  code: IssueCode;
  message: string;
  // The "?" means the field is optional: it may be missing.
  objectId?: string;
  termIndex?: number;
  // For requisite problems: which requisite isn't met.
  requisiteId?: string;
  // For a requirement that isn't met yet: its name, the same as its meter
  // in Requirements ("General Education", "Total Credits"), and a short
  // summary to show beside that name ("15 more credits").
  requirement?: string;
  summary?: string;
}
