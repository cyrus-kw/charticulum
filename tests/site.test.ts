import { describe, expect, it } from "vitest";
import { parseSchoolData } from "../src/engine/index";
import { sampleSchool } from "../src/fixtures/sampleSchool";
import { memoryChartRepository } from "../src/server/chartRepository";
import { memorySchoolRepository, withSampleSchool } from "../src/server/schoolRepository";
import { addTransferTable, createChart, dashboardData, importSchool, objectDescription, openChart } from "../src/server/site";

const repositories = () => ({
  charts: memoryChartRepository(),
  schools: withSampleSchool(memorySchoolRepository()),
});

const sample = sampleSchool();
const sampleId = sample.school.id;
const firstProgram = sample.templates[0];

describe("withSampleSchool", () => {
  it("always has the sample school, until a saved copy replaces it", async () => {
    const schools = withSampleSchool(memorySchoolRepository());
    expect((await schools.list()).map((s) => s.id)).toEqual([sampleId]);
    expect((await schools.get(sampleId))?.school.name).toBe(sample.school.name);

    const renamed = { ...sample, school: { ...sample.school, name: "Renamed State" } };
    await schools.save(renamed);
    expect((await schools.list()).map((s) => s.name)).toEqual(["Renamed State"]);
    expect((await schools.get(sampleId))?.school.name).toBe("Renamed State");
  });
});

describe("createChart and openChart", () => {
  it("starts a chart from a program, pinned to its version", async () => {
    const repos = repositories();
    const id = await createChart(repos, "me", {
      schoolId: sampleId,
      templateId: firstProgram.code,
      version: firstProgram.version,
    });
    const opened = await openChart(repos, "me", id);
    expect(opened?.saved.chart.name).toBe(`${firstProgram.title} (my plan)`);
    expect(opened?.saved.chart.pinnedTemplates).toEqual([{ templateId: firstProgram.code, version: firstProgram.version }]);
    expect(opened?.school.school.id).toBe(sampleId);
  });

  it("starts an empty plan when no program is chosen", async () => {
    const repos = repositories();
    const id = await createChart(repos, "me", { schoolId: sampleId });
    const opened = await openChart(repos, "me", id);
    expect(opened?.saved.chart.name).toBe("My plan");
    expect(opened?.saved.chart.terms.flatMap((t) => t.objectIds)).toEqual([]);
  });

  it("refuses an unknown school, and hides other people's charts", async () => {
    const repos = repositories();
    await expect(createChart(repos, "me", { schoolId: "nowhere" })).rejects.toThrow(/No school/);
    const id = await createChart(repos, "me", { schoolId: sampleId });
    expect(await openChart(repos, "someone else", id)).toBeNull();
  });
});

describe("dashboardData", () => {
  it("lists your charts with their school's name, and each school's programs", async () => {
    const repos = repositories();
    await createChart(repos, "me", { schoolId: sampleId });
    await createChart(repos, "someone else", { schoolId: sampleId });
    const { charts, schools } = await dashboardData(repos, "me");
    expect(charts.map((c) => c.schoolName)).toEqual([sample.school.name]);
    expect(schools[0].programs.length).toBe(sample.templates.length);
  });
});

describe("importSchool", () => {
  it("saves valid data and explains problems", async () => {
    const repos = repositories();
    const other = { ...sample, school: { id: "other-u", name: "Other University" } };
    const ok = await importSchool(repos, JSON.stringify(other));
    expect(ok).toMatchObject({ ok: true, school: { id: "other-u" } });
    expect((await repos.schools.list()).map((s) => s.id)).toContain("other-u");

    expect(await importSchool(repos, "{nope")).toEqual({ ok: false, errors: ["That file is not valid JSON."] });
    const bad = await importSchool(repos, JSON.stringify({ school: { id: "x" } }));
    expect(bad.ok).toBe(false);
  });
});

describe("addTransferTable", () => {
  it("adds new rows to the school, and rejects rows for courses it doesn't have", async () => {
    const repos = repositories();
    const before = sample.equivalencyTable.length;
    const ok = await addTransferTable(repos, sampleId, "institution,externalId,objectId\nAP,NEW-1,CS101\n");
    expect(ok).toEqual({ ok: true, added: 1 });
    expect((await repos.schools.get(sampleId))?.equivalencyTable.length).toBe(before + 1);

    const bad = await addTransferTable(repos, sampleId, "institution,externalId,objectId\nAP,X,NOPE999\n");
    expect(bad.ok).toBe(false);
  });
});

describe("course descriptions", () => {
  // The sample school with a description on one course.
  async function withDescription() {
    const repos = repositories();
    const objects = sample.objects.map((o) => (o.id === "CS101" ? { ...o, description: "Variables, loops, and functions." } : o));
    await repos.schools.save({ ...sample, objects });
    return repos;
  }

  it("leaves them out of a chart's school, to keep the page small", async () => {
    const repos = await withDescription();
    const id = await createChart(repos, "me", { schoolId: sampleId });
    const opened = await openChart(repos, "me", id);
    expect(opened?.school.objects.some((o) => "description" in o)).toBe(false);
    // Compacted, it still parses back to the same school (minus the description).
    const back = parseSchoolData(opened!.school);
    expect(back.ok && back.data).toEqual(sample);
  });

  it("gives one when asked for, or null", async () => {
    const repos = await withDescription();
    expect(await objectDescription(repos, sampleId, "CS101")).toBe("Variables, loops, and functions.");
    expect(await objectDescription(repos, sampleId, "CS102")).toBeNull();
    expect(await objectDescription(repos, "no-such-school", "CS101")).toBeNull();
  });
});
