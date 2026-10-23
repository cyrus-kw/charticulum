// Checks the Penn State data that scripts/penn-state.ts builds from the
// bulletin, so a hand edit (or a change to the school format) that breaks
// it shows up here instead of on the Schools page.
import { describe, expect, it } from "vitest";
import { checkChart, forkTemplate, latestTemplate, loadSchool, resolveRequirements } from "../src/engine/index";
import { readSchoolFolder } from "../src/server/schoolFolder";

async function loadPennState() {
  const result = await readSchoolFolder("schools/penn-state");
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return loadSchool(result.data);
}

describe("schools/penn-state", () => {
  it("passes the school format's checks, with every subject", async () => {
    const { data } = await loadPennState();
    expect(data.subjects.find((s) => s.code === "CMPSC")?.name).toBe("Computer Science");
    expect(data.subjects.length).toBeGreaterThan(250);
  });

  it("has the Computer Science B.S., whose plan only misses what the student picks", async () => {
    const school = await loadPennState();
    const program = latestTemplate(school.library, "CMPSC_BS")!;
    expect(program.version).toBe("2026-27");
    const chart = forkTemplate(program);
    const { requirements } = resolveRequirements(school.library, school.globalSets, chart);
    const { issues } = checkChart(school.catalog, chart, requirements);
    // Every required course is on the suggested plan.
    expect(issues.filter((i) => i.code === "MISSING_REQUIRED_OBJECT")).toEqual([]);
    // CMPSC 483W's bulletin entry still asks for CMPSC 311, which the
    // program replaced with CMPSC 315 and 316.
    expect(issues.filter((i) => i.objectId).map((i) => `${i.code} ${i.objectId}`)).toEqual([
      "PREVIOUS_REQUISITE_NOT_MET CMPSC483W",
    ]);
    // Left to the student: electives and gen eds.
    expect(issues.filter((i) => i.code === "CREDIT_RULE_SHORTFALL").length).toBeGreaterThan(0);
  });

  it("builds each course from its subject's file", async () => {
    const course = (await loadPennState()).catalog.get("CAS100A")!;
    expect(course.code).toEqual({ subject: "CAS", number: 100, suffix: "A" });
    expect(course.title).toBe("Effective Speech");
    expect(course.description).toMatch(/oral communication/);
  });

  it("has graduate courses, in the same subject files as undergraduate ones", async () => {
    const { catalog, data } = await loadPennState();
    expect(catalog.get("CMPSC121")).toBeDefined();
    // Graduate computer science is its own subject, CSE.
    expect(catalog.get("CSE565")!.title).toBe("Algorithm Design and Analysis");
    expect(data.structure?.levels.map((l) => l.id)).toEqual(["undergraduate", "graduate", "medicine", "law"]);
    // "1-9 Credits/Maximum of 9".
    expect(catalog.get("CMPSC598")).toMatchObject({ credits: 1, maxCredits: 9, repeatable: { maxCredits: 9 } });
    // Graduate pages write requisites as plain text: "CMPEN362 ; E E 353 or E E 350".
    expect(catalog.get("CSE514")!.requisites.previous).toEqual(["CMPEN362", { oneOf: ["EE353", "EE350"] }]);
  });

  it("reads every attribute, with gen ed ones as the course's areas", async () => {
    const { catalog } = await loadPennState();
    // Effective Speech: Writing and Speaking, and United States Cultures.
    const speech = catalog.get("CAS100A")!;
    expect(speech.attributes).toEqual(expect.arrayContaining(["GWS"]));
    expect(speech.genEdAreas).toEqual(["Writing and Speaking"]);
    expect(speech.categories).toContain("general-education");
    expect(catalog.get("CMPSC483W")!.attributes).toContain("W");
  });

  it("reads prerequisites, including grades and same-term courses", async () => {
    const { catalog } = await loadPennState();
    // "(CMPSC 122 or CMPSC 132) and (CMPSC 360 or MATH 311W)": two choices,
    // the options on the plans first.
    expect(catalog.get("CMPSC465")!.requisites.previous).toEqual([
      { oneOf: ["CMPSC122", "CMPSC132"] },
      { oneOf: ["CMPSC360", "MATH311W"] },
    ]);
    // "Prerequisite: MATH 110 or Concurrent: MATH 140": MATH 140, same term or earlier.
    expect(catalog.get("CMPSC121")!.requisites).toMatchObject({ previous: [], concurrent: ["MATH140"] });
    // "C or better in PHYS 212".
    expect(catalog.get("EE210")!.requisites.minGrades).toEqual({ PHYS212: "C" });
  });
});
