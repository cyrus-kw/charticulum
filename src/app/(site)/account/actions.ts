"use server";
// Server actions for the Account page. Each one acts only on the
// signed-in user's own account.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkCode, cleanName, MAX_NAME, normalizeEmail, requestCode } from "../../../server/auth";
import { requireDatabase } from "../../../server/db";
import { authDeps, clearSessionCookie, requireUser } from "../../../server/session";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export type FormResult = { ok: true; message: string } | { ok: false; error: string } | null;

export async function updateNameAction(_previous: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const name = cleanName(text(form, "name"));
  if (!name) return { ok: false, error: `Enter a name (up to ${MAX_NAME} characters).` };
  await requireDatabase().accounts.updateUser(user.id, { name });
  // The name shows in the top bar on every page, so refresh them all.
  revalidatePath("/", "layout");
  return { ok: true, message: "Name saved." };
}

// Changing email, step one: a code goes to the new address. The change
// happens only when that code is entered, which proves the address is
// really theirs.
export type EmailChangeState = { sentTo?: string; error?: string; done?: string } | null;

export async function requestEmailChangeAction(_previous: EmailChangeState, form: FormData): Promise<EmailChangeState> {
  const user = await requireUser();
  const email = normalizeEmail(text(form, "email"));
  if (!email) return { error: "That doesn't look like an email address." };
  if (email === user.email) return { error: "That's already your email." };
  if (await requireDatabase().accounts.findUserByEmail(email)) return { error: `${email} already has an account.` };
  const result = await requestCode(authDeps(), { email, userId: user.id });
  return result.ok ? { sentTo: email } : { error: result.error };
}

// Step two: check the code and switch the account to the new address.
export async function confirmEmailChangeAction(_previous: EmailChangeState, form: FormData): Promise<EmailChangeState> {
  const user = await requireUser();
  const email = text(form, "email");
  const result = await checkCode(authDeps(), { email, code: text(form, "code"), userId: user.id });
  if (!result.ok) return { sentTo: email, error: result.error };
  revalidatePath("/", "layout");
  return { done: `Your email is now ${email}.` };
}

// Delete the account with all its charts and sessions. There's no undo.
export async function deleteAccountAction(): Promise<void> {
  const user = await requireUser();
  await requireDatabase().accounts.deleteUser(user.id);
  // Its sessions are gone from the database; remove this browser's cookie.
  await clearSessionCookie();
  redirect("/");
}
