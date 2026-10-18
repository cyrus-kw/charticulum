"use client";

import { useActionState, useState } from "react";
import { requestSignInAction, verifyCodeAction } from "../../app/auth/actions";
import { Button, inputClass } from "../ui";

const errorClass = "text-sm text-rose-700 dark:text-rose-400";

// Settings for a box where a 6-digit code is typed. "one-time-code" lets
// phones offer the code from the email or message as a suggestion, and
// inputMode "numeric" shows the number keypad.
export const CODE_INPUT = {
  type: "text",
  inputMode: "numeric",
  autoComplete: "one-time-code",
  pattern: "[0-9 ]{6,7}",
  maxLength: 7,
  required: true,
  placeholder: "123456",
} as const;

// Sign in: type your email, then the code sent to it.
export function SignInForm({ showTerminalHint }: { showTerminalHint: boolean }) {
  const [state, action, pending] = useActionState(requestSignInAction, null);
  if (state && "sentTo" in state) return <CodeForm email={state.sentTo} showTerminalHint={showTerminalHint} />;
  return (
    <form action={action} className="space-y-3">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">Email</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a code"}
      </Button>
      {state && "error" in state && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      <p className="text-xs text-zinc-500">No password needed. A new email makes a new account.</p>
    </form>
  );
}

// Step two: the code, and a name if this email has no account yet.
function CodeForm({ email, showTerminalHint }: { email: string; showTerminalHint: boolean }) {
  const [state, action, pending] = useActionState(verifyCodeAction, null);
  const needName = state?.needName ?? false;
  // React empties a form's boxes after each submit. Keeping these two in
  // state ("controlled" inputs) holds on to them, so the code is still
  // there when the name box appears.
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  return (
    <form action={action} className="space-y-3">
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
        We sent a 6-digit code to {email}. It works for 15 minutes.
        {showTerminalHint && (
          <span className="block text-zinc-500">While developing, the email is printed in the terminal running the app.</span>
        )}
      </p>
      <input type="hidden" name="email" value={email} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">Code</span>
        {/* Once the code is accepted and a name is needed, the code box
            stays filled in but can't be edited. */}
        <input
          name="code"
          {...CODE_INPUT}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          readOnly={needName}
          className={`${inputClass} tracking-widest`}
        />
      </label>
      {needName && (
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-zinc-500">Welcome! Your name</span>
          <input
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
      )}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "One moment…" : needName ? "Create account" : "Sign in"}
      </Button>
      {state?.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      {/* A plain link reloads the page, starting over with a new email. */}
      <a href="/sign-in" className="block text-xs text-sky-700 underline dark:text-sky-400">
        Use a different email or get a new code
      </a>
    </form>
  );
}
