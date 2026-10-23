**Charticulum**(Chart Your Curriculum)<br />
_The Visual Academic Planner_

Plan a degree term by term and see how it all fits together. Courses are
cards in term columns, requisites are arrows, and every rule the school sets
is checked as you edit, with one-click fixes where there's an obvious one.

## Running it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install        # download dependencies (also generates the database client)
npm run dev        # start the app at http://localhost:3000
npm test           # run the test suite
npm run typecheck  # check TypeScript types
npm run build      # production build (what Vercel runs)
npm run demo       # terminal-only demo of the chart engine
```

The app needs a database to save plans and schools; see [Database](#database).

## How it's organized

| Folder | What's there |
|---|---|
| `src/engine/` | The chart engine: pure TypeScript with no UI, fully tested |
| `src/planner/` | App state (a reducer) and flowchart layout, also pure and tested |
| `src/components/` | React components: the flowchart, the panel above it, and the side panel (sections in `panels/`), and the site pages' forms (`site/`) |
| `src/app/` | Next.js pages (home with sign-in, dashboard, schools, chart, privacy, terms), server actions (Settings' in `settings/`), and API routes |
| `src/server/` | Saving charts and schools to the database, accounts and sign-in, and what each page does with them |
| `src/storage/` | How the planner in the browser saves through the API |
| `src/fixtures/` | The fictional sample school |
| `prisma/` | Database schema and migrations |
| `tests/` | Vitest tests (`*.db.test.ts` need a real database) |
| `scripts/` | The terminal demo, a headless-browser screenshot tool, a script that signs it in, and the Penn State data builder |
| `schools/` | Real schools' data, as folders of JSON files (`penn-state/`) |

### Engine pieces

| File | Does |
|---|---|
| `index.ts` | The engine's public API; code outside the engine imports only from here |
| `types.ts` | Curriculum objects, charts, terms, requirements, overrides, templates, issues |
| `check.ts` | `checkChart`: applies exceptions, then checks placement, then requirements |
| `catalog.ts` | Builds the catalog (objects by id) and checks whether a requisite is met |
| `codes.ts` | Course codes (subject, number, letter): reading, writing, and sorting them |
| `validate.ts` | Requisites (previous/concurrent/minimum grade; a requisite can be a choice), availability, Pre-Credit |
| `requirements.ts` | Credits per term and category, required objects, GPA, shared credits |
| `required.ts` | Required objects, requisites, and choices ("MATH 230, or MATH 231 & 232"): options, met or not, what's still needed |
| `scopes.ts` | Combines global and local requirement sets; the stricter rule wins |
| `overrides.ts` | Applies waivers and substitutions, with grade conditions and policy |
| `templates.ts` | Versioned templates, forking, merging charts |
| `scheduler.ts` | Builds a plan respecting requisites, credit limits, and availability |
| `availability.ts` | Seasons, odd/even years, term calendars |
| `school.ts` | The SchoolData JSON format: schema, validation, loading |
| `schoolFiles.ts` | A school split into files (school, subjects, one file per subject): checking and combining them |
| `equivalents.ts` | Turns completed AP/transfer credit into Pre-Credit objects |
| `grades.ts` | Letter-grade points, minimum grades, GPA |
| `equivalencyCsv.ts` | Transfer/AP tables from CSV |
| `format.ts` | A chart as plain text (for the terminal demo) |

## School data format

A school is one JSON document: catalog objects, global requirement sets,
versioned program templates, a term calendar, and an equivalency table.
A numbered course's code is kept in its parts, `"code": { "subject":
"CAS", "number": 100, "suffix": "A" }`, and its id is them run together
(`CAS100A`); files may leave the code out, and it's read from the id. See
the built-in sample school, `src/fixtures/sampleSchool.ts`. Imports are checked for shape and for references to
objects that don't exist, with errors pointing at the exact field.
Objects may have a `description`, and a school may list its `subjects`
(code and name); when it does, every course's subject must be one of them.

A school can also be split into a folder of files
(`src/engine/schoolFiles.ts`), which `combineSchoolFiles` puts back
together, with errors naming the file:

```
school.json          id, name, calendar (and an AP/transfer table)
structure.json       levels (with their course numbers), credentials, divisions (optional)
attributes.json      { "groups": [...], "attributes": [...] }: course labels (optional)
subjects.json        { "subjects": [{ "code": "CMPSC", "name": "Computer Science" }] }
courses/cmpsc.json   { "subject": "CMPSC", "courses": [{ "number": 121, "title": ..., "credits": 3 }] }
requirements/credentials/bachelors.json
                     the rules every program of one credential follows (optional)
programs/bachelors/cmpsc-bs.json
                     program templates (optional), one folder per credential
