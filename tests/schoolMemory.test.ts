import { describe, expect, it } from "vitest";
import { parseSchoolData } from "../src/engine/index";
import { sampleSchoolData } from "../src/fixtures/sampleSchool";
import { forgetSchool, recallSchool, rememberSchool } from "../src/storage/schoolMemory";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const parsed = parseSchoolData(sampleSchoolData);
if (!parsed.ok) throw new Error("sample is invalid");
const school = parsed.data;

describe("school memory", () => {
  it("remembers, recalls, and forgets an imported school", () => {
    const storage = memoryStorage();
    expect(recallSchool(storage)).toBeNull();
    rememberSchool(school, storage);
    expect(recallSchool(storage)).toEqual(school);
    forgetSchool(storage);
    expect(recallSchool(storage)).toBeNull();
  });

  it("ignores stored data that's no longer valid", () => {
    const storage = memoryStorage();
    storage.setItem("charticulum.school.v1", JSON.stringify({ formatVersion: 99 }));
    expect(recallSchool(storage)).toBeNull();
    storage.setItem("charticulum.school.v1", "{oops");
    expect(recallSchool(storage)).toBeNull();
  });

  it("does nothing when storage is unavailable or full", () => {
    expect(() => rememberSchool(school, null)).not.toThrow();
    expect(recallSchool(null)).toBeNull();
    const full = { ...memoryStorage(), setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => rememberSchool(school, full as Storage)).not.toThrow();
  });
});
