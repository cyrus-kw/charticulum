**Charticulum**(Chart Your Curriculum)<br />
_The Visual Academic Planner_

## Chart engine (MVP)

The chart engine is the logic behind Charticulum: it checks a student's
term-by-term plan (a *chart*) and can build one automatically. It has no UI
yet; the visualizer will sit on top of it.

### Running it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install        # download dependencies into node_modules/
npm test           # run the test suite once
npm run test:watch # rerun tests whenever a file changes
npm run typecheck  # check TypeScript types without running anything
npm run demo       # build and check charts for the sample curriculum
```

### What it does

| Piece | File | What it does |
|---|---|---|
| Types | `src/engine/types.ts` | Objects, charts, terms, requirements, issues |
| Catalog | `src/engine/catalog.ts` | Looks objects up; handles internal equivalents |
| Validation | `src/engine/validate.ts` | Unknown and duplicate objects, previous and concurrent requisites, unbacked Term 0 entries |
| Requirements | `src/engine/requirements.ts` | Credits per term and in total, category minimums, required objects, double-counting policy |
| Term 0 | `src/engine/equivalents.ts` | Places credit earned elsewhere (AP, transfer) in Term 0 |
| Check | `src/engine/check.ts` | Runs validation and requirements together |
| Builder | `src/engine/scheduler.ts` | Schedules required objects into terms; reports cycles and anything it can't place |
| Text output | `src/engine/format.ts` | Prints a chart as text |

Import everything from `src/engine/index.ts`. A fictional sample curriculum
lives in `src/fixtures/sampleCurriculum.ts`.

### Not in the MVP yet

- Global and local r-o-s scopes, overrides, and school policy
- Forking and merging charts; yearly versioning
- Grades, and availability (which terms an object is offered)
- Saving data (database) and the visual chart
