import type { Catalog, Chart, CourseObject } from "./types";

// Build a Catalog from a list of objects. Throws if two share an id,
// because every later lookup assumes ids are unique.
export function createCatalog(objects: CourseObject[]): Catalog {
  const catalog: Catalog = new Map();
  for (const object of objects) {
    if (catalog.has(object.id)) {
      throw new Error(`Duplicate object id in catalog: ${object.id}`);
    }
    catalog.set(object.id, object);
  }
  return catalog;
}

// Does placing `candidateId` satisfy a need for `requiredId`?
// True if it is the same object, or either one lists the other as an
// internal equivalent (equivalence works in both directions).
export function satisfies(
  catalog: Catalog,
  requiredId: string,
  candidateId: string,
): boolean {
  if (requiredId === candidateId) return true;
  const required = catalog.get(requiredId);
  const candidate = catalog.get(candidateId);
  return (
    (required?.internalEquivalents.includes(candidateId) ?? false) ||
    (candidate?.internalEquivalents.includes(requiredId) ?? false)
  );
}

// Map each placed object id to the index of the term it sits in.
// If an object appears twice, the earliest term wins.
export function placementTerms(chart: Chart): Map<string, number> {
  const placements = new Map<string, number>();
  for (const term of chart.terms) {
    for (const id of term.objectIds) {
      const existing = placements.get(id);
      if (existing === undefined || term.index < existing) {
        placements.set(id, term.index);
      }
    }
  }
  return placements;
}

// The earliest term where something satisfying `requiredId` is placed,
// or undefined if nothing placed satisfies it.
export function earliestSatisfyingTerm(
  catalog: Catalog,
  placements: Map<string, number>,
  requiredId: string,
): number | undefined {
  let earliest: number | undefined;
  for (const [placedId, termIndex] of placements) {
    if (!satisfies(catalog, requiredId, placedId)) continue;
    if (earliest === undefined || termIndex < earliest) earliest = termIndex;
  }
  return earliest;
}
