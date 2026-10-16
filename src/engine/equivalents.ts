import type { Catalog, CompletedExternal, CourseObject } from "./types.js";

// Is this object backed by something the student completed elsewhere?
export function isBackedByExternal(
  object: CourseObject,
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
// These are what go in Term 0.
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
