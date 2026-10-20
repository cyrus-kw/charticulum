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
});
