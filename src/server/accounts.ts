// Storing accounts: users, signed-in sessions, and one-time email codes.
// The sign-in steps themselves (what to check, in what order) are in
// auth.ts; this file only reads and writes.
import type { PrismaClient } from "../generated/prisma/client";

export type Role = "user" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface EmailToken {
  id: string;
  email: string;
  // Set when the code confirms a new email for this existing account.
  userId: string | null;
  // The hash of the code (never the code itself).
  codeHash: string;
  // Wrong guesses so far.
  attempts: number;
  expiresAt: Date;
}

export interface AccountStore {
  getUser(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  createUser(user: Omit<User, "id">): Promise<User>;
  updateUser(id: string, changes: Partial<Omit<User, "id">>): Promise<User>;
  // Deletes the user with their sessions and charts.
  deleteUser(id: string): Promise<void>;

  createToken(token: Omit<EmailToken, "id" | "attempts"> & { createdAt: Date }): Promise<void>;
  // The most recently sent code for this address (and account, when
  // changing email; null when signing in). Only the newest one works.
  latestToken(email: string, userId: string | null): Promise<EmailToken | null>;
  recordWrongGuess(id: string): Promise<void>;
  // Deletes the token; false if it was already gone. Only one of two
  // simultaneous requests gets true, so a code works once.
  takeToken(id: string): Promise<boolean>;
  // How many codes were sent to this address since `since`.
  countTokens(email: string, since: Date): Promise<number>;

  createSession(session: { id: string; userId: string; expiresAt: Date }): Promise<void>;
  findSession(id: string): Promise<{ user: User; expiresAt: Date } | null>;
  deleteSession(id: string): Promise<void>;
  // Tidy up: remove expired sessions and links.
  deleteExpired(now: Date): Promise<void>;
}

// The owner of charts saved before accounts existed (see the accounts
// migration in prisma/migrations).
export const LOCAL_OWNER = "local";

const toUser = (row: { id: string; email: string; name: string; role: string }): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role === "admin" ? "admin" : "user",
});

export function prismaAccountStore(prisma: PrismaClient): AccountStore {
  return {
    async getUser(id) {
      const row = await prisma.user.findUnique({ where: { id } });
      return row && toUser(row);
    },
    async findUserByEmail(email) {
      const row = await prisma.user.findUnique({ where: { email } });
      return row && toUser(row);
    },
    async createUser(user) {
      // A transaction: these steps all happen, or none do.
      return prisma.$transaction(async (tx) => {
        const row = await tx.user.create({ data: user });
        // The first account takes over the charts saved before accounts
        // existed, then the placeholder "local" user goes away.
        const local = await tx.user.findUnique({ where: { id: LOCAL_OWNER } });
        if (local) {
          await tx.chart.updateMany({ where: { ownerId: LOCAL_OWNER }, data: { ownerId: row.id } });
          await tx.user.delete({ where: { id: LOCAL_OWNER } });
        }
        return toUser(row);
      });
    },
    async updateUser(id, changes) {
      return toUser(await prisma.user.update({ where: { id }, data: changes }));
    },
    async deleteUser(id) {
      // Sessions and charts go too (onDelete: Cascade in the schema).
      await prisma.user.delete({ where: { id } });
    },

    async createToken(token) {
      await prisma.emailToken.create({ data: token });
    },
    async latestToken(email, userId) {
      return prisma.emailToken.findFirst({ where: { email, userId }, orderBy: { createdAt: "desc" } });
    },
    async recordWrongGuess(id) {
      // increment: the database adds 1 itself, so two guesses at once
      // both count.
      await prisma.emailToken.updateMany({ where: { id }, data: { attempts: { increment: 1 } } });
    },
    async takeToken(id) {
      // deleteMany doesn't fail when the row is already gone; the count
      // says whether this request was the one that deleted it.
      const { count } = await prisma.emailToken.deleteMany({ where: { id } });
      return count === 1;
    },
    async countTokens(email, since) {
      return prisma.emailToken.count({ where: { email, createdAt: { gte: since } } });
    },

    async createSession(session) {
      await prisma.session.create({ data: session });
    },
    async findSession(id) {
      const row = await prisma.session.findUnique({ where: { id }, include: { user: true } });
      return row && { user: toUser(row.user), expiresAt: row.expiresAt };
    },
    async deleteSession(id) {
      await prisma.session.deleteMany({ where: { id } });
    },
    async deleteExpired(now) {
      await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
      await prisma.emailToken.deleteMany({ where: { expiresAt: { lt: now } } });
    },
  };
}

// Same behavior, kept in memory. Used by tests.
export function memoryAccountStore(): AccountStore & { sentTokens: () => EmailToken[] } {
  const users = new Map<string, User>();
  const tokens = new Map<string, EmailToken & { createdAt: Date }>();
  let nextToken = 1;
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const sent: EmailToken[] = [];
  let next = 1;

  return {
    sentTokens: () => [...sent],
    async getUser(id) {
      const user = users.get(id);
      return user ? { ...user } : null;
    },
    async findUserByEmail(email) {
      const user = [...users.values()].find((u) => u.email === email);
      return user ? { ...user } : null;
    },
    async createUser(user) {
      if ([...users.values()].some((u) => u.email === user.email)) throw new Error("That email has an account.");
      const created = { ...user, id: `user-${next++}` };
      users.set(created.id, created);
      return { ...created };
    },
    async updateUser(id, changes) {
      const user = users.get(id);
      if (!user) throw new Error(`No user ${id}.`);
      Object.assign(user, changes);
      return { ...user };
    },
    async deleteUser(id) {
      users.delete(id);
      for (const [key, s] of sessions) if (s.userId === id) sessions.delete(key);
    },

    async createToken(token) {
      const row = { ...token, id: `token-${nextToken++}`, attempts: 0 };
      tokens.set(row.id, row);
      sent.push(row);
    },
    async latestToken(email, userId) {
      const matches = [...tokens.values()].filter((t) => t.email === email && t.userId === userId);
      // Map keeps insertion order, so the last match is the newest.
      return matches.at(-1) ?? null;
    },
    async recordWrongGuess(id) {
      const token = tokens.get(id);
      if (token) token.attempts += 1;
    },
    async takeToken(id) {
      return tokens.delete(id);
    },
    async countTokens(email, since) {
      return [...tokens.values()].filter((t) => t.email === email && t.createdAt >= since).length;
    },

    async createSession(session) {
      sessions.set(session.id, { userId: session.userId, expiresAt: session.expiresAt });
    },
    async findSession(id) {
      const session = sessions.get(id);
      const user = session && users.get(session.userId);
      return session && user ? { user: { ...user }, expiresAt: session.expiresAt } : null;
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
    async deleteExpired(now) {
      for (const [key, s] of sessions) if (s.expiresAt < now) sessions.delete(key);
      for (const [key, t] of tokens) if (t.expiresAt < now) tokens.delete(key);
    },
  };
}
