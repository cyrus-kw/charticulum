// The database connection, if the server has one.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { prismaChartRepository, type ChartRepository } from "./chartRepository";

// In development Next.js reloads server files often. Keeping the client on
// globalThis stops each reload from opening new database connections.
const globalForPrisma = globalThis as { prisma?: PrismaClient };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getChartRepository(): ChartRepository | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  globalForPrisma.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return prismaChartRepository(globalForPrisma.prisma);
}
