"use server";
// Server actions for signing in and out. The steps are explained in
// src/server/auth.ts.
import { redirect } from "next/navigation";
import { checkCode, requestCode } from "../../server/auth";
import { authDeps, setSessionCookie, signOutHere } from "../../server/session";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export type SignInState = { sentTo: string } | { error: string } | null;

// Step one of the sign-in form: email a code.
export async function requestSignInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = text(form, "email");
  const result = await requestCode(authDeps(), { email });
  return result.ok ? { sentTo: email.trim().toLowerCase() } : { error: result.error };
}

export type CodeState = { error?: string; needName?: boolean } | null;

// Step two: check the code (and, for a new account, the name), then sign in.
export async function verifyCodeAction(_previous: CodeState, form: FormData): Promise<CodeState> {
  const result = await checkCode(authDeps(), {
    email: text(form, "email"),
    code: text(form, "code"),
    // form.get gives null when the name box isn't on the form yet.
    name: form.has("name") ? text(form, "name") : undefined,
  });
  if (!result.ok) return { error: result.error, needName: result.needName };
  if (result.kind !== "sign-in") return { error: "That code is for changing an email, not signing in." };
  await setSessionCookie(result.session.secret, result.session.expiresAt);
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await signOutHere();
  redirect("/");
}
