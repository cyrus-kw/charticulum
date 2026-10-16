// Settings for the Prisma command-line tool (migrations, generate).
import { defineConfig } from "prisma/config";

// Load DATABASE_URL from .env if there is one. (Next.js loads .env by
// itself; the Prisma CLI doesn't.)
try {
  process.loadEnvFile();
} catch {
  // No .env file: fine, the variable may be set another way (e.g. on Vercel).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
