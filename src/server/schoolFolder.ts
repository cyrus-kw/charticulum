// Read a school that's split across a folder of JSON files (the layout is
// described in src/engine/schoolFiles.ts) and combine it into one school.
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { combineSchoolFiles, type ParseResult, type ProgramFile, type SchoolFile } from "../engine/index";

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

// Every program file, from programs/'s subfolders, one per program type
// (programs/baccalaureate/cmpsc-bs.json). Each file gets its folder's name
// as its type, so a program in the wrong folder is caught. A file left
// loose in programs/ gets no type, so its error says which folder it
// belongs in instead of it being skipped without a word.
async function readPrograms(folder: string): Promise<ProgramFile[]> {
  let entries;
  try {
    entries = await readdir(join(folder, "programs"), { withFileTypes: true });
  } catch {
    return [];
  }
  const types = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const perType = await Promise.all(
    types.map(async (programType) => {
      const files = await readAll(folder, join("programs", programType));
      return files.map((file) => ({ ...file, programType }));
    }),
  );
  const loose = (await readAll(folder, "programs")).map((file) => ({ ...file, programType: "" }));
  return [...loose, ...perType.flat()];
}

// A file that may be left out, or undefined if it isn't there.
async function readOptional(folder: string, name: string): Promise<SchoolFile | undefined> {
  try {
    await access(join(folder, name));
  } catch {
    return undefined;
  }
  return readJson(folder, name);
}

export async function readSchoolFolder(folder: string): Promise<ParseResult> {
  return combineSchoolFiles({
    school: await readJson(folder, "school.json"),
    subjects: await readJson(folder, "subjects.json"),
    requirements: await readOptional(folder, "requirements.json"),
    objects: await readAll(folder, "objects"),
    programs: await readPrograms(folder),
  });
}
