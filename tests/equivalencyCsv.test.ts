import { describe, expect, it } from "vitest";
import { mergeEquivalencyRows, parseCsv, parseEquivalencyCsv } from "../src/engine/equivalencyCsv";

describe("parseCsv", () => {
  it("handles quotes, commas and line breaks inside quotes, and escaped quotes", () => {
    const text = 'a,"b, c","say ""hi"""\r\n"multi\nline",x,y\n\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["multi\nline", "x", "y"],
    ]);
  });

  it("keeps a final line with no line break", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseEquivalencyCsv", () => {
  it("reads rows with columns in any order and any letter case", () => {
    const result = parseEquivalencyCsv(
      "﻿ObjectId,Institution,EXTERNALID\nMATH101,AP,CALC-AB\nHIST110,\"Valley Community College\",HIST-10\n",
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        { institution: "AP", externalId: "CALC-AB", objectId: "MATH101" },
        { institution: "Valley Community College", externalId: "HIST-10", objectId: "HIST110" },
      ],
    });
  });

  it("explains a wrong header", () => {
    const result = parseEquivalencyCsv("school,course\nAP,X\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/Missing column\(s\): institution, externalId, objectId/);
  });

  it("reports incomplete rows by line number", () => {
    const result = parseEquivalencyCsv("institution,externalId,objectId\nAP,CALC-AB,MATH101\nAP,,STAT200\n");
    expect(result).toEqual({
      ok: false,
      errors: ["Line 3: every row needs an institution, externalId, and objectId."],
    });
  });

  it("rejects an empty file", () => {
    expect(parseEquivalencyCsv("")).toEqual({ ok: false, errors: ["The file is empty."] });
  });
});

describe("the shipped sample table", () => {
  it("parses and only names objects in the sample school", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseSchoolData } = await import("../src/engine/index");
    const { sampleSchoolData } = await import("../src/fixtures/sampleSchool");
    const csv = parseEquivalencyCsv(readFileSync("tests/fixtures/transfer-table.csv", "utf8"));
    if (!csv.ok) throw new Error(csv.errors.join("\n"));
    const merged = { ...sampleSchoolData, equivalencyTable: csv.rows };
    expect(parseSchoolData(merged).ok).toBe(true);
  });
});

describe("mergeEquivalencyRows", () => {
  it("skips duplicates, including within the new rows", () => {
    const a = { institution: "AP", externalId: "X", objectId: "A" };
    const b = { institution: "AP", externalId: "Y", objectId: "B" };
    expect(mergeEquivalencyRows([a], [a, b, b])).toEqual([a, b]);
  });
});
