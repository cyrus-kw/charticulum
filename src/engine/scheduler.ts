import { isOffered, slotLabel, termCalendar, type CalendarSlot } from "./availability.js";
import { earliestSatisfyingTerm } from "./catalog.js";
import { externalPlacements } from "./equivalents.js";
import {
  EXTERNAL_TERM,
  type Catalog,
  type Chart,
  type ChartIssue,
  type CompletedExternal,
  type Requirements,
  type Season,
} from "./types.js";

export interface BuildOptions {
  name?: string;
  completedExternal?: CompletedExternal[];
  // Safety cap so a bad catalog can't make the loop run forever.
  maxTerms?: number;
  // When given, terms get seasons and years, and availability is respected.
  calendar?: { start: CalendarSlot; seasons: Season[] };
}

export interface BuildResult {
  chart: Chart;
  issues: ChartIssue[];
}

// Build a chart that places every required object (and everything those
// objects need) into terms, respecting requisites and the credit limit.
export function buildChart(
  catalog: Catalog,
  requirements: Requirements,
  options: BuildOptions = {},
): BuildResult {
  const { name = "Generated chart", completedExternal = [], maxTerms = 16, calendar } = options;
  const slots = calendar ? termCalendar(calendar.start, calendar.seasons, maxTerms) : [];
  const issues: ChartIssue[] = [];

  // Term 0: credit the student already has from elsewhere.
  const termZeroIds = externalPlacements(catalog, completedExternal);
  const placements = new Map<string, number>(
    termZeroIds.map((id) => [id, EXTERNAL_TERM]),
  );
  const isDone = (id: string) => earliestSatisfyingTerm(catalog, placements, id) !== undefined;

  // 1. Collect the required objects and, recursively, their requisites.
  const needed = new Set<string>();
  const stack = [...requirements.requiredObjectIds];
  while (stack.length > 0) {
    const id = stack.pop()!; // "!" tells TypeScript pop() can't be undefined here
    if (needed.has(id) || isDone(id)) continue;
    const object = catalog.get(id);
    if (!object) {
      issues.push({ code: "UNKNOWN_OBJECT", message: `${id} is not in the catalog.`, objectId: id });
      continue;
    }
    needed.add(id);
    stack.push(...object.requisites.previous, ...object.requisites.concurrent);
  }

  // 2. Report prerequisite cycles (A needs B needs A); they can never be scheduled.
  for (const cycle of findPreviousCycles(catalog, needed)) {
    issues.push({
      code: "REQUISITE_CYCLE",
      message: `Requisite cycle: ${cycle.join(" -> ")}.`,
      objectId: cycle[0],
    });
  }

  // 3. Objects too big for any single term.
  for (const id of needed) {
    const credits = catalog.get(id)!.credits;
    if (credits > requirements.maxCreditsPerTerm) {
      issues.push({
        code: "OBJECT_EXCEEDS_TERM_LIMIT",
        message: `${id} has ${credits} credits, more than the ${requirements.maxCreditsPerTerm}-credit term limit.`,
        objectId: id,
      });
      needed.delete(id);
    }
  }

  // 4. Priority: objects that start long chains go first, then by id so the
  //    output is the same every run.
  const height = chainHeights(catalog, needed);
  const remaining = [...needed].sort(
    (a, b) => height.get(b)! - height.get(a)! || a.localeCompare(b),
  );

  // 5. Fill terms one at a time.
  const terms: Chart["terms"] = [
    { index: EXTERNAL_TERM, label: "Term 0 (External)", objectIds: termZeroIds },
  ];
  // An empty term only means "stuck" once a full two-year cycle of seasons
  // has passed with nothing placed (an object may be offered only in odd
  // years). Without a calendar, a single empty term means stuck.
  const giveUpAfter = calendar ? calendar.seasons.length * 2 : 1;
  let emptyInARow = 0;

  for (let index = 1; index <= maxTerms && remaining.length > 0; index++) {
    const slot: CalendarSlot | undefined = slots[index - 1];
    const objectIds: string[] = [];
    let credits = 0;

    // Keep passing over the list until nothing else fits. A second pass
    // matters for concurrent requisites: placing B can let A join the same term.
    let progress = true;
    while (progress) {
      progress = false;
      for (const id of [...remaining]) {
        const object = catalog.get(id)!;
        if (credits + object.credits > requirements.maxCreditsPerTerm) continue;
        if (slot && !isOffered(object, slot)) continue;

        const previousMet = object.requisites.previous.every((req) => {
          const doneIn = earliestSatisfyingTerm(catalog, placements, req);
          return doneIn !== undefined && doneIn < index;
        });
        const concurrentMet = object.requisites.concurrent.every((req) => {
          const doneIn = earliestSatisfyingTerm(catalog, placements, req);
          return doneIn !== undefined && doneIn <= index;
        });
        if (!previousMet || !concurrentMet) continue;

        objectIds.push(id);
        credits += object.credits;
        placements.set(id, index);
        remaining.splice(remaining.indexOf(id), 1);
        progress = true;
      }
    }

    terms.push(
      slot
        ? { index, label: slotLabel(slot), objectIds, season: slot.season, year: slot.year }
        : { index, label: `Term ${index}`, objectIds },
    );

    emptyInARow = objectIds.length === 0 ? emptyInARow + 1 : 0;
    if (emptyInARow >= giveUpAfter) break;
  }

  // Drop empty terms from the end; empty ones in the middle stay so the
  // calendar has no gaps.
  while (terms.length > 1 && terms[terms.length - 1].objectIds.length === 0) terms.pop();

  for (const id of remaining) {
    issues.push({
      code: "UNSCHEDULABLE",
      message: `${id} could not be placed; its requisites can't be met.`,
      objectId: id,
    });
  }

  return { chart: { name, terms, completedExternal }, issues };
}

// Find cycles among `previous` requisites using depth-first search.
// Each returned cycle lists its ids in order, e.g. ["A", "B", "A"].
function findPreviousCycles(catalog: Catalog, ids: Set<string>): string[][] {
  const cycles: string[][] = [];
  const finished = new Set<string>();
  const path: string[] = [];

  function visit(id: string) {
    if (finished.has(id)) return;
    const loopStart = path.indexOf(id);
    if (loopStart !== -1) {
      cycles.push([...path.slice(loopStart), id]);
      return;
    }
    path.push(id);
    for (const req of catalog.get(id)?.requisites.previous ?? []) {
      if (ids.has(req)) visit(req);
    }
    path.pop();
    finished.add(id);
  }

  for (const id of ids) visit(id);
  return cycles;
}

// For each object, the length of the longest chain of objects that
// (directly or indirectly) need it as a `previous` requisite.
function chainHeights(catalog: Catalog, ids: Set<string>): Map<string, number> {
  const dependents = new Map<string, string[]>();
  for (const id of ids) {
    for (const req of catalog.get(id)!.requisites.previous) {
      if (!dependents.has(req)) dependents.set(req, []);
      dependents.get(req)!.push(id);
    }
  }

  const heights = new Map<string, number>();
  const visiting = new Set<string>(); // guards against cycles
  function height(id: string): number {
    if (heights.has(id)) return heights.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const below = (dependents.get(id) ?? []).map(height);
    const result = below.length === 0 ? 0 : 1 + Math.max(...below);
    visiting.delete(id);
    heights.set(id, result);
    return result;
  }

  for (const id of ids) height(id);
  return heights;
}
