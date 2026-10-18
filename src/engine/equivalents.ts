import {
  EXTERNAL_TERM,
  EXTERNAL_TERM_LABEL,
  type Catalog,
  type Chart,
  type CompletedExternal,
  type CurriculumObject,
} from "./types";

// Is this object backed by something the student completed elsewhere?
export function isBackedByExternal(
  object: CurriculumObject,
  completedExternal: CompletedExternal[],
): boolean {
  return object.externalEquivalents.some((equivalent) =>
    completedExternal.some(
      (done) =>
        done.institution === equivalent.institution &&
        done.externalId === equivalent.externalId,
    ),
  );
}

// Every catalog object the student's external work counts as.
// These are what go in Pre-Credit.
export function externalPlacements(
  catalog: Catalog,
  completedExternal: CompletedExternal[],
): string[] {
  const ids: string[] = [];
  for (const object of catalog.values()) {
    if (isBackedByExternal(object, completedExternal)) ids.push(object.id);
  }
  return ids;
}

// Return a copy of the chart with Pre-Credit filled from the student's
// completed external work. Anything Pre-Credit now covers is removed from
// later terms, since the student doesn't need to take it again.
// The original chart is left unchanged.
export function applyExternalEquivalents(catalog: Catalog, chart: Chart): Chart {
  const termZeroIds = externalPlacements(catalog, chart.completedExternal);
  const covered = new Set(termZeroIds);

  const laterTerms = chart.terms
    .filter((term) => term.index !== EXTERNAL_TERM)
    .map((term) => ({
      ...term,
      objectIds: term.objectIds.filter((id) => !covered.has(id)),
    }));

  // Always the current label, even for charts saved with an older one.
  const termZero = {
    index: EXTERNAL_TERM,
    label: EXTERNAL_TERM_LABEL,
    objectIds: termZeroIds,
  };

  return { ...chart, terms: [termZero, ...laterTerms] };
}
