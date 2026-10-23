// Builds Penn State's school data (subjects, courses, attributes, and
// school-wide rules) from its public bulletins, bulletins.psu.edu, and
// writes it as a folder of JSON files (the layout is described in
// src/engine/schoolFiles.ts):
//
//   schools/penn-state/school.json         id, name, calendar
//   schools/penn-state/attributes.json     course labels: gen ed, US/IL, W, ...
//   schools/penn-state/subjects.json       every subject: code and name
//   schools/penn-state/courses/cmpsc.json  one subject's courses (undergraduate
//                                          and graduate), by number
//   schools/penn-state/requirements/credentials/bachelors.json
//                                          the rules every bachelor's degree follows
//
// Two parts are written by hand, and left alone here:
//
//   schools/penn-state/structure.json      levels (and their course numbers),
//                                          credentials, colleges
//   schools/penn-state/programs/bachelors/cmpsc-bs.json
//                                          programs, one folder per credential
//
//   npx tsx scripts/penn-state.ts          # writes the folder
//   npx tsx scripts/penn-state.ts --save   # also saves it to the database in .env,
//                                          # with the folder's programs and the
//                                          # ones already saved there
//
// What it reads:
// - The undergraduate and graduate subject lists
//   (.../university-course-descriptions/undergraduate/ and .../graduate/),
//   then each subject's course lists: each course's title, description,
//   credits, prerequisites, and attributes (the labels listed in
//   .../university-course-descriptions/, under Course Attributes).
// - The program pages in PROGRAMS, only as hints: which courses their
//   suggested plans use (to put the likeliest option of an "A or B"
//   first). It doesn't write any programs; those are made by hand, in
//   programs/<program type>/, with their own "A or B" lines as choices.
//
// Downloaded pages are kept in node_modules/.cache/penn-state, so running
// it again doesn't download them again (delete that folder to refresh).
//
// A course's requisites are a list where every entry is needed, and an
// entry can be a choice of options ("MATH 140 or MATH 140H"), so most of
// Penn State's "A or B" rules carry over as written (see requisiteItems).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compareByCode,
  parseCourseCode,
  parseSchoolData,
  requiredIds,
  requiredKey,
  type Grade,
  type RequiredItem,
} from "../src/engine/index";
import type { SchoolDataInput } from "../src/engine/school";
import { readSchoolFolder } from "../src/server/schoolFolder";

const BULLETIN = "https://bulletins.psu.edu";
const COLLEGES = `${BULLETIN}/undergraduate/colleges`;
// The course lists, one section per level. A subject can be in both
// (CMPSC 121 is undergraduate, CMPSC 598 graduate); its courses go in one
// file either way, and their numbers say their level (structure.json).
const LEVELS = ["undergraduate", "graduate"] as const;
const COURSES = `${BULLETIN}/university-course-descriptions`;
// The bulletin's year starts this fall.
const START_YEAR = 2026;
const CACHE = "node_modules/.cache/penn-state";
const OUT = "schools/penn-state";

// Program pages read for hints (see above). Add one here (its address on
// bulletins.psu.edu) to help put the likeliest option of an "A or B" first.
const PROGRAMS = [
  "engineering/computer-science-bs",
  "engineering/computer-engineering-bs",
  "engineering/data-sciences-bs",
  "engineering/electrical-engineering-bs",
  "engineering/mechanical-engineering-bs",
];

