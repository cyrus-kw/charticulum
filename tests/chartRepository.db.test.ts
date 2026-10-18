// Runs the real Prisma repository against a real Postgres database.
// Skipped unless TEST_DATABASE_URL is set, e.g.:
//   npm run db:local   (in another terminal; prints a postgres:// URL)
//   TEST_DATABASE_URL="postgres://..." npx vitest run tests/chartRepository.db.test.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client";
import { prismaAccountStore } from "../src/server/accounts";
import { ChartNotFoundError, prismaChartRepository } from "../src/server/chartRepository";
import { chartOf } from "./helpers";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("prismaChartRepository (real database)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? "" }) });
  const repo = prismaChartRepository(prisma);
  // Unique owners so repeated runs don't see each other's rows.
  const run = Date.now().toString(36);
  const owner = `test-${run}`;
  const stranger = `stranger-${run}`;
  const chart = chartOf([[], ["CS101"]], { name: "DB plan", grades: { CS101: "B" } });

  // Every chart belongs to a real user, so make the two owners first.
  // (Made directly, not with the account store's createUser, which would
  // take over any charts saved before accounts existed.)
  beforeAll(async () => {
    for (const id of [owner, stranger]) {
      await prisma.user.create({ data: { id, email: `${id}@test.invalid`, name: id } });
    }
  });

  afterAll(async () => {
    // Deleting the users deletes their charts and sessions too.
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("round-trips a chart through Postgres", async () => {
    const saved = await repo.save(owner, { schoolId: "s", chart });
    const loaded = await repo.get(owner, saved.id);
    expect(loaded?.chart).toEqual(chart);
    expect(await repo.list(owner, "s")).toEqual([saved]);
  });

  it("updates in place and orders by most recent", async () => {
    const a = await repo.save(owner, { schoolId: "s2", chart: { ...chart, name: "A" } });
    const b = await repo.save(owner, { schoolId: "s2", chart: { ...chart, name: "B" } });
    await repo.save(owner, { id: a.id, schoolId: "s2", chart: { ...chart, name: "A2" } });
    expect((await repo.list(owner, "s2")).map((c) => c.name)).toEqual(["A2", "B"]);
    expect(b.id).not.toBe(a.id);
  });

  it("never lets another owner read, change, or delete a chart", async () => {
    const saved = await repo.save(owner, { schoolId: "s3", chart });
    expect(await repo.get(stranger, saved.id)).toBeNull();
    await expect(repo.save(stranger, { id: saved.id, schoolId: "s3", chart })).rejects.toBeInstanceOf(
      ChartNotFoundError,
    );
    expect(await repo.remove(stranger, saved.id)).toBe(false);
    expect(await repo.remove(owner, saved.id)).toBe(true);
    expect(await repo.get(owner, saved.id)).toBeNull();
  });

  it("lets an email code be used once, counts wrong guesses, and finds sessions", async () => {
    const accounts = prismaAccountStore(prisma);
    const later = new Date(Date.now() + 60_000);
    const email = `${owner}@test.invalid`;
    await accounts.createToken({ email, userId: null, codeHash: "hash", expiresAt: later, createdAt: new Date() });
    const token = (await accounts.latestToken(email, null))!;
    expect(token.codeHash).toBe("hash");
    await Promise.all([accounts.recordWrongGuess(token.id), accounts.recordWrongGuess(token.id)]);
    expect((await accounts.latestToken(email, null))?.attempts).toBe(2);
    // Two requests at once: only one gets the token.
    const taken = await Promise.all([accounts.takeToken(token.id), accounts.takeToken(token.id)]);
    expect(taken.filter(Boolean)).toHaveLength(1);

    await accounts.createSession({ id: `session-${run}`, userId: owner, expiresAt: later });
    expect((await accounts.findSession(`session-${run}`))?.user.id).toBe(owner);
    await accounts.deleteSession(`session-${run}`);
    expect(await accounts.findSession(`session-${run}`)).toBeNull();
  });
});
