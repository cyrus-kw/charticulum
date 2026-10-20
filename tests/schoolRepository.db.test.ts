// Runs the real Prisma school repository against a real Postgres database.
// Skipped unless TEST_DATABASE_URL is set, e.g.:
//   npm run db:local   (in another terminal; prints a postgres:// URL)
//   TEST_DATABASE_URL="postgres://..." npx vitest run tests/schoolRepository.db.test.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";
import { sampleSchool } from "../src/fixtures/sampleSchool";
import { PrismaClient } from "../src/generated/prisma/client";
import { prismaSchoolRepository } from "../src/server/schoolRepository";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("prismaSchoolRepository (real database)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? "" }) });
  const repo = prismaSchoolRepository(prisma);
  // A unique id so repeated runs don't see each other's rows.
  const id = `test-school-${Date.now().toString(36)}`;
  const sample = sampleSchool();
  const withDescriptions = (cs101: string) => ({
    ...sample,
    school: { id, name: "Test School" },
    objects: sample.objects.map((o) => (o.id === "CS101" ? { ...o, description: cs101 } : o)),
  });

  afterAll(async () => {
    // Deleting the school deletes its descriptions too.
    await prisma.school.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });

  it("keeps descriptions in their own rows, out of the school's data", async () => {
    await repo.save(withDescriptions("Variables and loops."));
    expect(await repo.description(id, "CS101")).toBe("Variables and loops.");
    expect(await repo.description(id, "CS102")).toBeNull();
    expect((await repo.get(id))?.objects.some((o) => "description" in o)).toBe(false);
  });

  it("replaces the old descriptions when the school is saved again", async () => {
    await repo.save(withDescriptions("Rewritten."));
    expect(await repo.description(id, "CS101")).toBe("Rewritten.");
    expect(await prisma.objectDescription.count({ where: { schoolId: id } })).toBe(1);
  });
});
