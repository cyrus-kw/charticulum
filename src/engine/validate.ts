import { earliestSatisfyingTerm, placementTerms } from "./catalog.js";
import { isBackedByExternal } from "./equivalents.js";
import { EXTERNAL_TERM, type Catalog, type Chart, type ChartIssue } from "./types.js";

// Check a chart against the object-attribute rules and return every
// problem found. An empty list means the placements are consistent.
// (Whether the chart meets graduation requirements is checked
// separately, in requirements.ts.)
export function validateChart(catalog: Catalog, chart: Chart): ChartIssue[] {
  const issues: ChartIssue[] = [];
  const placements = placementTerms(chart);
  const seen = new Set<string>();

  for (const term of chart.terms) {
    for (const id of term.objectIds) {
      const object = catalog.get(id);
      if (!object) {
        issues.push({
          code: "UNKNOWN_OBJECT",
          message: `${id} is not in the catalog.`,
          objectId: id,
          termIndex: term.index,
        });
        continue;
      }

      if (seen.has(id)) {
        issues.push({
          code: "DUPLICATE_PLACEMENT",
          message: `${id} is placed more than once.`,
          objectId: id,
          termIndex: term.index,
        });
        continue;
      }
      seen.add(id);

      if (
        term.index === EXTERNAL_TERM &&
        !isBackedByExternal(object, chart.completedExternal)
      ) {
        issues.push({
          code: "UNBACKED_EXTERNAL_TERM",
          message: `${id} is in Term 0 but no completed external work counts as it.`,
          objectId: id,
          termIndex: term.index,
        });
      }

      for (const requisiteId of object.requisites.previous) {
        const doneIn = earliestSatisfyingTerm(catalog, placements, requisiteId);
        if (doneIn === undefined || doneIn >= term.index) {
          issues.push({
            code: "PREVIOUS_REQUISITE_NOT_MET",
            message: `${id} needs ${requisiteId} completed in an earlier term.`,
            objectId: id,
            termIndex: term.index,
          });
        }
      }

      for (const requisiteId of object.requisites.concurrent) {
        const doneIn = earliestSatisfyingTerm(catalog, placements, requisiteId);
        if (doneIn === undefined || doneIn > term.index) {
          issues.push({
            code: "CONCURRENT_REQUISITE_NOT_MET",
            message: `${id} needs ${requisiteId} in the same term or earlier.`,
            objectId: id,
            termIndex: term.index,
          });
        }
      }
    }
  }

  return issues;
}
