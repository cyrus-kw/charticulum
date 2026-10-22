import { describe, expect, it, vi } from "vitest";
import { memoryAccountStore } from "../src/server/accounts";
import { checkCode, endSession, hashSecret, normalizeEmail, requestCode, userForSession, type AuthDeps } from "../src/server/auth";
import type { EmailMessage } from "../src/server/mailer";

// A pretend world: an in-memory store, a mailbox that keeps what was
// "sent", and a clock the test can move forward.
function setup(adminEmails: string[] = []) {
  const store = memoryAccountStore();
  const inbox: EmailMessage[] = [];
  let now = new Date("2026-10-17T12:00:00Z");
  const deps: AuthDeps = {
    store,
    mailer: { send: async (m) => void inbox.push(m) },
    now: () => now,
    adminEmails,
  };
  // The code in the last email.
  const lastCode = () => {
    const match = inbox.at(-1)?.text.match(/\b(\d{6})\b/);
    if (!match) throw new Error("No code was sent.");
    return match[1];
  };
  // A code that isn't the real one.
  const wrongCode = () => (lastCode() === "000000" ? "111111" : "000000");
  const wait = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60_000);
  };
  return { deps, store, inbox, lastCode, wrongCode, wait };
}

// Sign `email` in (making the account if needed); returns the session secret.
async function signIn(world: ReturnType<typeof setup>, email: string, name = "Ana") {
  await requestCode(world.deps, { email });
  const result = await checkCode(world.deps, { email, code: world.lastCode(), name });
  if (!result.ok || result.kind !== "sign-in") throw new Error("Sign-in failed.");
  return result.session.secret;
}

