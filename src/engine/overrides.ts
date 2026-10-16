import { meetsGrade } from "./grades.js";
import type {
  Catalog,
  ChartIssue,
  CourseObject,
  Grade,
  Override,
  Requirements,
} from "./types.js";

export interface OverrideResult {
  // Adjusted copies; the originals passed in are not changed.
  catalog: Catalog;
  requirements: Requirements;
  applied: Override[];
  issues: ChartIssue[];
}

// Apply overrides by producing adjusted copies of the catalog and the
// requirements. The regular checks then run on those copies.
export function applyOverrides(
  catalog: Catalog,
  requirements: Requirements,
  overrides: Override[],
  grades: Record<string, Grade> = {},
): OverrideResult {
  const adjusted: Catalog = new Map(catalog);
  let requiredObjectIds = [...requirements.requiredObjectIds];
  const applied: Override[] = [];
  const issues: ChartIssue[] = [];

  // Copy an object before changing it, so the original catalog is untouched.
  const editable = (id: string): CourseObject => {
    const original = adjusted.get(id)!;
    const copy: CourseObject = {
      ...original,
      internalEquivalents: [...original.internalEquivalents],
      requisites: {
        previous: [...original.requisites.previous],
        concurrent: [...original.requisites.concurrent],
        ...(original.requisites.minGrades && { minGrades: { ...original.requisites.minGrades } }),
      },
    };
    adjusted.set(id, copy);
    return copy;
  };

  for (const override of overrides) {
    if (requirements.allowedOverrides && !requirements.allowedOverrides.includes(override.kind)) {
      issues.push({
        code: "OVERRIDE_NOT_ALLOWED",
        message: `Override ${override.id} (${override.kind}) is not allowed by school policy.`,
        objectId: override.objectId,
      });
      continue;
    }

    const mentioned = [override.objectId];
    if (override.kind === "waive-requisite") mentioned.push(override.requisiteId);
    if (override.kind === "substitute") mentioned.push(override.substituteId);
    const unknown = mentioned.find((id) => !catalog.has(id));
    if (unknown) {
      issues.push({
        code: "OVERRIDE_UNKNOWN_OBJECT",
        message: `Override ${override.id} refers to ${unknown}, which is not in the catalog.`,
        objectId: unknown,
      });
      continue;
    }

    if (override.condition) {
      const { objectId, minGrade } = override.condition;
      const grade = grades[objectId];
      if (grade === undefined || !meetsGrade(grade, minGrade)) {
        issues.push({
          code: "OVERRIDE_CONDITION_NOT_MET",
          message: `Override ${override.id} needs at least a ${minGrade} in ${objectId}${grade ? `; the grade is ${grade}` : ", which isn't graded yet"}.`,
          objectId,
        });
        continue;
      }
    }

    switch (override.kind) {
      case "waive-requirement":
        requiredObjectIds = requiredObjectIds.filter((id) => id !== override.objectId);
        break;
      case "waive-requisite": {
        const requisites = editable(override.objectId).requisites;
        requisites.previous = requisites.previous.filter((id) => id !== override.requisiteId);
        requisites.concurrent = requisites.concurrent.filter((id) => id !== override.requisiteId);
        delete requisites.minGrades?.[override.requisiteId];
        break;
      }
      case "substitute":
        // Treated as an internal equivalent, so it works everywhere the
        // object is needed (requirements and requisites alike).
        editable(override.objectId).internalEquivalents.push(override.substituteId);
        break;
    }
    applied.push(override);
  }

  return {
    catalog: adjusted,
    requirements: { ...requirements, requiredObjectIds },
    applied,
    issues,
  };
}
