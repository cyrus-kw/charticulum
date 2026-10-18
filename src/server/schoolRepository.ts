// Reading and saving schools' data. Schools are shared: every user reads
// the same ones. (Who may change them is decided by the caller.)
import { parseSchoolData, type SchoolData } from "../engine/index";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { sampleSchool } from "../fixtures/sampleSchool";

export interface SchoolSummary {
  id: string;
  name: string;
  // ISO date string; when the data last changed.
  updatedAt: string;
}

export interface SchoolRepository {
  // Every school, by name.
  list(): Promise<SchoolSummary[]>;
  get(id: string): Promise<SchoolData | null>;
  // Adds the school, or replaces its data if one with the same id exists.
  save(data: SchoolData): Promise<SchoolSummary>;
}

type Row = { id: string; name: string; updatedAt: Date };
const summary = (row: Row): SchoolSummary => ({
  id: row.id,
  name: row.name,
  updatedAt: row.updatedAt.toISOString(),
});

// Stored data is checked on the way out too, in case it was saved by an
// older version of the app.
function readSchool(data: unknown): SchoolData | null {
  const parsed = parseSchoolData(data);
  return parsed.ok ? parsed.data : null;
}

export function prismaSchoolRepository(prisma: PrismaClient): SchoolRepository {
  return {
    async list() {
      const rows = await prisma.school.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, updatedAt: true },
      });
      return rows.map(summary);
    },

    async get(id) {
      const row = await prisma.school.findUnique({ where: { id } });
      return row && readSchool(row.data);
    },

    async save(data) {
      const { id, name } = data.school;
      // Prisma's JSON type is stricter than SchoolData, though any data
      // that passed schoolDataSchema is valid JSON.
      const json = data as unknown as Prisma.InputJsonValue;
      // upsert: update the row if it exists, otherwise create it.
      const row = await prisma.school.upsert({
        where: { id },
        update: { name, data: json },
        create: { id, name, data: json },
      });
      return summary(row);
    },
  };
}

// Same behavior, kept in memory. Used by tests.
export function memorySchoolRepository(): SchoolRepository {
  const rows = new Map<string, Row & { data: SchoolData }>();
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const now = () => new Date((clock += 1000));

  return {
    async list() {
      return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)).map(summary);
    },
    async get(id) {
      const row = rows.get(id);
      return row ? structuredClone(row.data) : null;
    },
    async save(data) {
      const row = { id: data.school.id, name: data.school.name, data: structuredClone(data), updatedAt: now() };
      rows.set(row.id, row);
      return summary(row);
    },
  };
}

// The sample school is always there, even in an empty database: it's
// built into the app. If someone saves a school with the sample's id, the
// saved copy wins.
export function withSampleSchool(repo: SchoolRepository): SchoolRepository {
  const sample = sampleSchool();
  const sampleSummary: SchoolSummary = {
    id: sample.school.id,
    name: sample.school.name,
    updatedAt: new Date(0).toISOString(),
  };
  return {
    async list() {
      const rows = await repo.list();
      if (rows.some((r) => r.id === sample.school.id)) return rows;
      return [...rows, sampleSummary].sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(id) {
      return (await repo.get(id)) ?? (id === sample.school.id ? sample : null);
    },
    save: (data) => repo.save(data),
  };
}
