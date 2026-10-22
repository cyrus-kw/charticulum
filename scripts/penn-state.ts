// Builds Penn State's school data (subjects, courses, and school-wide
// rules) from its public Undergraduate Bulletin, bulletins.psu.edu, and
// writes it as a folder of JSON files (the layout is described in
// src/engine/schoolFiles.ts):
//
//   schools/penn-state/school.json         id, name, calendar, school-wide rules
//   schools/penn-state/subjects.json       every subject: code and name
//   schools/penn-state/objects/cmpsc.json  one subject's courses, by number
//   schools/penn-state/programs/*.json     programs, written by hand (left alone here)
//
//   npx tsx scripts/penn-state.ts          # writes the folder
//   npx tsx scripts/penn-state.ts --save   # also saves it to the database in .env,
//                                          # with the folder's programs and the
//                                          # ones already saved there
//
// What it reads:
// - The subject list (.../university-course-descriptions/undergraduate/),
//   then each subject's course list: each course's title, description,
//   credits, prerequisites, and gen ed area.
// - The program pages in PROGRAMS, only as hints: which courses their
//   suggested plans use (to put the likeliest option of an "A or B"
//   first). It doesn't write any programs; those are made by hand, in
//   programs/, with their own "A or B" lines as choices.
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
const COURSES = `${BULLETIN}/university-course-descriptions/undergraduate`;
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

// What an Inter-Domain course lists among its gen ed areas, besides its
// two domains.
const INTER_DOMAIN = "Inter-Domain";

// The baccalaureate degree's 45 gen ed credits, for every program
// (bulletins.psu.edu/undergraduate/general-education/baccalaureate-degree-general-education-program/):
// Foundations 15, Knowledge Domains 15, Integrative Studies 6, and
// Exploration 9. A course counts toward one of them only, the first in
// this order that still needs it, so the narrow rules come first.
const DOMAINS = ["Arts", "Humanities", "Natural Sciences", "Social and Behavioral Sciences"];
const GEN_ED = {
  category: "general-education",
  eachCourseOnce: true,
  rules: [
    // Foundations: C or better, and not Inter-Domain courses.
    { id: "WS", area: "Writing and Speaking", credits: 9, minGrade: "C" as Grade, notArea: INTER_DOMAIN },
    { id: "Q", area: "Quantification", credits: 6, minGrade: "C" as Grade, notArea: INTER_DOMAIN },
    // Knowledge Domains: not Inter-Domain courses.
    { id: "HW", area: "Health and Wellness", credits: 3, notArea: INTER_DOMAIN },
    { id: "N", area: "Natural Sciences", credits: 3, notArea: INTER_DOMAIN },
    { id: "A", area: "Arts", credits: 3, notArea: INTER_DOMAIN },
    { id: "H", area: "Humanities", credits: 3, notArea: INTER_DOMAIN },
    { id: "S", area: "Social and Behavioral Sciences", credits: 3, notArea: INTER_DOMAIN },
    // Integrative Studies.
    { id: "INT", name: "Integrative Studies", area: INTER_DOMAIN, credits: 6 },
    // Exploration: Natural Sciences (may be Inter-Domain), then any domain
    // or Inter-Domain.
    { id: "EXN", name: "Exploration: Natural Sciences", area: "Natural Sciences", credits: 3 },
    { id: "EX", name: "Exploration", area: [...DOMAINS, INTER_DOMAIN], credits: 6 },
  ],
};

