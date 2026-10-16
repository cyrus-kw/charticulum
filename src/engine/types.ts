// Core data shapes for the chart engine.
//
// These are only *types*: they describe what data looks like, and
// TypeScript checks that our code follows them. They produce no
// JavaScript at runtime.

// ---------------------------------------------------------------------------
// Objects (the "o" in the o-a system)
// ---------------------------------------------------------------------------

// A string "union" type: the value must be exactly one of these strings.
export type ObjectKind = "course" | "experience" | "milestone" | "proficiency";

export type Category =
  | "major"
  | "minor"
  | "general-education"
  | "elective"
  | "focus";

export interface Requisites {
  // Must be completed in an EARLIER term.
  previous: string[];
  // Must be taken in the SAME term or earlier.
  concurrent: string[];
}

// An object at another institution that counts as this one
// (transfer credit, AP exams, etc.).
export interface ExternalEquivalent {
  institution: string;
  externalId: string;
}

export type Season = "winter" | "spring" | "summer" | "fall";

// When an object is offered. A missing field means "no restriction".
export interface Availability {
  seasons?: Season[];
  // Offered only in odd or even calendar years.
  yearParity?: "odd" | "even";
}

// One plannable thing: a course, internship, milestone, or proficiency.
// Its fields are its attributes (the "a" in the o-a system).
export interface CourseObject {
  id: string;
  kind: ObjectKind;
  title: string;
  credits: number;
  requisites: Requisites;
  // Other objects at this school that count as this one.
  internalEquivalents: string[];
  externalEquivalents: ExternalEquivalent[];
  // Which requirement categories this object counts toward.
  categories: Category[];
  // Missing means offered every term.
  availability?: Availability;
}

// All known objects, looked up by id. A Map is a built-in key -> value store.
export type Catalog = Map<string, CourseObject>;

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

// Term 0 is reserved for external equivalents (credit earned elsewhere).
export const EXTERNAL_TERM = 0;

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
}

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
  | "UNBACKED_EXTERNAL_TERM"
  | "NOT_OFFERED"
  | "TERM_OVER_CREDIT_LIMIT"
  | "MISSING_REQUIRED_OBJECT"
  | "CATEGORY_SHORTFALL"
  | "TOTAL_CREDITS_SHORTFALL"
  | "REQUISITE_CYCLE"
  | "OBJECT_EXCEEDS_TERM_LIMIT"
  | "UNSCHEDULABLE";

export interface ChartIssue {
  code: IssueCode;
  message: string;
  // The "?" means the field is optional: it may be missing.
  objectId?: string;
  termIndex?: number;
}
