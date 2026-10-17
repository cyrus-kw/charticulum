import { describe, expect, it } from "vitest";
import {
  applyExternalEquivalents,
  buildChart,
  checkChart,
  formatChart,
} from "../src/engine/index";
import {
  sampleCalendar,
  sampleCatalog,
  sampleDraftChart,
  sampleRequirements,
} from "../src/fixtures/sampleCurriculum";

describe("sample curriculum", () => {
  const completedExternal = [{ institution: "AP", externalId: "CALC-AB" }];

  it("builds a chart that meets every requirement", () => {
    const { chart, issues } = buildChart(sampleCatalog, sampleRequirements, {
      completedExternal,
      calendar: sampleCalendar,
    });
    expect(issues).toEqual([]);
    expect(checkChart(sampleCatalog, chart, sampleRequirements).valid).toBe(true);
  });

  it("finds the mistakes in the draft chart", () => {
    const draft = applyExternalEquivalents(sampleCatalog, sampleDraftChart);
    const codes = checkChart(sampleCatalog, draft, sampleRequirements).issues.map((i) => i.code);
    expect(codes).toContain("PREVIOUS_REQUISITE_NOT_MET");
    expect(codes).toContain("MISSING_REQUIRED_OBJECT");
  });
});

describe("formatChart", () => {
  it("lists each term, its objects, and any issues", () => {
    const draft = applyExternalEquivalents(sampleCatalog, sampleDraftChart);
    const text = formatChart(
      sampleCatalog,
      draft,
      checkChart(sampleCatalog, draft, sampleRequirements),
    );
    expect(text).toContain("Pre-Credit");
    expect(text).toMatch(/CS101\s+Intro to Programming\s+4/);
    expect(text).toContain("[PREVIOUS_REQUISITE_NOT_MET]");
  });

  it("marks empty terms and unknown objects", () => {
    const text = formatChart(sampleCatalog, {
      name: "odd chart",
      completedExternal: [],
      terms: [
        { index: 0, label: "Pre-Credit", objectIds: [] },
        { index: 1, label: "Term 1", objectIds: ["GHOST"] },
      ],
    });
    expect(text).toContain("(empty)");
    expect(text).toContain("(not in catalog)");
  });
});
