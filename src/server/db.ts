// The database connection. The app needs one: charts and schools are
// stored there (set DATABASE_URL in .env; see CLAUDE.md).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { prismaAccountStore, type AccountStore } from "./accounts";
import { prismaChartRepository, type ChartRepository } from "./chartRepository";
import { prismaSchoolRepository, withSampleSchool, type SchoolRepository } from "./schoolRepository";

// In development Next.js reloads server files often. Keeping the client on
// globalThis stops each reload from opening new database connections.
const globalForPrisma = globalThis as { prisma?: PrismaClient };

function getPrisma(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  globalForPrisma.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return globalForPrisma.prisma;
}

// These return null without a database, so API routes can answer with a
// clear error instead of crashing.
export function getChartRepository(): ChartRepository | null {
  const prisma = getPrisma();
  return prisma && prismaChartRepository(prisma);
}

export function getSchoolRepository(): SchoolRepository | null {
  const prisma = getPrisma();
  return prisma && withSampleSchool(prismaSchoolRepository(prisma));
}

// For pages and server actions, which can't do anything useful without a
// database: throw an error that says how to fix it.
export function requireDatabase(): { charts: ChartRepository; schools: SchoolRepository; accounts: AccountStore } {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("No database is set up. Put a DATABASE_URL in .env (npm run db:local prints one).");
  }
  return {
    charts: prismaChartRepository(prisma),
    schools: withSampleSchool(prismaSchoolRepository(prisma)),
    accounts: prismaAccountStore(prisma),
  };
}