describe("requestCode when email fails", () => {
  it("says the email couldn't be sent", async () => {
    const world = setup();
    world.deps.mailer = {
      send: async () => {
        throw new Error("Resend is down");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await requestCode(world.deps, { email: "ana@example.com" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/couldn't send/) });
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases, and rejects non-addresses", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("signing in with an emailed code", () => {
  it("emails a 6-digit code, and keeps only its hash", async () => {
    const world = setup();
    expect(await requestCode(world.deps, { email: "Ana@Example.com" })).toEqual({ ok: true });
    expect(world.inbox).toHaveLength(1);
    expect(world.inbox[0].to).toBe("ana@example.com");
    const code = world.lastCode();
    expect(world.inbox[0].subject).toContain(code);
    const stored = world.store.sentTokens()[0];
    expect(stored.codeHash).toBe(hashSecret(code));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it("asks a new account for a name before using up the code", async () => {
    const world = setup();
    await requestCode(world.deps, { email: "ana@example.com" });
    const code = world.lastCode();
    // Right code, no name yet: ask for one (no error the first time).
    expect(await checkCode(world.deps, { email: "ana@example.com", code })).toEqual({ ok: false, needName: true });
    expect(await checkCode(world.deps, { email: "ana@example.com", code, name: "  " })).toMatchObject({
      needName: true,
      error: /name/,
    });
    // The code still works, typed with a space too.
    const result = await checkCode(world.deps, {
      email: "ANA@example.com",
      code: `${code.slice(0, 3)} ${code.slice(3)}`,
      name: "  Ana   Lopez ",
    });
    expect(result).toMatchObject({
      ok: true,
      kind: "sign-in",
      user: { email: "ana@example.com", name: "Ana Lopez", role: "user" },
    });
  });

  it("signs an existing account back in without asking for a name", async () => {
    const world = setup();
    await signIn(world, "ana@example.com");
    await requestCode(world.deps, { email: "ana@example.com" });
    const again = await checkCode(world.deps, { email: "ana@example.com", code: world.lastCode() });
    expect(again).toMatchObject({ ok: true, user: { name: "Ana" } });
  });

  it("lets a code work only once, and only for 15 minutes", async () => {
    const world = setup();
    await requestCode(world.deps, { email: "ana@example.com" });
    const code = world.lastCode();
    expect((await checkCode(world.deps, { email: "ana@example.com", code, name: "Ana" })).ok).toBe(true);
    expect(await checkCode(world.deps, { email: "ana@example.com", code })).toMatchObject({ error: /expired or was already used/ });

    await requestCode(world.deps, { email: "bo@example.com" });
    world.wait(16);
    expect(await checkCode(world.deps, { email: "bo@example.com", code: world.lastCode(), name: "Bo" })).toMatchObject({
      error: /expired/,
    });
  });

  it("only accepts the newest code sent", async () => {
    const world = setup();
    await requestCode(world.deps, { email: "ana@example.com" });
    const first = world.lastCode();
    await requestCode(world.deps, { email: "ana@example.com" });
    const second = world.lastCode();
    if (first !== second) {
      expect((await checkCode(world.deps, { email: "ana@example.com", code: first, name: "Ana" })).ok).toBe(false);
    }
    expect((await checkCode(world.deps, { email: "ana@example.com", code: second, name: "Ana" })).ok).toBe(true);
  });

  it("stops a code working after 5 wrong guesses", async () => {
    const world = setup();
    await requestCode(world.deps, { email: "ana@example.com" });
    for (let i = 0; i < 4; i++) {
      expect(await checkCode(world.deps, { email: "ana@example.com", code: world.wrongCode() })).toMatchObject({
        error: /isn't right/,
      });
    }
    expect(await checkCode(world.deps, { email: "ana@example.com", code: world.wrongCode() })).toMatchObject({
      error: /Too many wrong tries/,
    });
    // Even the right code no longer works.
    expect(await checkCode(world.deps, { email: "ana@example.com", code: world.lastCode(), name: "Ana" })).toMatchObject({
      error: /Too many wrong tries/,
    });
  });

  it("doesn't accept a code sent to a different address", async () => {
    const world = setup();
    await requestCode(world.deps, { email: "ana@example.com" });
    expect((await checkCode(world.deps, { email: "eve@example.com", code: world.lastCode(), name: "Eve" })).ok).toBe(false);
  });

  it("limits how many codes one address gets", async () => {
    const world = setup();
    for (let i = 0; i < 5; i++) await requestCode(world.deps, { email: "ana@example.com" });
    expect(await requestCode(world.deps, { email: "ana@example.com" })).toMatchObject({ error: /Too many codes/ });
    expect(world.inbox).toHaveLength(5);
    world.wait(16);
    expect((await requestCode(world.deps, { email: "ana@example.com" })).ok).toBe(true);
  });

  it("makes listed emails admins", async () => {
    const world = setup(["boss@example.com"]);
    await requestCode(world.deps, { email: "Boss@Example.com" });
    const result = await checkCode(world.deps, { email: "boss@example.com", code: world.lastCode(), name: "Boss" });
    expect(result).toMatchObject({ user: { role: "admin" } });
  });
});

describe("sessions", () => {
  it("finds the user from the cookie's secret until it expires or is ended", async () => {
    const world = setup();
    const secret = await signIn(world, "ana@example.com");
    expect(await userForSession(world.deps, secret)).toMatchObject({ email: "ana@example.com" });
    expect(await userForSession(world.deps, "wrong")).toBeNull();
    expect(await userForSession(world.deps, undefined)).toBeNull();

    await endSession(world.deps, secret);
    expect(await userForSession(world.deps, secret)).toBeNull();

    const later = await signIn(world, "ana@example.com");
    world.wait(31 * 24 * 60);
    expect(await userForSession(world.deps, later)).toBeNull();
  });

  it("ends when the account is deleted", async () => {
    const world = setup();
    const secret = await signIn(world, "ana@example.com");
    const user = await userForSession(world.deps, secret);
    await world.store.deleteUser(user!.id);
    expect(await userForSession(world.deps, secret)).toBeNull();
  });
});

describe("changing email", () => {
  it("moves the account to the new address once its code is entered", async () => {
    const world = setup();
    const session = await signIn(world, "ana@example.com");
    const user = (await userForSession(world.deps, session))!;

    await requestCode(world.deps, { email: "ana@new.com", userId: user.id });
    expect(world.inbox.at(-1)?.to).toBe("ana@new.com");
    // The code changes the email; it can't be used to sign in.
    expect((await checkCode(world.deps, { email: "ana@new.com", code: world.lastCode(), name: "X" })).ok).toBe(false);
    const result = await checkCode(world.deps, { email: "ana@new.com", code: world.lastCode(), userId: user.id });
    expect(result).toMatchObject({ ok: true, kind: "change-email", user: { email: "ana@new.com" } });
    // Still the same account and session.
    expect(await userForSession(world.deps, session)).toMatchObject({ id: user.id, email: "ana@new.com" });
  });

  it("won't take an address another account has", async () => {
    const world = setup();
    const session = await signIn(world, "ana@example.com");
    await signIn(world, "bo@example.com", "Bo");
    const ana = (await userForSession(world.deps, session))!;
    await requestCode(world.deps, { email: "bo@example.com", userId: ana.id });
    const result = await checkCode(world.deps, { email: "bo@example.com", code: world.lastCode(), userId: ana.id });
    expect(result).toMatchObject({ ok: false, error: /already has an account/ });
  });
});
