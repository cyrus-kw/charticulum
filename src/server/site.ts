// What the site's pages do with saved data: list a person's charts, start
// a new one, open one, import schools. Pages and server actions call these
// with the real database; tests call them with in-memory repositories.
import {
  loadSchool,
  mergeEquivalencyRows,
  parseEquivalencyCsv,
  compactSchoolData,
  parseSchoolData,
  type SchoolDataInput,
} from "../engine/index";
import { newChart } from "../planner/state";
import type { SavedChart, SavedChartSummary } from "../storage/types";
import type { ChartRepository } from "./chartRepository";
import type { SchoolRepository, SchoolSummary } from "./schoolRepository";

export interface Repositories {
  charts: ChartRepository;
  schools: SchoolRepository;
}

// A program a new chart can start from.
export interface ProgramChoice {
  templateId: string;
  version: string;
  name: string;
}

export interface SchoolChoice extends SchoolSummary {
  programs: ProgramChoice[];
}

// Everything the dashboard shows: your charts (with their school's name)
// and the schools and programs a new chart can start from.
export async function dashboardData(repos: Repositories, ownerId: string) {
  const [charts, summaries] = await Promise.all([repos.charts.list(ownerId), repos.schools.list()]);
  const schools: SchoolChoice[] = await Promise.all(
    summaries.map(async (s) => {
      const data = await repos.schools.get(s.id);
      const programs = (data?.templates ?? []).map((t) => ({ templateId: t.code, version: t.version, name: t.title }));
      return { ...s, programs };
    }),
  );
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));
  // A chart whose school was never saved to the server (e.g. imported in
  // a browser before schools lived in the database) shows its id instead.
  const withSchool = (c: SavedChartSummary) => ({ ...c, schoolName: schoolName.get(c.schoolId) ?? c.schoolId });
  return { charts: charts.map(withSchool), schools };
}

export interface NewChartInput {
  schoolId: string;
  // Both missing: start from an empty plan.
  templateId?: string;
  version?: string;
}

// Make and save a new chart; returns its id.
export async function createChart(repos: Repositories, ownerId: string, input: NewChartInput): Promise<string> {
  const data = await repos.schools.get(input.schoolId);
  if (!data) throw new Error(`No school with id ${input.schoolId}.`);
  const ref =
    input.templateId && input.version ? { templateId: input.templateId, version: input.version } : undefined;
  const chart = newChart(loadSchool(data), ref);
  const saved = await repos.charts.save(ownerId, { schoolId: input.schoolId, chart });
  return saved.id;
}

// A saved chart with its school's data, ready for the planner; null if
// the owner has no such chart or its school is gone. The school is
// compacted (compactSchoolData) to keep the page small, since a big school
// has thousands of courses; the planner parses it again to fill the
// defaults back in. Descriptions are left out and read one at a time
// instead (objectDescription, below).
export async function openChart(
  repos: Repositories,
  ownerId: string,
  id: string,
): Promise<{ saved: SavedChart; school: SchoolDataInput } | null> {
  const saved = await repos.charts.get(ownerId, id);
  if (!saved) return null;
  const school = await repos.schools.get(saved.schoolId);
  return school ? { saved, school: compactSchoolData(school) } : null;
}

// One object's description, or null if it has none (or there's no such
// school or object).
export async function objectDescription(repos: Repositories, schoolId: string, objectId: string): Promise<string | null> {
  return repos.schools.description(schoolId, objectId);
}

export type ImportResult = { ok: true; school: SchoolSummary } | { ok: false; errors: string[] };

// Add a school from a JSON file's text, or replace the one with the same id.
export async function importSchool(repos: Repositories, text: string): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["That file is not valid JSON."] };
  }
  const result = parseSchoolData(json);
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, school: await repos.schools.save(result.data) };
}

export type TransferResult = { ok: true; added: number } | { ok: false; errors: string[] };

// Add a transfer / AP table (CSV text) to a school's data.
export async function addTransferTable(repos: Repositories, schoolId: string, csv: string): Promise<TransferResult> {
  const data = await repos.schools.get(schoolId);
  if (!data) return { ok: false, errors: [`No school with id ${schoolId}.`] };
  const parsed = parseEquivalencyCsv(csv);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const next = { ...data, equivalencyTable: mergeEquivalencyRows(data.equivalencyTable, parsed.rows) };
  // Check the combined data, e.g. that every row names a real object.
  const result = parseSchoolData(next);
  if (!result.ok) return { ok: false, errors: result.errors };
  await repos.schools.save(result.data);
  return { ok: true, added: result.data.equivalencyTable.length - data.equivalencyTable.length };
}
