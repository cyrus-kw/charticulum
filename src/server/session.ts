// Who is signed in, for pages, server actions, and API routes. This is the
// Next.js side of sign-in (cookies, redirects); the steps themselves are
// in auth.ts.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "./accounts";
import { endSession, userForSession, type AuthDeps } from "./auth";
import { requireDatabase } from "./db";
import { consoleMailer } from "./mailer";

// The cookie that holds a signed-in browser's session secret.
const SESSION_COOKIE = "charticulum_session";

export function authDeps(): AuthDeps {
  return {
    store: requireDatabase().accounts,
    mailer: consoleMailer,
    now: () => new Date(),
    // ADMIN_EMAILS="ana@example.com, bo@example.com" in .env
    adminEmails: (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  };
}

// The signed-in user, or null. cache() remembers the answer for the rest
// of this one request, so a page and its parts can all ask without
// repeating the database lookup.
export const currentUser = cache(async (): Promise<User | null> => {
  const secret = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForSession(authDeps(), secret);
});

// For pages and actions that need someone signed in: send everyone else
// to the home page to sign in. (redirect() stops the page right there.)
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only admins can change schools.");
  return user;
}

// Save a new session's secret in the browser. The cookie options matter:
// httpOnly: the page's JavaScript can't read it, so a bug or a bad script
//   in the page can't steal it.
// secure: only sent over https (except while developing on localhost).
// sameSite "lax": other sites can link here, but can't send forms or
//   background requests to this site with the cookie attached.
export async function setSessionCookie(secret: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

// Sign out this browser: end the session and remove the cookie.
export async function signOutHere(): Promise<void> {
  await endSession(authDeps(), (await cookies()).get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
}
