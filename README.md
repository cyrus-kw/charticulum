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

Without a database, plans are saved in your browser. To save them to a
database instead, see [Database](#database).

## How it's organized

| Folder | What's there |
|---|---|
| `src/engine/` | The chart engine: pure TypeScript with no UI, fully tested |
| `src/planner/` | App state (a reducer) and flowchart layout, also pure and tested |
| `src/components/` | React components: the flowchart and the side panels |
| `src/app/` | Next.js pages and API routes |
| `src/server/` | Saving charts to the database |
| `src/storage/` | Where the browser saves (database or this browser) |
| `src/fixtures/` | The fictional sample school |
| `prisma/` | Database schema and migrations |
| `tests/` | Vitest tests |

### Engine pieces

| File | Does |
|---|---|
| `types.ts` | Objects, charts, terms, requirements, overrides, templates, issues |
| `validate.ts` | Requisites (previous/concurrent/minimum grade), availability, Pre-Credit |
| `requirements.ts` | Credits per term and category, required objects, GPA, shared credits |
| `scopes.ts` | Combines global and local requirement sets; the stricter rule wins |
| `overrides.ts` | Applies waivers and substitutions, with grade conditions and policy |
| `templates.ts` | Versioned templates, forking, merging charts |
| `scheduler.ts` | Builds a plan respecting requisites, credit limits, and availability |
| `availability.ts` | Seasons, odd/even years, term calendars |
| `school.ts` | The SchoolData JSON format: schema, validation, loading |
| `equivalencyCsv.ts` | Transfer/AP tables from CSV |

## School data format

A school is one JSON document: catalog objects, global requirement sets,
versioned program templates, a term calendar, and an equivalency table. See
`public/samples/example-state-university.json` (regenerate it with
`npm run sample:json`). Imports are checked for shape and for references to
objects that don't exist, with errors pointing at the exact field.

## Database

Saving uses Postgres through [Prisma](https://www.prisma.io). The app checks
`DATABASE_URL` when it starts: if it's set, plans save to the database; if
not, they save in the browser.

**Locally** (no Docker needed):

```bash
npm run db:local                            # starts a local Postgres; copy the postgres:// URL it prints
echo 'DATABASE_URL="postgres://..."' > .env # .env is git-ignored
npm run db:migrate                          # create the tables
npm run dev
```

To run the database tests too: `TEST_DATABASE_URL="postgres://..." npm test`.

**On Vercel**: add a Postgres database from the Vercel dashboard (Storage tab),
which sets `DATABASE_URL` for you. Then create the tables once with
`DATABASE_URL="<that url>" npm run db:deploy`.
