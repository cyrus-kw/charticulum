import { describe, expect, it } from "vitest";
import { combineSchoolFiles, type SchoolFiles } from "../src/engine/index";

// A tiny school split into files, for each test to change one part of.
function files(): SchoolFiles {
  return {
    school: {
      name: "school.json",
      json: {
        formatVersion: 1,
        school: { id: "tiny", name: "Tiny College" },
        calendar: { start: { season: "fall", year: 2026 }, seasons: ["fall", "spring"] },
      },
    },
    subjects: {
      name: "subjects.json",
      json: { subjects: [{ code: "CAS", name: "Communication Arts and Sciences" }, { code: "A-I", name: "Artificial Intelligence" }] },
    },
    objects: [
      {
        name: "objects/cas.json",
        json: {
          subject: "CAS",
          objects: [
            { number: 100, suffix: "A", type: "course", title: "Effective Speech", credits: 3, description: "Public speaking." },
            { number: 200, type: "course", title: "Rhetoric", credits: 3, requisites: { previous: ["CAS100A"] } },
          ],
        },
      },
      { name: "objects/a-i.json", json: { subject: "A-I", objects: [{ number: 100, type: "course", title: "Automated Thinking", credits: 3 }] } },
    ],
  };
}

describe("combineSchoolFiles", () => {
  it("builds each object's id and code from its subject's file", () => {
    const result = combineSchoolFiles(files());
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const [speech, rhetoric, ai] = result.data.objects;
    expect(speech).toMatchObject({
      id: "CAS100A",
      code: { subject: "CAS", number: 100, suffix: "A" },
      type: "course",
      description: "Public speaking.",
    });
    expect(rhetoric.requisites.previous).toEqual(["CAS100A"]);
    expect(ai.id).toBe("A-I100");
    expect(result.data.subjects).toHaveLength(2);
  });

  it("needs each file's subject to be in subjects.json", () => {
    const parts = files();
    parts.objects.push({ name: "objects/math.json", json: { subject: "MATH", objects: [{ number: 140, type: "course", title: "Calculus", credits: 4 }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(["objects/math.json: objects.MATH140.code: unknown subject MATH"]);
  });

  it("names the file a mistake is in", () => {
    const parts = files();
    parts.objects.push({ name: "objects/cas-2.json", json: { subject: "CAS", objects: [{ number: 200, type: "course", title: "Again", credits: "three" }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^objects\/cas-2\.json: objects\.0\.credits: /);
  });

  it("catches the same course in two files", () => {
    const parts = files();
    parts.objects.push({ name: "objects/cas-2.json", json: { subject: "CAS", objects: [{ number: 200, type: "course", title: "Again", credits: 3 }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("objects/cas-2.json: CAS200 is also in objects/cas.json");
  });

  it("needs each object's type", () => {
    const parts = files();
    parts.objects.push({ name: "objects/cas-2.json", json: { subject: "CAS", objects: [{ number: 300, title: "No type", credits: 3 }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^objects\/cas-2\.json: objects\.0\.type: /);
  });

  it("reads the school-wide rules from requirements.json", () => {
    const parts = files();
    parts.school.json = { ...(parts.school.json as object), programs: ["associate", "baccalaureate"] };
    parts.requirements = {
      name: "requirements.json",
      json: { programRequirements: [{ programType: "baccalaureate", minTotalCredits: 120 }] },
    };
    const result = combineSchoolFiles(parts);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.data.programs).toEqual(["associate", "baccalaureate"]);
    expect(result.data.programRequirements).toMatchObject([{ programType: "baccalaureate", minTotalCredits: 120 }]);

    parts.requirements.json = { programRequirements: [{ programType: "baccalaureate", minTotalCredits: "lots" }] };
    const broken = combineSchoolFiles(parts);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.errors[0]).toMatch(/^requirements\.json: programRequirements\.0\.minTotalCredits: /);
  });

  it("needs a program to be in its program type's folder", () => {
    const parts = files();
    parts.school.json = {
      ...(parts.school.json as object),
      programs: ["associate", "baccalaureate"],
    };
    const program = {
      code: "CAS_BA",
      version: "2026-27",
      title: "Communication Arts, B.A.",
      programType: "baccalaureate",
      localRequirements: [],
      terms: [],
    };
    parts.programs = [{ name: "programs/baccalaureate/cas-ba.json", programType: "baccalaureate", json: program }];
    expect(combineSchoolFiles(parts).ok).toBe(true);

    parts.programs = [{ name: "programs/associate/cas-ba.json", programType: "associate", json: program }];
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        "programs/associate/cas-ba.json: CAS_BA is a baccalaureate program, so it goes in programs/baccalaureate/",
      ]);
    }
  });
});
