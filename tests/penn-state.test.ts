// Checks the Penn State data that scripts/penn-state.ts builds from the
// bulletin, so a hand edit (or a change to the school format) that breaks
// it shows up here instead of on the Schools page.
import { describe, expect, it } from "vitest";
import { loadSchool } from "../src/engine/index";
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

  it("has no programs (they're made by hand)", async () => {
    expect((await loadPennState()).library).toEqual([]);
  });

  it("builds each course from its subject's file", async () => {
    const course = (await loadPennState()).catalog.get("CAS100A")!;
    expect(course.code).toEqual({ subject: "CAS", number: 100, suffix: "A" });
    expect(course.title).toBe("Effective Speech");
    expect(course.description).toMatch(/oral communication/);
  });

  it("reads prerequisites, including grades and same-term courses", async () => {
    const { catalog } = await loadPennState();
    // "(CMPSC 122 or CMPSC 132) and (CMPSC 360 or MATH 311W)": the options on the plans.
    expect(catalog.get("CMPSC465")!.requisites.previous).toEqual(["CMPSC122", "CMPSC360"]);
    // "Prerequisite: MATH 110 or Concurrent: MATH 140": MATH 140, same term or earlier.
    expect(catalog.get("CMPSC121")!.requisites).toMatchObject({ previous: [], concurrent: ["MATH140"] });
    // "C or better in PHYS 212".
    expect(catalog.get("EE210")!.requisites.minGrades).toEqual({ PHYS212: "C" });
  });
});
