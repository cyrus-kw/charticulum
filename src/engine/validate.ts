import { isOffered } from "./availability";
import { earliestSatisfyingTerm, placementTerms, satisfies } from "./catalog";
import { isBackedByExternal } from "./equivalents";
import { meetsGrade } from "./grades";
import { closestOption, describeRequired, isRequiredMet } from "./required";
import { EXTERNAL_TERM, type Catalog, type Chart, type ChartIssue } from "./types";

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

      // Pre-Credit is work already done elsewhere: it only has to be backed by
      // that work. Its requisites and availability here don't apply.
      if (term.index === EXTERNAL_TERM) {
        if (!isBackedByExternal(object, chart.completedExternal)) {
          issues.push({
            code: "UNBACKED_EXTERNAL_TERM",
            message: `${id} is in Pre-Credit but no completed external work counts as it.`,
            objectId: id,
            termIndex: term.index,
          });
        }
        continue;
      }

      if (!isOffered(object, term)) {
        issues.push({
          code: "NOT_OFFERED",
          message: `${id} is not offered in ${term.label}.`,
          objectId: id,
          termIndex: term.index,
        });
      }

      // Requisites: each must be met by the time this term starts (previous)
      // or by the end of it (concurrent). For a choice, one option is enough.
      const needs = [
        ...object.requisites.previous.map((item) => ({ item, concurrent: false })),
        ...object.requisites.concurrent.map((item) => ({ item, concurrent: true })),
      ];
      for (const { item, concurrent } of needs) {
        const doneIn = (req: string) => earliestSatisfyingTerm(catalog, placements, req);
        const inTime = (req: string) => {
          const at = doneIn(req);
          return at !== undefined && (concurrent ? at <= term.index : at < term.index);
        };
        if (isRequiredMet(item, inTime)) continue;
        // The one to name and waive: in the option the plan has the most
        // of, the first course that isn't there in time.
        const option = closestOption(item, (req) => doneIn(req) !== undefined);
        const requisiteId = option.find((req) => !inTime(req)) ?? option[0];
        const what = typeof item === "string" ? item : describeRequired(item);
        issues.push(
          concurrent
            ? {
                code: "CONCURRENT_REQUISITE_NOT_MET",
                message: `${id} needs ${what} in the same term or earlier.`,
                objectId: id,
                termIndex: term.index,
                requisiteId,
              }
            : {
                code: "PREVIOUS_REQUISITE_NOT_MET",
                message: `${id} needs ${what} completed in an earlier term.`,
                objectId: id,
                termIndex: term.index,
                requisiteId,
              },
        );
      }

      // An F is a problem on the course itself, like a grade under a
      // minimum: the course has to be taken again.
      if (chart.grades?.[id] === "F") {
        issues.push({
          code: "FAILING_GRADE",
          message: `${id} has an F and needs to be taken again.`,
          objectId: id,
          termIndex: term.index,
        });
      }

      // Minimum grades. An object that isn't graded yet is still planned,
      // so it passes for now; one passing grade among equivalents is enough.
      for (const [requisiteId, minimum] of Object.entries(object.requisites.minGrades ?? {})) {
        const satisfyingIds = [...placements.keys()].filter((placedId) =>
          satisfies(catalog, requisiteId, placedId),
        );
        if (satisfyingIds.length === 0) continue; // already reported above
        const passed = satisfyingIds.some((placedId) => {
          const grade = chart.grades?.[placedId];
          return grade === undefined || meetsGrade(grade, minimum);
        });
        if (!passed) {
          issues.push({
            code: "REQUISITE_GRADE_TOO_LOW",
            message: `${id} needs at least a ${minimum} in ${requisiteId}.`,
            objectId: id,
            termIndex: term.index,
            requisiteId,
          });
        }
      }
    }
  }

  return issues;
}
