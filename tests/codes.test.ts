import { describe, expect, it } from "vitest";
import { compareByCode, courseCodeId, formatCourseCode, parseCourseCode, parseSchoolData } from "../src/engine/index";
import { sampleSchoolData } from "../src/fixtures/sampleSchool";
import { obj } from "./helpers";

describe("course codes", () => {
  it("splits a code into subject, number, and letter", () => {
    expect(parseCourseCode("CAS 100A")).toEqual({ subject: "CAS", number: 100, suffix: "A" });
    expect(parseCourseCode("CMPSC121")).toEqual({ subject: "CMPSC", number: 121 });
    expect(parseCourseCode("SPAN-PROF")).toBeUndefined();
  });

  it("writes a code as an id and for people", () => {
    const code = { subject: "CAS", number: 100, suffix: "A" };
    expect(courseCodeId(code)).toBe("CAS100A");
    expect(formatCourseCode(code)).toBe("CAS 100A");
  });

  it("sorts by subject, then number as a number, then letter; uncoded last", () => {
    const ids = ["SOPH-REV", "CMPSC100", "CAS100B", "CMPSC97", "CAS100", "CAS100A", "CAS101"];
    const objects = ids.map((id) => obj(id, { code: parseCourseCode(id) }));
    expect(objects.sort(compareByCode).map((o) => o.id)).toEqual([
      "CAS100", "CAS100A", "CAS100B", "CAS101", "CMPSC97", "CMPSC100", "SOPH-REV",
    ]);
  });
});

describe("codes in school data", () => {
  it("fills in a code from the id when a file leaves it out", () => {
    const result = parseSchoolData(sampleSchoolData);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const byId = new Map(result.data.objects.map((o) => [o.id, o]));
    expect(byId.get("CS102L")!.code).toEqual({ subject: "CS", number: 102, suffix: "L" });
    expect(byId.get("SPAN-PROF")!.code).toBeUndefined();
  });

  it("rejects a code that doesn't match its id", () => {
    const [first, ...rest] = sampleSchoolData.objects;
    const result = parseSchoolData({
      ...sampleSchoolData,
      objects: [{ ...first, code: { subject: "CS", number: 999 } }, ...rest],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain(`objects.${first.id}.code: CS 999 doesn't match the id (it would be CS999)`);
  });
});
