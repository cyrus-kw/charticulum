// Read a school that's split across a folder of JSON files (the layout is
// described in src/engine/schoolFiles.ts) and combine it into one school.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { combineSchoolFiles, type ParseResult, type SchoolFile } from "../engine/index";

async function readJson(folder: string, name: string): Promise<SchoolFile> {
  const text = await readFile(join(folder, name), "utf8");
  try {
    return { name, json: JSON.parse(text) };
  } catch {
    // Passing undefined makes the file fail its check, with its name.
    return { name: `${name} (not valid JSON)`, json: undefined };
  }
}

// Every .json file in a subfolder, or none if the subfolder isn't there.
async function readAll(folder: string, subfolder: string): Promise<SchoolFile[]> {
  let names: string[];
  try {
    names = await readdir(join(folder, subfolder));
  } catch {
    return [];
  }
  const jsonNames = names.filter((name) => name.endsWith(".json")).sort();
  return Promise.all(jsonNames.map((name) => readJson(folder, join(subfolder, name))));
}

export async function readSchoolFolder(folder: string): Promise<ParseResult> {
  return combineSchoolFiles({
    school: await readJson(folder, "school.json"),
    subjects: await readJson(folder, "subjects.json"),
    objects: await readAll(folder, "objects"),
    programs: await readAll(folder, "programs"),
  });
}
