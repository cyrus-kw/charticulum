import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/catalog";
import { checkChart } from "../src/engine/check";
import { evaluateRequirements } from "../src/engine/requirements";
import { mergeRequirementSets } from "../src/engine/scopes";
import {
  findTemplate,
  forkTemplate,
  latestTemplate,
  mergeCharts,
  publishTemplate,
  resolveRequirements,
  type TemplateLibrary,
} from "../src/engine/templates";
import type { ChartTemplate, RequirementSet } from "../src/engine/types";
import { chartOf, obj, requirements } from "./helpers";

const catalog = createCatalog([
  obj("CS101", { categories: ["major"] }),
  obj("CS102", { previous: ["CS101"], categories: ["major"] }),
  obj("CS250", { previous: ["CS101"], categories: ["major"] }),
  obj("STAT200", { categories: ["major", "minor"] }),
  obj("STAT300", { previous: ["STAT200"], categories: ["minor"] }),
  obj("ENG101", { categories: ["general-education"] }),
]);

const globalSets: RequirementSet[] = [
  { id: "bachelor", name: "bachelor", scope: "global", programType: "bachelor", requiredObjectIds: ["ENG101"] },
  { id: "associate", name: "associate", scope: "global", programType: "associate", requiredObjectIds: ["NEVER"] },
];

const term = (index: number, objectIds: string[]) => ({ index, label: `Term ${index}`, objectIds });

const cs2026: ChartTemplate = {
  code: "bs-cs",
  version: "2026-27",
  title: "B.S. Computer Science",
  programType: "bachelor",
  requirementSets: [
    { id: "cs", name: "CS major", scope: "local", requiredObjectIds: ["CS102", "STAT200"] },
  ],
  terms: [term(0, []), term(1, ["CS101", "ENG101"]), term(2, ["CS102", "STAT200"])],
};

// The 2027 version adds a requirement. Charts pinned to 2026 shouldn't see it.
const cs2027: ChartTemplate = {
  ...cs2026,
  version: "2027-28",
  requirementSets: [
    { id: "cs", name: "CS major", scope: "local", requiredObjectIds: ["CS102", "CS250", "STAT200"] },
  ],
};

const statsMinor: ChartTemplate = {
  code: "minor-stats",
  version: "2026-27",
  title: "Statistics minor",
  programType: "bachelor",
  requirementSets: [
    {
      id: "stats",
      name: "Stats minor",
      scope: "local",
      requiredObjectIds: ["STAT200", "STAT300"],
      maxSharedCredits: 3,
    },
  ],
  terms: [term(0, []), term(1, ["STAT200"]), term(2, ["STAT300"])],
};

let library: TemplateLibrary = [];
library = publishTemplate(library, cs2026);
library = publishTemplate(library, cs2027);
library = publishTemplate(library, statsMinor);

describe("template library", () => {
  it("refuses to republish an existing version", () => {
    expect(() => publishTemplate(library, cs2026)).toThrow(/already published/);
  });

  it("finds exact versions and the latest one", () => {
    expect(findTemplate(library, { templateId: "bs-cs", version: "2026-27" })).toBe(cs2026);
    expect(latestTemplate(library, "bs-cs")).toBe(cs2027);
  });
});

describe("forkTemplate", () => {
  it("copies the plan and pins the version", () => {
    const fork = forkTemplate(cs2026, "Sam's plan");
    expect(fork.pinnedTemplates).toEqual([{ templateId: "bs-cs", version: "2026-27" }]);
    fork.terms[1].objectIds.push("CS250");
    expect(cs2026.terms[1].objectIds).toEqual(["CS101", "ENG101"]);
  });

  it("keeps its pinned version's rules when a newer version exists", () => {
    const fork = forkTemplate(cs2026);
    const { requirements: reqs, issues } = resolveRequirements(library, globalSets, fork);
    expect(issues).toEqual([]);
    expect(reqs.requiredObjectIds.sort()).toEqual(["CS102", "ENG101", "STAT200"]);
    expect(checkChart(catalog, fork, reqs).valid).toBe(true);
  });

  it("reports pinned templates missing from the library", () => {
    const chart = chartOf([[]], { pinnedTemplates: [{ templateId: "gone", version: "1999-00" }] });
    expect(resolveRequirements(library, [], chart).issues.map((i) => i.code)).toEqual([
      "TEMPLATE_NOT_FOUND",
    ]);
  });
});

describe("mergeCharts", () => {
  const major = forkTemplate(cs2026);
  const minor = forkTemplate(statsMinor);
  const merged = mergeCharts(major, minor);

  it("joins terms and keeps the first chart's placement of shared objects", () => {
    expect(merged.terms.map((t) => t.objectIds)).toEqual([
      [],
      ["CS101", "ENG101"],
      ["CS102", "STAT200", "STAT300"],
    ]);
  });

  it("pins both templates", () => {
    expect(merged.pinnedTemplates?.map((r) => r.templateId)).toEqual(["bs-cs", "minor-stats"]);
  });

  it("checks against the combined rules and catches merge conflicts", () => {
    const { requirements: reqs } = resolveRequirements(library, globalSets, merged);
    expect(reqs.requiredObjectIds.sort()).toEqual(["CS102", "ENG101", "STAT200", "STAT300"]);

    // The major put STAT200 in Term 2, the same term the minor put STAT300,
    // which needs STAT200 first. The check reports it...
    const before = checkChart(catalog, merged, reqs);
    expect(before.issues.map((i) => [i.code, i.objectId])).toEqual([
      ["PREVIOUS_REQUISITE_NOT_MET", "STAT300"],
    ]);

    // ...and once the student moves STAT300 to Term 3, the chart passes.
    const fixed = {
      ...merged,
      terms: [
        ...merged.terms.map((t) => ({ ...t, objectIds: t.objectIds.filter((id) => id !== "STAT300") })),
        term(3, ["STAT300"]),
      ],
    };
    const after = checkChart(catalog, fixed, reqs);
    expect(after.valid).toBe(true);
    // STAT200 counts for both the major and the minor.
    expect(after.report.sharedCredits).toBe(3);
  });

  it("merges grades, external work, and overrides without duplicates", () => {
    const a = chartOf([[]], {
      grades: { CS101: "A" },
      completedExternal: [{ institution: "AP", externalId: "X" }],
      overrides: [{ id: "o1", kind: "waive-requirement", objectId: "CS250", reason: "" }],
    });
    const b = chartOf([[]], {
      grades: { CS101: "B", STAT200: "A" },
      completedExternal: [{ institution: "AP", externalId: "X" }],
      overrides: [{ id: "o1", kind: "waive-requirement", objectId: "CS250", reason: "" }],
    });
    const combined = mergeCharts(a, b);
    expect(combined.grades).toEqual({ CS101: "A", STAT200: "A" });
    expect(combined.completedExternal).toHaveLength(1);
    expect(combined.overrides).toHaveLength(1);
  });
});

describe("shared credit limit", () => {
  it("flags too many credits shared across categories", () => {
    const chart = chartOf([[], ["STAT200"]]);
    const report = evaluateRequirements(catalog, chart, requirements({ maxSharedCredits: 0 }));
    expect(report.issues.map((i) => i.code)).toEqual(["SHARED_CREDITS_OVER_LIMIT"]);
  });

  it("keeps the lower limit when merging sets", () => {
    const merged = mergeRequirementSets([
      { id: "a", name: "a", scope: "local", maxSharedCredits: 6 },
      { id: "b", name: "b", scope: "local", maxSharedCredits: 3 },
    ]);
    expect(merged.maxSharedCredits).toBe(3);
  });
});
