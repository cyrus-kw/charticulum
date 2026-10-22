// Signing in with a code sent by email, step by step:
//
// 1. requestCode: someone types their email. We make a random 6-digit
//    code, keep only its hash, and email them the code. A code works
//    once, for 15 minutes, and only the newest one sent works.
// 2. checkCode: they type the code. If it matches, the code is used up,
//    the account is made if it's new (asking for a name first), and a
//    session starts: a long random secret, saved in their browser as a
//    cookie, with its hash kept here.
// 3. userForSession: on every later request, the cookie's secret is
//    hashed and looked up to find who's signed in.
//
// Why hashes? A hash is a one-way fingerprint: easy to compute from the
// secret, impossible to turn back into it. If someone ever read the
// database, they'd get hashes, which can't be used to sign in.
//
// A 6-digit code has only a million possibilities, so guessing has to be
// limited: each code allows MAX_GUESSES wrong tries, and each address gets
// at most MAX_CODES codes per 15 minutes.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AccountStore, Role, User } from "./accounts";
import type { EmailMessage, Mailer } from "./mailer";

export const CODE_MINUTES = 15;
export const SESSION_DAYS = 30;
const MAX_CODES = 5;
const MAX_GUESSES = 5;
export const MAX_NAME = 100;

export interface AuthDeps {
  store: AccountStore;
  mailer: Mailer;
  now: () => Date;
  // Emails that become admins when they sign in (ADMIN_EMAILS in .env).
  adminEmails: string[];
}

// A session secret: 32 random bytes (256 bits) is far too many to guess.
export const newSecret = () => randomBytes(32).toString("base64url");
export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
// "042917": six random digits, keeping any leading zeros.
export const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

// Compare two hashes in a way that takes the same time whether they
// differ in the first character or the last, so timing can't give hints.
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const emailSchema = z.email();

// Trim and lowercase, so one person can't end up with two accounts by
// typing their address differently. Null if it isn't an email address.
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && emailSchema.safeParse(email).success ? email : null;
}

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

type Result = { ok: true } | { ok: false; error: string };

// Step 1. With `userId`, the code confirms a new email for that account
// instead of signing in.
export async function requestCode(deps: AuthDeps, input: { email: string; userId?: string }): Promise<Result> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "That doesn't look like an email address." };
  const now = deps.now();
  const recent = await deps.store.countTokens(email, minutesAfter(now, -CODE_MINUTES));
  if (recent >= MAX_CODES) {
    return { ok: false, error: `Too many codes sent to ${email}. Try again in ${CODE_MINUTES} minutes.` };
  }
  const code = newCode();
  await deps.store.createToken({
    email,
    userId: input.userId ?? null,
    codeHash: hashSecret(code),
    expiresAt: minutesAfter(now, CODE_MINUTES),
    createdAt: now,
  });
  const ending = `It works once, for ${CODE_MINUTES} minutes. If you didn't ask for this, ignore this email.`;
  const message: EmailMessage =
    input.userId
      ? {
          to: email,
          subject: `${code} is your Charticulum code`,
          text: `Enter this code to use ${email} for your Charticulum account:\n\n${code}\n\n${ending}`,
        }
      : {
          to: email,
          subject: `${code} is your Charticulum code`,
          text: `Enter this code to sign in to Charticulum:\n\n${code}\n\n${ending}`,
        };
  try {
    await deps.mailer.send(message);
  } catch (error) {
    // The details (a bad key, an unverified domain...) are for whoever
    // runs the site, so they go to the server log, not the page.
    console.error(error);
    return { ok: false, error: "We couldn't send the email. Please try again in a few minutes." };
  }
  return { ok: true };
}

export type CheckResult =
  | { ok: true; kind: "sign-in"; user: User; session: { secret: string; expiresAt: Date } }
  | { ok: true; kind: "change-email"; user: User }
  // The code is right, but this is a new account: ask for a name, then
  // check again with it. (The code isn't used up yet.)
  | { ok: false; needName: true; error?: string }
  | { ok: false; needName?: false; error: string };

const EXPIRED = "That code has expired or was already used. Ask for a new one.";

// Step 2. `userId` when confirming a new email; `name` for a new account.
export async function checkCode(
  deps: AuthDeps,
  input: { email: string; code: string; userId?: string; name?: string },
): Promise<CheckResult> {
  const { store } = deps;
  const now = deps.now();
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "That doesn't look like an email address." };
  // People sometimes type "123 456"; keep just the digits.
  const code = input.code.replace(/\D/g, "");

  const token = await store.latestToken(email, input.userId ?? null);
  if (!token || token.expiresAt <= now) return { ok: false, error: EXPIRED };
  if (token.attempts >= MAX_GUESSES) return { ok: false, error: "Too many wrong tries. Ask for a new code." };
  if (!sameHash(hashSecret(code), token.codeHash)) {
    await store.recordWrongGuess(token.id);
    const left = MAX_GUESSES - token.attempts - 1;
    return { ok: false, error: left > 0 ? "That code isn't right. Check it and try again." : "Too many wrong tries. Ask for a new code." };
  }

  const admin = deps.adminEmails.includes(email);

  if (input.userId) {
    const owner = await store.findUserByEmail(email);
    if (owner && owner.id !== input.userId) return { ok: false, error: `${email} already has an account.` };
    const user = await store.getUser(input.userId);
    if (!user || !(await store.takeToken(token.id))) return { ok: false, error: EXPIRED };
    const role: Role = admin ? "admin" : user.role;
    return { ok: true, kind: "change-email", user: await store.updateUser(user.id, { email, role }) };
  }

  let user = await store.findUserByEmail(email);
  const name = cleanName(input.name ?? "");
  if (!user && !name) {
    // Only complain about the name if they tried to give one.
    return input.name === undefined
      ? { ok: false, needName: true }
      : { ok: false, needName: true, error: `Enter your name (up to ${MAX_NAME} characters).` };
  }
  if (!(await store.takeToken(token.id))) return { ok: false, error: EXPIRED };
  if (!user) {
    user = await store.createUser({ email, name: name!, role: admin ? "admin" : "user" });
  } else if (admin && user.role !== "admin") {
    user = await store.updateUser(user.id, { role: "admin" });
  }

  // A good moment to clear out old sessions and codes.
  await store.deleteExpired(now);
  const session = { secret: newSecret(), expiresAt: minutesAfter(now, SESSION_DAYS * 24 * 60) };
  await store.createSession({ id: hashSecret(session.secret), userId: user.id, expiresAt: session.expiresAt });
  return { ok: true, kind: "sign-in", user, session };
}

// Step 3. Who a session cookie's secret belongs to, or null.
export async function userForSession(deps: AuthDeps, secret: string | undefined): Promise<User | null> {
  if (!secret) return null;
  const found = await deps.store.findSession(hashSecret(secret));
  if (!found || found.expiresAt <= deps.now()) return null;
  return found.user;
}

export async function endSession(deps: AuthDeps, secret: string | undefined): Promise<void> {
  if (secret) await deps.store.deleteSession(hashSecret(secret));
}