```

A subject's file only gives each course's number and letter; its id
(`CMPSC121`) and code come from the file's subject. A course's `type`
can be left out when it's a course, and its credits can be a range
(`{ "min": 1, "max": 9 }`, which becomes `credits` and `maxCredits`);
`repeatable` (`{ "maxCredits": 9 }`) says it can be taken again.

`structure.json` says how the school is organized: its `levels`
(undergraduate, graduate; each with its course `numbers`, as `[lowest,
highest]` ranges, and then every course has to fit one), its
`credentials` (associate, bachelor's, master's; each at a level), and
its `divisions` (colleges, schools, or faculties, of the `divisionTypes`
it names, with their `departments`). A program's `programType` is a
credential, and it can name its `division`. Without the file, the
program types are the folders' names.

`attributes.json` lists the labels courses carry (`"attributes": ["GH",
"US"]` on a course), each `{ "id": "GH", "name": "Humanities", "group":
"gen-ed" }`, in families (`groups`). A group with a `category`
(`"general-education"`) makes its attributes that category's areas: a
course with one counts toward the category, and their names are its
`genEdAreas` (in the file's order). Credit rules can ask for attributes
(below).

`schools/penn-state/` is a real school in that layout: all of Penn State's
undergraduate and graduate subjects (370) and courses (about 14,700:
9,500 undergraduate and 5,100 graduate, with descriptions), every
attribute the bulletin lists (gen ed, Bachelor of Arts, US/IL,
First-Year Seminar, Writing Across the Curriculum, Honors), and its
bachelor's degree rules (120 credits, 2.00 GPA, and the 45-credit
General Education program), built from its
[bulletins](https://bulletins.psu.edu) by `scripts/penn-state.ts`. A
subject's undergraduate and graduate courses share one file
(`courses/cmpsc.json` has CMPSC 121 and CMPSC 598); their numbers say
their level. `structure.json` and the programs are written by hand
(the script leaves them alone): so far the Computer Science B.S., in
`programs/bachelors/`. `--save` also saves it to the database, with the
folder's programs and any others already saved there.

A program (a template in `programs/<its programType>/`; one in the wrong
folder is an error) has the school's `code` for it
(Penn State's plan code, `"CMPSC_BS"`; charts pin it with its version),
a `title` ("Computer Science, B.S."), its `programType`, the credits the
whole program needs (`minTotalCredits`), its requirements by category,
and a suggested plan. `localRequirements` lists the categories, e.g.
`{ "category": "major", "requiredObjectIds": [...], "minGrades": {...} }`
and `{ "category": "elective", "rules": [...] }`; a category's `rules`
are its credit rules, shown in Requirements under a heading named after
the category ("Electives", "Seminars"; `categoryHeading`). A requirement set has three parts: required objects
(`requiredObjectIds`), each an id or a choice, `{ "oneOf": ["MATH230",
"MATH230H", ["MATH231", "MATH232"]] }` (any one option; a list is an
option of courses taken together); credit rules (`creditRules`), in
groups (`{ "category", "name", "rules": [...] }`: General
Education, Electives, Seminars), each rule "at least N credits from
courses that match", by attribute (`attributes`: any of them counts),
gen ed area (`area`: one, or a list of which any counts), subject,
course number (`minNumber`, `maxNumber`), or a list, optionally with a
minimum grade (`{ "id": "Q", "name": "Quantification", "attributes":
["GQ"], "credits": 6, "minGrade": "C" }`; 18 credits from the electives
list). A rule's `name` labels its meter; a rule with one area can leave
it out and is named after the area; `notAttributes` and `notArea` leave
courses out ("Inter-Domain courses may not be used"). A group with
`"eachCourseOnce": true` counts each course toward one of its rules
only, the first in order that still needs it. A group whose category is
one of the app's (`general-education`) counts that category's credit
minimum in its heading when a set gives one, otherwise its rules added
up. Rules shared by every program (Penn State's gen ed) go in the
school's global set (`programRequirements`, at most one per program type,
each one of the school's `programs`, e.g. `["associate", "bachelors", "masters"]`:
`{ "programType": "bachelors", "minTotalCredits": 120, ..., "globalRequirements":
[{ "category": "general-education", "eachCourseOnce": true, "rules": [...] }] }`,
its categories listed like a program's; in a folder, it's
`requirements/credentials/bachelors.json`, without the programType; a
program names its type, `"programType": "bachelors"`, and its charts
get that set only), programs' own in theirs; and minimum grades in
required courses (`minGrades`, e.g. `{ "CMPSC221": "C" }`; one on a
course of a choice applies to all its options).

Descriptions aren't sent with the planner page (thousands would make it
megabytes); the page gets the school compacted, and Selected fetches a
course's description from `/api/schools/<school>/objects/<id>`. The
database keeps them in their own table (`ObjectDescription`), one row
per course, so each is found straight away.

## Database

Saving uses Postgres through [Prisma](https://www.prisma.io), at the address
in `DATABASE_URL`. Charts and imported schools are stored there; the sample
school is built in, so an empty database still has one school.

**Locally** (no Docker needed):

```bash
npm run db:local                            # starts a local Postgres; copy the postgres:// URL it prints
echo 'DATABASE_URL="postgres://..."' > .env # .env is git-ignored
npm run db:migrate                          # create the tables
npm run dev
```

To run the database tests too: `TEST_DATABASE_URL="postgres://..." npm test`.

If `npm run db:migrate` fails with "relation already exists" (the local
database copies itself for a scratch check), write the migration with
`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql`
and apply it with `npm run db:deploy`.

**Accounts**: sign in on the home page with a 6-digit code sent by email
(no passwords). Without an email service set up (`npm run dev`), the
email is printed in the terminal running the app, so copy the code from
there. Charts are private to each account;
schools are shared. Put `ADMIN_EMAILS="you@example.com"` in `.env` to make your account
an admin (admins import and change schools).

**On Vercel**: add a Postgres database from the Vercel dashboard (Storage tab),
which sets `DATABASE_URL` for you. Then create the tables once with
`DATABASE_URL="<that url>" npm run db:deploy` (and again whenever a new
migration is added). For sign-in emails, make a free Resend account
(resend.com), verify a domain you own there, and set `RESEND_API_KEY` and
`EMAIL_FROM` (e.g. `Charticulum <codes@your-domain>`) in the Vercel
project's environment variables. Without them, the live site can't send
codes.
