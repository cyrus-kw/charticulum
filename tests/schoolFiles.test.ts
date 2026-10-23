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
    courses: [
      {
        name: "courses/cas.json",
        json: {
          subject: "CAS",
          courses: [
            { number: 100, suffix: "A", title: "Effective Speech", credits: 3, description: "Public speaking." },
            { number: 200, title: "Rhetoric", credits: 3, requisites: { previous: ["CAS100A"] } },
          ],
        },
      },
      { name: "courses/a-i.json", json: { subject: "A-I", courses: [{ number: 100, title: "Automated Thinking", credits: 3 }] } },
    ],
  };
}

// A structure with two levels and one credential, for the tests that need one.
const structure = {
  name: "structure.json",
  json: {
    levels: [
      { id: "undergraduate", name: "Undergraduate", numbers: [[1, 499]] },
      { id: "graduate", name: "Graduate", numbers: [[500, 699]] },
    ],
    credentials: [{ id: "bachelors", name: "Bachelor's", level: "undergraduate" }],
    divisionTypes: [{ id: "college", name: "College" }],
    divisions: [{ id: "arts", type: "college", name: "College of Arts", departments: [{ id: "cas", name: "Communication" }] }],
  },
};

describe("combineSchoolFiles", () => {
  it("builds each course's id and code from its subject's file", () => {
    const result = combineSchoolFiles(files());
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const [speech, rhetoric, ai] = result.data.objects;
    expect(speech).toMatchObject({
      id: "CAS100A",
      code: { subject: "CAS", number: 100, suffix: "A" },
      // Left out in the file, so it's a course.
      type: "course",
      description: "Public speaking.",
    });
    expect(rhetoric.requisites.previous).toEqual(["CAS100A"]);
    expect(ai.id).toBe("A-I100");
    expect(result.data.subjects).toHaveLength(2);
  });

  it("reads a range of credits as credits and maxCredits", () => {
    const parts = files();
    parts.courses.push({
      name: "courses/cas-2.json",
      json: { subject: "CAS", courses: [{ number: 296, title: "Independent Studies", credits: { min: 1, max: 18 }, repeatable: { maxCredits: 18 } }] },
    });
    const result = combineSchoolFiles(parts);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.data.objects.find((o) => o.id === "CAS296")).toMatchObject({ credits: 1, maxCredits: 18, repeatable: { maxCredits: 18 } });
  });

  it("needs each file's subject to be in subjects.json", () => {
    const parts = files();
    parts.courses.push({ name: "courses/math.json", json: { subject: "MATH", courses: [{ number: 140, title: "Calculus", credits: 4 }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(["courses/math.json: objects.MATH140.code: unknown subject MATH"]);
  });

  it("names the file a mistake is in", () => {
    const parts = files();
    parts.courses.push({ name: "courses/cas-2.json", json: { subject: "CAS", courses: [{ number: 200, title: "Again", credits: "three" }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^courses\/cas-2\.json: courses\.0\.credits: /);
  });

  it("catches the same course in two files", () => {
    const parts = files();
    parts.courses.push({ name: "courses/cas-2.json", json: { subject: "CAS", courses: [{ number: 200, title: "Again", credits: 3 }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("courses/cas-2.json: CAS200 is also in courses/cas.json");
  });

  it("turns gen ed attributes into the course's areas and category", () => {
    const parts = files();
    parts.attributes = {
      name: "attributes.json",
      json: {
        groups: [{ id: "gen-ed", name: "General Education", category: "general-education" }, { id: "university", name: "University" }],
        attributes: [
          { id: "GH", name: "Humanities", group: "gen-ed" },
          { id: "INTER", name: "Inter-Domain", group: "gen-ed" },
          { id: "US", name: "United States Cultures", group: "university" },
        ],
      },
    };
    (parts.courses[0].json as { courses: object[] }).courses.push({ number: 150, title: "Voices", credits: 3, attributes: ["INTER", "US", "GH"] });
    const result = combineSchoolFiles(parts);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const voices = result.data.objects.find((o) => o.id === "CAS150")!;
    // In attributes.json's order, so the domain comes before Inter-Domain.
    expect(voices).toMatchObject({ attributes: ["INTER", "US", "GH"], categories: ["general-education"], genEdAreas: ["Humanities", "Inter-Domain"] });

    (parts.courses[0].json as { courses: object[] }).courses.push({ number: 160, title: "Odd", credits: 3, attributes: ["ZZ"] });
    const broken = combineSchoolFiles(parts);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.errors).toEqual(["courses/cas.json: objects.CAS160.attributes: unknown attribute ZZ"]);
  });

  it("needs every course number to fit a level, when levels give numbers", () => {
    const parts = files();
    parts.structure = structure;
    expect(combineSchoolFiles(parts).ok).toBe(true);
    parts.courses.push({ name: "courses/cas-2.json", json: { subject: "CAS", courses: [{ number: 800, title: "Too high", credits: 3 }] } });
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(["courses/cas-2.json: objects.CAS800.code: 800 isn't in any level's course numbers"]);
  });

  it("reads each credential's rules from requirements/credentials/", () => {
    const parts = files();
    parts.structure = structure;
    parts.requirements = [{ name: "requirements/credentials/bachelors.json", credential: "bachelors", json: { minTotalCredits: 120 } }];
    const result = combineSchoolFiles(parts);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    // The program types are the structure's credentials.
    expect(result.data.programs).toEqual(["bachelors"]);
    expect(result.data.programRequirements).toMatchObject([{ programType: "bachelors", minTotalCredits: 120 }]);

    parts.requirements[0].json = { minTotalCredits: "lots" };
    const broken = combineSchoolFiles(parts);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.errors[0]).toMatch(/^requirements\/credentials\/bachelors\.json: minTotalCredits: /);

    parts.requirements = [{ name: "requirements/credentials/masters.json", credential: "masters", json: {} }];
    const unknown = combineSchoolFiles(parts);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors).toEqual(["programRequirements.masters: masters is not one of the school's programs"]);
  });

  it("needs a program to be in its credential's folder, and its division to exist", () => {
    const parts = files();
    parts.structure = structure;
    const program = {
      code: "CAS_BA",
      version: "2026-27",
      title: "Communication Arts, B.A.",
      programType: "bachelors",
      division: "arts",
      localRequirements: [],
      terms: [],
    };
    parts.programs = [{ name: "programs/bachelors/cas-ba.json", programType: "bachelors", json: program }];
    expect(combineSchoolFiles(parts).ok).toBe(true);

    parts.programs = [{ name: "programs/associate/cas-ba.json", programType: "associate", json: program }];
    const result = combineSchoolFiles(parts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(["programs/associate/cas-ba.json: CAS_BA is a bachelors program, so it goes in programs/bachelors/"]);
    }

    parts.programs = [{ name: "programs/bachelors/cas-ba.json", programType: "bachelors", json: { ...program, division: "law" } }];
    const noDivision = combineSchoolFiles(parts);
    expect(noDivision.ok).toBe(false);
    if (!noDivision.ok) expect(noDivision.errors).toEqual(["templates.CAS_BA.division: unknown division law"]);
  });
});
