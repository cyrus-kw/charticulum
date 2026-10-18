// Reading and writing saved charts. Every function takes an ownerId, so a
// chart can only ever be read or changed by the person who owns it.
import { chartSchema, type Chart } from "../engine/index";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { SaveChartInput, SavedChart, SavedChartSummary } from "../storage/types";

export class ChartNotFoundError extends Error {
  constructor(id: string) {
    super(`No saved chart with id ${id}.`);
  }
}

export interface ChartRepository {
  // The owner's charts, most recently changed first. Pass a schoolId to
  // list only that school's charts.
  list(ownerId: string, schoolId?: string): Promise<SavedChartSummary[]>;
  get(ownerId: string, id: string): Promise<SavedChart | null>;
  // Throws ChartNotFoundError when updating an id the owner doesn't have.
  save(ownerId: string, input: SaveChartInput): Promise<SavedChartSummary>;
  remove(ownerId: string, id: string): Promise<boolean>;
}

type Row = { id: string; name: string; schoolId: string; updatedAt: Date };
const summary = (row: Row): SavedChartSummary => ({
  id: row.id,
  name: row.name,
  schoolId: row.schoolId,
  updatedAt: row.updatedAt.toISOString(),
});

// Stored data is checked on the way out too, in case it was saved by an
// older version of the app.
function readChart(data: unknown): Chart | null {
  const parsed = chartSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function prismaChartRepository(prisma: PrismaClient): ChartRepository {
  return {
    async list(ownerId, schoolId) {
      const rows = await prisma.chart.findMany({
        // A missing schoolId (undefined) is left out of the filter by Prisma.
        where: { ownerId, schoolId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, schoolId: true, updatedAt: true },
      });
      return rows.map(summary);
    },

    async get(ownerId, id) {
      const row = await prisma.chart.findFirst({ where: { id, ownerId } });
      const chart = row && readChart(row.data);
      return row && chart ? { ...summary(row), chart } : null;
    },

    async save(ownerId, { id, schoolId, chart }) {
      // Prisma's JSON type is stricter than our Chart type, though any
      // chart that passed chartSchema is valid JSON.
      const data = chart as unknown as Prisma.InputJsonValue;
      if (id) {
        // updateMany with ownerId in the filter: never touches someone else's chart.
        const { count } = await prisma.chart.updateMany({
          where: { id, ownerId },
          data: { name: chart.name, schoolId, data },
        });
        if (count === 0) throw new ChartNotFoundError(id);
        return summary(await prisma.chart.findFirstOrThrow({ where: { id, ownerId } }));
      }
      return summary(await prisma.chart.create({ data: { ownerId, schoolId, name: chart.name, data } }));
    },

    async remove(ownerId, id) {
      const { count } = await prisma.chart.deleteMany({ where: { id, ownerId } });
      return count > 0;
    },
  };
}

// Same behavior, kept in memory. Used by tests.
export function memoryChartRepository(): ChartRepository {
  const rows = new Map<string, Row & { ownerId: string; data: unknown }>();
  let next = 1;
  let clock = Date.parse("2026-01-01T00:00:00Z");
  // A clock that always moves forward, so "most recent first" is testable.
  const now = () => new Date((clock += 1000));

  return {
    async list(ownerId, schoolId) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId && (schoolId === undefined || r.schoolId === schoolId))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map(summary);
    },
    async get(ownerId, id) {
      const row = rows.get(id);
      const chart = row && row.ownerId === ownerId ? readChart(row.data) : null;
      return row && chart ? { ...summary(row), chart } : null;
    },
    async save(ownerId, { id, schoolId, chart }) {
      const data = structuredClone(chart);
      if (id) {
        const row = rows.get(id);
        if (!row || row.ownerId !== ownerId) throw new ChartNotFoundError(id);
        Object.assign(row, { name: chart.name, schoolId, data, updatedAt: now() });
        return summary(row);
      }
      const row = { id: `chart-${next++}`, ownerId, schoolId, name: chart.name, data, updatedAt: now() };
      rows.set(row.id, row);
      return summary(row);
    },
    async remove(ownerId, id) {
      const row = rows.get(id);
      if (!row || row.ownerId !== ownerId) return false;
      return rows.delete(id);
    },
  };
}