// Penn State's gen ed areas, by their code.
const GEN_ED_AREAS: Record<string, string> = {
  GWS: "Writing and Speaking",
  GQ: "Quantification",
  GA: "Arts",
  GH: "Humanities",
  GS: "Social and Behavioral Sciences",
  GN: "Natural Sciences",
  GHW: "Health and Wellness",
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

// The first number in a credits text: "3 Credits" → 3, "2-3" → 2, "1.5" → 1.5.
function firstNumber(value: string): number {
  const match = /\d+(\.\d+)?/.exec(value);
  return match ? Number(match[0]) : 0;
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
  const marked = html.replace(/<a [^>]*showCourse\(this, '([^']+)'\)[^>]*>.*?<\/a>/g, (_, code: string) => ` §${courseId(code)}§ `);
  const tokens = text(marked).match(/§[^§]+§|\(|\)|,|;|[^\s(),;§]+/g) ?? [];
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
    // "A, B, or C": a comma means whichever join comes after it.
    for (let i = joins.length - 1, next = "and"; i >= 0; i--) {
      if (joins[i] === "," || joins[i] === ";") joins[i] = joins[i] === ";" ? "and" : next;
      else next = joins[i];
    }
    // "and" binds tighter than "or": "A and B or C" is "(A and B) or C".
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
// Course lists: one page per subject, e.g. .../undergraduate/cmpsc/
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
        credits: firstNumber(text(creditsText[1])),
        categories: [],
        ...(description ? { description } : {}),
      },
      requisites: [],
      crossListed: [],
    };
    for (const [, paragraph] of block.matchAll(/<p class="noindent">([\s\S]*?)<\/p>/g)) {
      // "General Education: Humanities (GH)", one paragraph per area; an
      // Inter-Domain course has two, and "General Education - Integrative:
      // Interdomain".
      const genEd = /^General Education: .*\((G[A-Z]+)\)/.exec(text(paragraph));
      const interDomain = /^General Education\s*-\s*Integrative:\s*Interdomain/i.test(text(paragraph));
      if (genEd || interDomain) {
        if (!draft.course.categories!.includes("general-education")) draft.course.categories!.push("general-education");
        const area = genEd ? (GEN_ED_AREAS[genEd[1]] ?? genEd[1]) : INTER_DOMAIN;
        const areas = (draft.course.genEdAreas ??= []);
        // Domains first and "Inter-Domain" last, whatever order the page
        // lists them in, so a card shows a domain's letter.
        if (!areas.includes(area)) {
          const before = areas.indexOf(INTER_DOMAIN);
          if (area === INTER_DOMAIN || before === -1) areas.push(area);
          else areas.splice(before, 0, area);
        }
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
          draft.crossListed.push(...linkedCourses(clause));
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

// The subject list: "Accounting (ACCTG)" links, one per subject.
function parseSubjects(html: string): { code: string; name: string; page: string }[] {
  const subjects = new Map<string, { code: string; name: string; page: string }>();
  for (const [, slug, label] of html.matchAll(/<a href="\/university-course-descriptions\/undergraduate\/([^"/]+)\/">([^<]*)<\/a>/g)) {
    const match = /^(.*) \(([^)]*)\)$/.exec(text(label));
    if (!match) continue;
    const code = courseId(match[2]);
    subjects.set(code, { code, name: match[1].trim(), page: slug });
  }
  return [...subjects.values()].sort((a, b) => a.code.localeCompare(b.code));
}

async function build(): Promise<{ data: SchoolDataInput; subjects: ReturnType<typeof parseSubjects> }> {
  const programs: ProgramDraft[] = [];
  for (const slug of PROGRAMS) {
    console.log(`program  ${slug}`);
    programs.push(parseProgram(await download(`${COLLEGES}/${slug}/`)));
  }

  // The courses on each suggested plan, and on any of them.
  const planSets = programs.flatMap((p) => p.plans.map((plan) => new Set(plan.flat())));
  const planCourses = new Set(planSets.flatMap((set) => [...set]));
  const subjects = parseSubjects(await download(`${COURSES}/`));
  const drafts = new Map<string, CourseDraft>();
  for (const subject of subjects) {
    console.log(`subject  ${subject.code}`);
    const html = await download(`${COURSES}/${subject.page}/`);
    for (const draft of parseCourseList(html)) {
      // Only courses of this subject (a page could mention others).
      if (draft.course.code?.subject === subject.code && !drafts.has(draft.course.id)) drafts.set(draft.course.id, draft);
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
    programRequirements: [
      {
        degree: "baccalaureate",
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
      // Not filled in yet: no associate or graduate programs so far.
      { degree: "associate" },
      { degree: "graduate" },
    ],
    subjects: subjects.map(({ code, name }) => ({ code, name })),
    // Programs and their plans are made by hand.
    templates: [],
  };
  return { data, subjects };
}

const { data, subjects } = await build();

// Write the folder: the school's own settings, the subject list, and one
// file per subject with its courses by number. An object's id and subject
// aren't repeated in its subject's file; they come from the file.
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
// The same object without its empty lists and empty objects.
function withoutEmpty<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => !(Array.isArray(v) ? v.length === 0 : typeof v === "object" && v !== null && Object.keys(v).length === 0)),
  ) as Partial<T>;
}
await rm(join(OUT, "objects"), { recursive: true, force: true });
await mkdir(join(OUT, "objects"), { recursive: true });
const { objects, subjects: subjectList, templates, ...school } = data;
await writeFile(join(OUT, "school.json"), json(school));
await writeFile(join(OUT, "subjects.json"), json({ subjects: subjectList }));
let written = 0;
for (const subject of subjects) {
  const own = objects.filter((o) => o.code?.subject === subject.code);
  if (own.length === 0) continue;
  const entries = own.map(({ id, code, type, title, credits, description, requisites, ...rest }) => ({
    number: code!.number,
    ...(code!.suffix ? { suffix: code!.suffix } : {}),
    type,
    title,
    credits,
    // Empty lists are left out; the format fills them in.
    ...withoutEmpty({ ...rest, requisites: withoutEmpty({ ...requisites }) }),
    ...(description ? { description } : {}),
  }));
  await writeFile(join(OUT, "objects", `${subject.page}.json`), json({ subject: subject.code, objects: entries }));
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