// Penn State's course attributes, as the bulletin lists them under
// Course Attributes, in families (groups). Each course lists its own, one
// paragraph each ("General Education: Humanities (GH)", "United States
// Cultures (US)"); `label` is that paragraph. The gen ed group is the
// general-education category, so its attributes are also a course's gen
// ed areas (by name). Inter-Domain comes last, so an Inter-Domain course
// shows a domain's letter on its card.
const ATTRIBUTE_GROUPS = [
  { id: "gen-ed", name: "General Education", category: "general-education" as const },
  { id: "bachelor-of-arts", name: "Bachelor of Arts" },
  { id: "cultural-diversity", name: "Cultural Diversity" },
  { id: "first-year", name: "First-Year Engagement" },
  { id: "writing", name: "Writing Across the Curriculum" },
  { id: "honors", name: "Honors" },
];
const ATTRIBUTES = [
  { id: "GWS", name: "Writing and Speaking", group: "gen-ed", label: "General Education: Writing/Speaking (GWS)" },
  { id: "GQ", name: "Quantification", group: "gen-ed", label: "General Education: Quantification (GQ)" },
  { id: "GA", name: "Arts", group: "gen-ed", label: "General Education: Arts (GA)" },
  { id: "GH", name: "Humanities", group: "gen-ed", label: "General Education: Humanities (GH)" },
  { id: "GN", name: "Natural Sciences", group: "gen-ed", label: "General Education: Natural Sciences (GN)" },
  { id: "GS", name: "Social and Behavioral Sciences", group: "gen-ed", label: "General Education: Social and Behavioral Scien (GS)" },
  { id: "GHW", name: "Health and Wellness", group: "gen-ed", label: "General Education: Health and Wellness (GHW)" },
  { id: "INTER", name: "Inter-Domain", group: "gen-ed", label: "General Education - Integrative: Interdomain" },
  { id: "BA-A", name: "BA: Arts", group: "bachelor-of-arts", label: "Bachelor of Arts: Arts" },
  { id: "BA-H", name: "BA: Humanities", group: "bachelor-of-arts", label: "Bachelor of Arts: Humanities" },
  { id: "BA-N", name: "BA: Natural Sciences", group: "bachelor-of-arts", label: "Bachelor of Arts: Natural Sciences" },
  { id: "BA-Q", name: "BA: Quantification", group: "bachelor-of-arts", label: "Bachelor of Arts: Quantification" },
  { id: "BA-S", name: "BA: Social and Behavioral Sciences", group: "bachelor-of-arts", label: "Bachelor of Arts: Social and Behavioral Sciences" },
  { id: "BA-WC", name: "BA: World Cultures", group: "bachelor-of-arts", label: "Bachelor of Arts: World Cultures" },
  { id: "BA-WL12", name: "BA: World Language (12th Unit)", group: "bachelor-of-arts", label: "Bachelor of Arts: World Lang (12th Unit)" },
  { id: "BA-WL", name: "BA: World Language (All)", group: "bachelor-of-arts", label: "Bachelor of Arts: World Language (All)" },
  { id: "US", name: "United States Cultures", group: "cultural-diversity", label: "United States Cultures (US)" },
  { id: "IL", name: "International Cultures", group: "cultural-diversity", label: "International Cultures (IL)" },
  { id: "FYS", name: "First-Year Seminar", group: "first-year", label: "First-Year Seminar" },
  { id: "W", name: "Writing Across the Curriculum", group: "writing", label: "Writing Across the Curriculum" },
  { id: "HON", name: "Honors", group: "honors", label: "Honors" },
];
const ATTRIBUTE_BY_LABEL = new Map(ATTRIBUTES.map((a) => [a.label, a.id]));

// The baccalaureate degree's 45 gen ed credits, for every program
// (bulletins.psu.edu/undergraduate/general-education/baccalaureate-degree-general-education-program/):
// Foundations 15, Knowledge Domains 15, Integrative Studies 6, and
// Exploration 9. A course counts toward one of them only, the first in
// this order that still needs it, so the narrow rules come first.
const NOT_INTER = ["INTER"];
const GEN_ED = {
  category: "general-education",
  eachCourseOnce: true,
  rules: [
    // Foundations: C or better, and not Inter-Domain courses.
    { id: "WS", name: "Writing and Speaking", attributes: ["GWS"], credits: 9, minGrade: "C" as Grade, notAttributes: NOT_INTER },
    { id: "Q", name: "Quantification", attributes: ["GQ"], credits: 6, minGrade: "C" as Grade, notAttributes: NOT_INTER },
    // Knowledge Domains: not Inter-Domain courses.
    { id: "HW", name: "Health and Wellness", attributes: ["GHW"], credits: 3, notAttributes: NOT_INTER },
    { id: "N", name: "Natural Sciences", attributes: ["GN"], credits: 3, notAttributes: NOT_INTER },
    { id: "A", name: "Arts", attributes: ["GA"], credits: 3, notAttributes: NOT_INTER },
    { id: "H", name: "Humanities", attributes: ["GH"], credits: 3, notAttributes: NOT_INTER },
    { id: "S", name: "Social and Behavioral Sciences", attributes: ["GS"], credits: 3, notAttributes: NOT_INTER },
    // Integrative Studies.
    { id: "INT", name: "Integrative Studies", attributes: ["INTER"], credits: 6 },
    // Exploration: Natural Sciences (may be Inter-Domain), then any domain
    // or Inter-Domain.
    { id: "EXN", name: "Exploration: Natural Sciences", attributes: ["GN"], credits: 3 },
    { id: "EX", name: "Exploration", attributes: ["GA", "GH", "GN", "GS", "INTER"], credits: 6 },
  ],
};

