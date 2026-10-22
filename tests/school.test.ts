import { describe, expect, it } from "vitest";
import {
  applyExternalEquivalents,
  checkChart,
  forkTemplate,
  latestTemplate,
  mergeCharts,
  resolveRequirements,
} from "../src/engine/index";
import { loadSchool, parseSchoolData, type SchoolData } from "../src/engine/school";
import { sampleSchoolData } from "../src/fixtures/sampleSchool";

function loadSample() {
  const result = parseSchoolData(sampleSchoolData);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return loadSchool(result.data);
}

describe("parseSchoolData", () => {
  it("accepts the sample school", () => {
    expect(parseSchoolData(sampleSchoolData)).toMatchObject({ ok: true });
  });

  it("survives a round trip through JSON", () => {
    expect(parseSchoolData(JSON.parse(JSON.stringify(sampleSchoolData))).ok).toBe(true);
  });

  it("fills in defaults for omitted fields", () => {
    const result = parseSchoolData({
      formatVersion: 1,
      school: { id: "s", name: "S" },
      calendar: { start: { season: "fall", year: 2026 }, seasons: ["fall"] },
      objects: [{ id: "A", type: "course", title: "A", credits: 3 }],
    });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.data.objects[0].requisites).toEqual({ previous: [], concurrent: [] });
    expect(result.data.templates).toEqual([]);
  });

  it("reports shape errors with their location", () => {
    const result = parseSchoolData({ ...sampleSchoolData, objects: [{ id: "A", type: "lecture" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith("objects.0.type"))).toBe(true);
  });

  it("reports references to unknown objects", () => {
    const broken = structuredClone(sampleSchoolData) as SchoolData;
    broken.objects[1].requisites.previous = ["NOPE101"];
    broken.equivalencyTable.push({ institution: "AP", externalId: "X", objectId: "GHOST" });
    const result = parseSchoolData(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("objects.CS102.requisites: unknown object NOPE101");
      expect(result.errors).toContain("equivalencyTable.3: unknown object GHOST");
    }
  });

  it("rejects badly formatted template versions", () => {
    const broken = structuredClone(sampleSchoolData) as SchoolData;
    broken.templates[0].version = "2026";
    expect(parseSchoolData(broken).ok).toBe(false);
  });

  it("rejects a program for a degree the school has no set for", () => {
    const broken = structuredClone(sampleSchoolData) as SchoolData;
    broken.templates[0].degree = "doctorate";
    const result = parseSchoolData(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("templates.bs-cs.degree: no programRequirements for doctorate");
  });

  it("names a credit rule after its area, but a list of areas needs a name", () => {
    const withRule = (rule: Record<string, unknown>) => {
      const school = structuredClone(sampleSchoolData) as SchoolData;
      school.programRequirements[0].globalRequirements = [{ category: "general-education", rules: [rule as never] }];
      return parseSchoolData(school).ok;
    };
    expect(withRule({ id: "Q", area: "Quantification", credits: 6 })).toBe(true);
    expect(withRule({ id: "KD", area: ["Arts", "Humanities"], credits: 6 })).toBe(false);
    expect(withRule({ id: "KD", name: "Knowledge domains", area: ["Arts", "Humanities"], credits: 6 })).toBe(true);
  });
});

describe("loadSchool", () => {
  const school = loadSample();

  it("folds the equivalency table into the catalog", () => {
    expect(school.catalog.get("CS101")?.externalEquivalents).toEqual([
      { institution: "AP", externalId: "CS-A" },
    ]);
  });

  it("publishes every template version", () => {
    expect(latestTemplate(school.library, "bs-cs")?.version).toBe("2026-27");
    expect(school.library).toHaveLength(3);
  });

  it("ships suggested plans that pass their own rules", () => {
    for (const template of school.library.filter((t) => t.code === "bs-cs")) {
      const fork = forkTemplate(template);
      const { requirements } = resolveRequirements(school.library, school.globalSets, fork);
      const result = checkChart(school.catalog, fork, requirements);
      expect(result.issues, `${template.code} ${template.version}`).toEqual([]);
    }
  });

  it("supports a major plus a minor with AP credit", () => {
    const major = forkTemplate(latestTemplate(school.library, "bs-cs")!);
    const minor = forkTemplate(latestTemplate(school.library, "minor-stats")!);
    const merged = {
      ...mergeCharts(major, minor),
      completedExternal: [{ institution: "AP", externalId: "STATS" }],
    };
    const chart = applyExternalEquivalents(school.catalog, merged);
    const { requirements } = resolveRequirements(school.library, school.globalSets, chart);
    const result = checkChart(school.catalog, chart, requirements);
    expect(result.issues).toEqual([]);
    expect(chart.terms[0].objectIds).toEqual(["STAT200"]);
  });
});

describe("a program's categories", () => {
  it("become its rules: required courses, credit rule groups, and its total credits", () => {
    const data = structuredClone(sampleSchoolData) as SchoolData;
    const program = data.templates.find((t) => t.code === "bs-cs" && t.version === "2026-27")!;
    program.minTotalCredits = 50;
    program.localRequirements.push({
      category: "elective",
      rules: [{ id: "upper-cs", name: "Upper-level CS", credits: 3, subjects: ["CS"], minNumber: 300 }],
    });
    const result = parseSchoolData(data);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const school = loadSchool(result.data);
    const fork = forkTemplate(latestTemplate(school.library, "bs-cs")!);
    const { requirements } = resolveRequirements(school.library, school.globalSets, fork);
    expect(requirements.minTotalCredits).toBe(50);
    expect(requirements.requiredObjectIds).toContain("CS390");
    expect(requirements.creditRules).toEqual([
      { category: "elective", name: "Electives", rules: [{ id: "upper-cs", name: "Upper-level CS", credits: 3, subjects: ["CS"], minNumber: 300 }] },
    ]);
  });
});

describe("old field names", () => {
  it("reads an object's old kind field as its type", () => {
    const objects = sampleSchoolData.objects.map(({ type, ...rest }) => ({ ...rest, kind: type }));
    const result = parseSchoolData({ ...sampleSchoolData, objects });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.data.objects.find((o) => o.id === "SPAN-PROF")?.type).toBe("proficiency");
  });
});