type Course = SchoolDataInput["objects"][number];

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

async function download(url: string): Promise<string> {
  const file = join(CACHE, url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_") + ".html");
  try {
    return await readFile(file, "utf8");
  } catch {
    // Not downloaded yet.
  }
  // Big pages sometimes get cut off partway; try again a few times.
  let html = "";
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
      html = await response.text();
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, html);
  // Be polite to the bulletin's server: one page at a time, with a pause.
  await new Promise((resolve) => setTimeout(resolve, 300));
  return html;
}

// ---------------------------------------------------------------------------
// Reading HTML. The bulletin's pages are generated and very regular, so
// patterns (regular expressions) are enough; no HTML library needed.
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// HTML to plain text: tags dropped, entities like &amp; turned back into
// characters, and runs of spaces squeezed to one.
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[\da-f]+|\w+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// "CMPSC 121" → "CMPSC121", the id the app uses (it shows it as "CMPSC 121").
// Some codes have an invisible "zero-width space" in them ("A-\u200bI"),
// so those go too.
const courseId = (code: string) => code.replace(/[\s\u200b]+|&#8203;/g, "").toUpperCase();

// The course codes linked in a piece of HTML, in order. Each link names
// its course in full (showCourse(this, 'CMPSC 131')) even where the text
// shortens it ("CMPSC 121 or 131").
function linkedCourses(html: string): string[] {
  return [...html.matchAll(/showCourse\(this, '([^']+)'\)/g)].map((m) => courseId(m[1]));
}

// A course's credits text: "3 Credits", "1.5 Credits", a range "1-3
// Credits", and either with a limit for taking it again, "3
// Credits/Maximum of 6" (repeatable, up to 6 in all).
function parseCredits(value: string): Pick<Course, "credits" | "maxCredits" | "repeatable"> {
  const match = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*Credits?(?:\s*\/\s*Maximum of\s*(\d+(?:\.\d+)?))?/i.exec(value);
  if (!match) throw new Error(`Can't read credits "${value}"`);
  const [, low, high, maximum] = match;
  return {
    credits: Number(low),
    ...(high && Number(high) !== Number(low) ? { maxCredits: Number(high) } : {}),
    ...(maximum ? { repeatable: { maxCredits: Number(maximum) } } : {}),
  };
}

// Course codes written out as plain text, not links ("CMPEN362 ; E E 353"),
// as graduate pages often do: any known subject's code followed by a
// number and letters. A space may come between the code's letters, since
// older text writes EE as "E E 353". Set once the subject lists are read
// (useSubjectCodes). Not inside a § marker.
let plainCode: RegExp | undefined;
function useSubjectCodes(codes: string[]) {
  const patterns = [...codes]
    .sort((a, b) => b.length - a.length)
    .map((code) => [...code.replace(/\s+/g, "")].map((c) => c.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join(" ?"));
  plainCode = new RegExp(`(?<![§\\w-])(${patterns.join("|")})\\s*(\\d{1,3}[A-Z]{0,2})(?![\\w§])`, "g");
}

// ---------------------------------------------------------------------------
// Prerequisites. The bulletin writes them as sentences:
//   "(CMPSC 122 or CMPSC 132) and (CMPSC 360 or MATH 311W)"
//   "MATH 21 or satisfactory performance on the mathematics placement examination"
// They're read into a small tree of "all of" / "one of" groups, then
// turned into the list the engine wants (requisiteItems).
// ---------------------------------------------------------------------------

type Requirement =
  | { kind: "course"; id: string }
  // Anything else: class standing, a placement exam, permission, ...
  | { kind: "other"; words: string }
  | { kind: "all" | "any"; parts: Requirement[] };

function parseRequirement(html: string): Requirement {
  // Swap each course link for a marker, so the rest can be read as text.
  const linked = html.replace(/<a [^>]*showCourse\(this, '([^']+)'\)[^>]*>.*?<\/a>/g, (_, code: string) => ` §${courseId(code)}§ `);
  // Codes that aren't links get a marker too.
  const marked = plainCode ? text(linked).replace(plainCode, (_, subject: string, number: string) => ` §${courseId(subject + number)}§ `) : text(linked);
  const tokens = marked.match(/§[^§]+§|\(|\)|,|;|[^\s(),;§]+/g) ?? [];
  let at = 0;

  // One level of the sentence: items joined by "and", "or", or commas,
  // up to a closing parenthesis.
  function group(): Requirement {
    const items: Requirement[] = [];
    const joins: string[] = [];
    let words: string[] = [];
    const endWords = () => {
      if (words.length > 0) items.push({ kind: "other", words: words.join(" ") });
      words = [];
    };
    const join = (how: string) => {
      endWords();
      // Two joins in a row ("A, or B") count once.
      if (joins.length < items.length) joins.push(how);
      else if (how !== ",") joins[joins.length - 1] = how;
    };
    while (at < tokens.length) {
      const token = tokens[at++];
      if (token === ")") break;
      if (token === "(") {
        endWords();
        items.push(group());
      } else if (token.startsWith("§")) {
        endWords();
        items.push({ kind: "course", id: token.slice(1, -1) });
      } else if (/^\d{1,3}[A-Z]{0,2}$/.test(token) && words.length === 0 && joins.length === items.length && items.at(-1)?.kind === "course") {
        // A number right after "MATH 140 or" is the same subject's course
        // ("MATH 140 or 141"), when the text isn't a link.
        const previous = items.at(-1) as { kind: "course"; id: string };
        const subject = parseCourseCode(previous.id)?.subject;
        if (subject) items.push({ kind: "course", id: courseId(subject + token) });
        else words.push(token);
      } else if (/^(and|or|,|;)$/i.test(token)) {
        join(token.toLowerCase());
      } else {
        words.push(token);
      }
      // Two items with no join between them (a course right after a
      // parenthesis, say) are read as "and".
      if (items.length > joins.length + 1) joins.splice(items.length - 2, 0, "and");
    }
    endWords();
    joins.length = Math.max(0, items.length - 1);
    // "A, B, or C": a comma means whichever join comes after it (up to
    // the next semicolon).
    for (let i = joins.length - 1, next = "and"; i >= 0; i--) {
      if (joins[i] === ",") joins[i] = next;
      else next = joins[i] === ";" ? "and" : joins[i];
    }
    // A semicolon splits the sentence into parts that are all needed:
    // "CMPEN 362; EE 353 or EE 350" is CMPEN 362 and (EE 353 or EE 350).
    const parts: { items: Requirement[]; joins: string[] }[] = [{ items: [], joins: [] }];
    items.forEach((item, i) => {
      const part = parts[parts.length - 1];
      part.items.push(item);
      if (joins[i] === ";") parts.push({ items: [], joins: [] });
      else if (joins[i] !== undefined) part.joins.push(joins[i]);
    });
    const needed = parts.filter((part) => part.items.length > 0).map((part) => anyOfAll(part.items, part.joins));
    return needed.length === 1 ? needed[0] : { kind: "all", parts: needed };
  }

  // "and" binds tighter than "or": "A and B or C" is "(A and B) or C".
  function anyOfAll(items: Requirement[], joins: string[]): Requirement {
    const options: Requirement[][] = [[]];
    items.forEach((item, i) => {
      options[options.length - 1].push(item);
      if (joins[i] === "or") options.push([]);
    });
    const all = options.map((parts): Requirement => (parts.length === 1 ? parts[0] : { kind: "all", parts }));
    return all.length === 1 ? all[0] : { kind: "any", parts: all };
  }
  return group();
}

// Text that isn't a course, but also isn't another way to meet the rule
// ("A or permission of the instructor" still means take A).
const IGNORABLE = /permission|consent|approval|equivalent|^(either|both|the|of|a|an|with|in|any|one)$/i;

// Every course a rule names, whichever options they're in.
function namedCourses(rule: Requirement): string[] {
  if (rule.kind === "course") return [rule.id];
  if (rule.kind === "other") return [];
  return rule.parts.flatMap(namedCourses);
}

// How good an option is to pick. `prefer` lists sets of courses, most
// wanted first (e.g. the plans this course is on, then every plan): an
// option scores by the share of its courses in each, earlier sets
// counting more, then by how many are in the catalog at all. An option
// with no courses scores lowest.
function optionScore(rule: Requirement, catalog: Set<string>, prefer: Set<string>[]): number {
  const ids = namedCourses(rule);
  if (ids.length === 0) return -1;
  const share = (set: Set<string>) => ids.filter((id) => set.has(id)).length / ids.length;
  return [...prefer, catalog].reduce((score, set, i, sets) => score + share(set) * 2 ** (sets.length - i), 0);
}

// One way to meet a rule, as a plain list of courses: for each "one of",
// the option that scores best. If an option isn't a course (a placement
// exam, say), no course is needed, so the group adds nothing.
function chooseRequisites(rule: Requirement, catalog: Set<string>, prefer: Set<string>[]): string[] {
  switch (rule.kind) {
    case "course":
      return catalog.has(rule.id) ? [rule.id] : [];
    case "other":
      return [];
    case "all":
      return [...new Set(rule.parts.flatMap((part) => chooseRequisites(part, catalog, prefer)))];
    case "any": {
      const options = rule.parts.filter((part) => !(part.kind === "other" && IGNORABLE.test(part.words)));
      if (options.some((part) => part.kind === "other")) return [];
      const score = (part: Requirement) => optionScore(part, catalog, prefer);
      let best: Requirement | undefined;
      for (const part of options) if (best === undefined || score(part) > score(best)) best = part;
      return best ? chooseRequisites(best, catalog, prefer) : [];
    }
  }
}

// A rule as the engine's requisites: a list where every entry is needed.
// "All of" becomes several entries, and "one of" a choice ({ oneOf }),
// each option one course or several taken together, the best-scoring
// first (Build for me takes the first). A "one of" inside an option ("A
// and (B or C)", or "D") goes deeper than a choice can, so there the
// option uses its best-scoring way (chooseRequisites).
function requisiteItems(rule: Requirement, catalog: Set<string>, prefer: Set<string>[]): RequiredItem[] {
  switch (rule.kind) {
    case "course":
      return catalog.has(rule.id) ? [rule.id] : [];
    case "other":
      return [];
    case "all": {
      const items = rule.parts.flatMap((part) => requisiteItems(part, catalog, prefer));
      return [...new Map(items.map((item) => [requiredKey(item), item])).values()];
    }
    case "any": {
      const options = rule.parts.filter((part) => !(part.kind === "other" && IGNORABLE.test(part.words)));
      if (options.some((part) => part.kind === "other")) return [];
      const score = (part: Requirement) => optionScore(part, catalog, prefer);
      const lists = [...options]
        .sort((a, b) => score(b) - score(a))
        .map((part) => chooseRequisites(part, catalog, prefer))
        .filter((list) => list.length > 0);
      // The same option twice (two ways of writing it) counts once.
      const unique = [...new Map(lists.map((list) => [list.join(" "), list])).values()];
      if (unique.length <= 1) return unique[0] ?? [];
      return [{ oneOf: unique.map((list) => (list.length === 1 ? list[0] : list)) }];
    }
  }
}

// ---------------------------------------------------------------------------
// Course lists: one page per subject and level, e.g. .../undergraduate/cmpsc/
// ---------------------------------------------------------------------------

// One labeled part of a course's requisites, e.g. "Enforced Concurrent at
// Enrollment: MATH 140". `previous` parts must come in an earlier term;
// `concurrent` ones in the same term or earlier.
interface RequisitePart {
  kind: "previous" | "concurrent";
  rule: Requirement;
  // "C or better" in this part.
  minGrade?: Grade;
}

interface CourseDraft {
  course: Course;
  // Each entry is one requirement; usually one part, but parts joined by
  // "or" ("Prerequisite: MATH 110 or Concurrent: MATH 140") are
  // alternatives, of which one is needed.
  requisites: RequisitePart[][];
  crossListed: string[];
}

// The labels that start each part, like "Enforced Prerequisite at
// Enrollment:", "Prerequisite or Concurrent:", or "Concurrent Courses:".
const REQUISITE_LABEL =
  /((?:Enforced )?(?:Prerequisites?|Concurrent|Corequisites?)(?: Courses)?(?: or concurrent| at enrollment| for)*|Recommended Preparations?|Cross-listed with):/i;

const GRADE_CLAUSE = /((a |with a )?(minimum )?grade of )?\b([A-D][+-]?) or (better|higher)( in)?/gi;

function parseCourseList(html: string): CourseDraft[] {
  const drafts: CourseDraft[] = [];
  for (const block of html.split('<div class="courseblock">').slice(1)) {
    const heading = /<div class="course_codetitle">([^<]*)<\/div>/.exec(block);
    const creditsText = /<div class="course_credits">([^<]*)<\/div>/.exec(block);
    if (!heading || !creditsText) continue;
    const [, code, title] = /^(.+?):\s*(.*)$/.exec(text(heading[1])) ?? [];
    if (!code) continue;

    const description = text(/<div class="courseblockdesc">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "");
    const draft: CourseDraft = {
      course: {
        id: courseId(code),
        // "CAS 100A" → subject CAS, number 100, suffix A.
        code: parseCourseCode(courseId(code)),
        type: "course",
        title,
        ...parseCredits(text(creditsText[1])),
        ...(description ? { description } : {}),
      },
      requisites: [],
      crossListed: [],
    };
    for (const [, paragraph] of block.matchAll(/<p class="noindent">([\s\S]*?)<\/p>/g)) {
      // An attribute is a paragraph of its own ("General Education:
      // Humanities (GH)"); an Inter-Domain course has its two domains and
      // "General Education - Integrative: Interdomain". Kept in
      // attributes.json's order.
      const attribute = ATTRIBUTE_BY_LABEL.get(text(paragraph));
      if (attribute) {
        const own = new Set([...(draft.course.attributes ?? []), attribute]);
        draft.course.attributes = ATTRIBUTES.map((a) => a.id).filter((id) => own.has(id));
        continue;
      }
      // A paragraph can hold several labeled parts: "Enforced Prerequisite
      // at Enrollment: ... Concurrent Courses: ... Recommended Preparation:
      // ...". Only the first label is bold, so split on the labels' words.
      // split() with a capture group returns [before, label, body, label, body, ...].
      const pieces = paragraph.replace(/<\/?strong>/g, "").split(REQUISITE_LABEL);
      let joinedByOr = false;
      for (let i = 1; i < pieces.length; i += 2) {
        const [label, body] = [pieces[i], pieces[i + 1]];
        const endsInOr = /\bor\s*$/i.test(text(body));
        const clause = body.replace(/\b(or|and)\s*$/i, "");
        const kind = /recommended/i.test(label)
          ? undefined
          : // "Prerequisite or Concurrent" means same term or earlier, which
            // is what the engine calls concurrent.
            /concurrent|corequisite/i.test(label)
            ? "concurrent"
            : /prerequisite/i.test(label)
              ? "previous"
              : undefined;
        if (kind) {
          // "C or better" would otherwise read as an "or".
          const grade = [...clause.matchAll(GRADE_CLAUSE)][0]?.[4]?.toUpperCase() as Grade | undefined;
          const part: RequisitePart = { kind, rule: parseRequirement(clause.replace(GRADE_CLAUSE, " ")), minGrade: grade };
          if (joinedByOr && draft.requisites.length > 0) draft.requisites.at(-1)!.push(part);
          else draft.requisites.push([part]);
        } else if (/cross-listed/i.test(label)) {
          draft.crossListed.push(...namedCourses(parseRequirement(clause)));
        }
        joinedByOr = endsInOr && kind !== undefined;
      }
    }
    drafts.push(draft);
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Program pages
// ---------------------------------------------------------------------------

interface ProgramDraft {
  // Each University Park suggested plan, as its lines; each line is a
  // course with any "or" alternatives ("CMPSC 121 or 131" → [CMPSC121, CMPSC131]).
  plans: string[][][];
}

function parseProgram(html: string): ProgramDraft {
  // Suggested academic plans: each is a table after a heading like
  // "Computer Science, B.S. at University Park Campus".
  const plans: string[][][] = [];
  const parts = html.split(/(?=<table class="sc_plangrid">)/);
  for (let p = 1; p < parts.length; p++) {
    const headings = [...parts[p - 1].matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g)];
    if (!/University Park/i.test(text(headings.at(-1)?.[1] ?? ""))) continue;
    const table = parts[p].slice(0, parts[p].indexOf("</table>"));
    const cells = [...table.matchAll(/<td header="[^"]*_codecol"[^>]*>([\s\S]*?)<\/td>/g)];
    plans.push(cells.map(([, cell]) => linkedCourses(cell)).filter((line) => line.length > 0));
  }

  return { plans };
}

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

type Level = (typeof LEVELS)[number];

interface SubjectDraft {
  // The app's code ("EE") and the bulletin's ("E E").
  code: string;
  written: string;
  name: string;
  // Its course list's address under each level it's taught at ("cmpsc").
  pages: Partial<Record<Level, string>>;
}

// A level's subject list: "Accounting (ACCTG)" links, one per subject.
function parseSubjects(html: string, level: Level): { code: string; written: string; name: string; page: string }[] {
  const pattern = new RegExp(`<a href="/university-course-descriptions/${level}/([^"/]+)/">([^<]*)</a>`, "g");
  return [...html.matchAll(pattern)].flatMap(([, page, label]) => {
    const match = /^(.*) \(([^)]*)\)$/.exec(text(label));
    if (!match) return [];
    const written = match[2].replace(/\u200b/g, "");
    return [{ code: courseId(written), written, name: match[1].trim(), page }];
  });
}

async function build(): Promise<{ data: SchoolDataInput; subjects: SubjectDraft[] }> {
  const programs: ProgramDraft[] = [];
  for (const slug of PROGRAMS) {
    console.log(`program  ${slug}`);
    programs.push(parseProgram(await download(`${COLLEGES}/${slug}/`)));
  }

  // The courses on each suggested plan, and on any of them.
  const planSets = programs.flatMap((p) => p.plans.map((plan) => new Set(plan.flat())));
  const planCourses = new Set(planSets.flatMap((set) => [...set]));
  // Every subject, from both levels' lists (157 are in both).
  const byCode = new Map<string, SubjectDraft>();
  for (const level of LEVELS) {
    for (const { code, written, name, page } of parseSubjects(await download(`${COURSES}/${level}/`), level)) {
      const subject = byCode.get(code) ?? { code, written, name, pages: {} };
      subject.pages[level] = page;
      byCode.set(code, subject);
    }
  }
  const subjects = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  useSubjectCodes(subjects.map((s) => s.written));

  const drafts = new Map<string, CourseDraft>();
  for (const subject of subjects) {
    for (const level of LEVELS) {
      const page = subject.pages[level];
      if (!page) continue;
      console.log(`subject  ${subject.code} (${level})`);
      const html = await download(`${COURSES}/${level}/${page}/`);
      for (const draft of parseCourseList(html)) {
        // Only courses of this subject (a page could mention others).
        if (draft.course.code?.subject === subject.code && !drafts.has(draft.course.id)) drafts.set(draft.course.id, draft);
      }
    }
  }
  const catalog = new Set(drafts.keys());

  // Requisites, now that the whole catalog is known.
  const equivalents = new Map<string, Set<string>>();
  const addEquivalent = (a: string, b: string) => {
    if (a === b || !catalog.has(a) || !catalog.has(b)) return;
    if (equivalents.get(b)?.has(a)) return; // already linked the other way
    if (!equivalents.has(a)) equivalents.set(a, new Set());
    equivalents.get(a)!.add(b);
  };
  for (const draft of drafts.values()) {
    // Keyed by requiredKey, so the same requisite named twice is kept once.
    const previous = new Map<string, RequiredItem>();
    const concurrent = new Map<string, RequiredItem>();
    const minGrades: Record<string, Grade> = {};
    // Where there's a choice, prefer courses on the same plans as this
    // one ("MATH 230 or MATH 231": the plans with ME 320 use MATH 231),
    // then on any plan.
    const samePlans = new Set(planSets.filter((set) => set.has(draft.course.id)).flatMap((set) => [...set]));
    const prefer = [samePlans, planCourses];
    for (const alternatives of draft.requisites) {
      // Of parts joined by "or" ("Prerequisite: MATH 110 or Concurrent:
      // MATH 140"), use the one that scores best: a choice can't mix
      // "earlier" and "same term".
      const part = alternatives.reduce((best, next) =>
        optionScore(next.rule, catalog, prefer) > optionScore(best.rule, catalog, prefer) ? next : best,
      );
      for (const item of requisiteItems(part.rule, catalog, prefer)) {
        const ids = requiredIds([item]);
        if (ids.includes(draft.course.id)) continue;
        (part.kind === "previous" ? previous : concurrent).set(requiredKey(item), item);
        // "C or better" applies to whichever option is taken.
        if (part.minGrade && part.kind === "previous") for (const id of ids) minGrades[id] = part.minGrade;
      }
    }
    draft.course.requisites = {
      previous: [...previous.values()],
      concurrent: [...concurrent].filter(([key]) => !previous.has(key)).map(([, item]) => item),
      ...(Object.keys(minGrades).length > 0 ? { minGrades } : {}),
    };
    // A cross-listed course is the same class under two subjects.
    for (const other of draft.crossListed) addEquivalent(draft.course.id, other);
  }

  // In code order (CAS 100, CAS 100A, CAS 101, ... CMPSC 97, CMPSC 100),
  // so the file reads like a course list.
  const objects: Course[] = [...drafts.values()]
    .map(({ course }) => {
      const same = [...(equivalents.get(course.id) ?? [])];
      return same.length > 0 ? { ...course, internalEquivalents: same } : course;
    })
    .sort(compareByCode);

  const data: SchoolDataInput = {
    formatVersion: 1,
    school: { id: "penn-state", name: "Penn State University Park" },
    calendar: { start: { season: "fall", year: START_YEAR }, seasons: ["spring", "summer", "fall"] },
    objects,
    attributeGroups: ATTRIBUTE_GROUPS,
    attributes: ATTRIBUTES.map(({ label, ...attribute }) => attribute),
    // Only bachelor's degrees have school-wide rules so far.
    programRequirements: [
      {
        programType: "bachelors",
        // Senate Policy 82-00 and 83-80: at least 120 credits, 45 of them
        // gen ed (the rules below), and a 2.00 GPA; more than 19 credits
        // in a semester needs the dean's approval.
        minTotalCredits: 120,
        maxCreditsPerTerm: 19,
        minGpa: 2.0,
        allowDoubleCounting: true,
        allowedOverrides: ["waive-requirement", "waive-requisite", "substitute"],
        globalRequirements: [GEN_ED],
      },
    ],
    subjects: subjects.map(({ code, name }) => ({ code, name })),
    // Programs and their plans are made by hand.
    templates: [],
  };
  return { data, subjects };
}

const { data, subjects } = await build();

// Write the folder: the school's own settings, its attributes, its
// school-wide rules, the subject list, and one file per subject with its
// courses by number. A course's id and subject aren't repeated in its
// subject's file; they come from the file. structure.json and programs/
// are written by hand, so they're left as they are.
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
// The same object without its empty lists and empty objects.
function withoutEmpty<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => !(Array.isArray(v) ? v.length === 0 : typeof v === "object" && v !== null && Object.keys(v).length === 0)),
  ) as Partial<T>;
}
for (const old of ["objects", "courses", "requirements.json", join("requirements", "credentials")]) {
  await rm(join(OUT, old), { recursive: true, force: true });
}
await mkdir(join(OUT, "courses"), { recursive: true });
await mkdir(join(OUT, "requirements", "credentials"), { recursive: true });
const { objects, subjects: subjectList, templates, programRequirements, attributeGroups, attributes, ...school } = data;
await writeFile(join(OUT, "school.json"), json(school));
await writeFile(join(OUT, "attributes.json"), json({ groups: attributeGroups, attributes }));
for (const { programType, ...rules } of programRequirements ?? []) {
  await writeFile(join(OUT, "requirements", "credentials", `${programType}.json`), json(rules));
}
await writeFile(join(OUT, "subjects.json"), json({ subjects: subjectList }));
let written = 0;
for (const subject of subjects) {
  const own = objects.filter((o) => o.code?.subject === subject.code);
  if (own.length === 0) continue;
  const entries = own.map(({ id, code, type, title, credits, maxCredits, description, requisites, ...rest }) => ({
    number: code!.number,
    ...(code!.suffix ? { suffix: code!.suffix } : {}),
    // Every one is a course, which is what a course file assumes.
    title,
    credits: maxCredits === undefined ? credits : { min: credits, max: maxCredits },
    // Empty lists are left out; the format fills them in.
    ...withoutEmpty({ ...rest, requisites: withoutEmpty({ ...requisites }) }),
    ...(description ? { description } : {}),
  }));
  // Named like the bulletin's page for the subject ("cmpsc").
  const file = subject.pages.undergraduate ?? subject.pages.graduate!;
  await writeFile(join(OUT, "courses", `${file}.json`), json({ subject: subject.code, courses: entries }));
  written++;
}

// Read the folder back the way the app will, so a mistake shows up now.
const parsed = await readSchoolFolder(OUT);
if (!parsed.ok) throw new Error(`The folder doesn't pass the school format's checks:\n${parsed.errors.join("\n")}`);
console.log(`wrote ${OUT}: ${subjects.length} subjects, ${objects.length} courses in ${written} subject files`);

if (process.argv.includes("--save")) {
  process.loadEnvFile();
  const { requireDatabase } = await import("../src/server/db");
  const { schools } = requireDatabase();
  // The folder's programs, plus any made in the database that the folder
  // doesn't have (the same code and version: the folder's wins).
  const existing = await schools.get(parsed.data.school.id);
  const inFolder = new Set(parsed.data.templates.map((t) => `${t.code} ${t.version}`));
  const kept = (existing?.templates ?? []).filter((t) => !inFolder.has(`${t.code} ${t.version}`));
  const merged = parseSchoolData({ ...parsed.data, templates: [...parsed.data.templates, ...kept] });
  if (!merged.ok) throw new Error(`The saved programs don't fit the new courses:\n${merged.errors.join("\n")}`);
  const saved = await schools.save(merged.data);
  console.log(`saved ${saved.name} to the database with ${merged.data.templates.length} programs (${kept.length} kept from before)`);
  process.exit(0);
}
