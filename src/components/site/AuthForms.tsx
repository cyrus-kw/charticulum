"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { requestSignInAction, resendCodeAction, verifyCodeAction } from "../../app/auth/actions";
import { Button, cn, inputClass } from "../ui";
import { CODE_LENGTH, CodeBoxes, emptyCode } from "./CodeBoxes";

// Seconds to wait before "Resend code" can be pressed.
const RESEND_SECONDS = 60;

const errorClass = "text-sm text-rose-700 dark:text-rose-400";

// The home page's way in: a "Sign in" button that turns into the email
// form, which then turns into the code form.
export function SignIn({ showTerminalHint }: { showTerminalHint: boolean }) {
  const [open, setOpen] = useState(false);
  // Changing a component's key makes React start it over from scratch,
  // which is how "use a different email" empties the forms.
  const [attempt, setAttempt] = useState(0);
  if (!open) {
    return (
      <Button variant="primary" className="px-4 py-2 text-base" onClick={() => setOpen(true)}>
        Sign in to start planning
      </Button>
    );
  }
  return (
    <div className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-6 text-left dark:border-zinc-800 dark:bg-zinc-900">
      <SignInForm
        key={attempt}
        showTerminalHint={showTerminalHint}
        onStartOver={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}

// Type your email, then the code sent to it.
function SignInForm({ showTerminalHint, onStartOver }: { showTerminalHint: boolean; onStartOver: () => void }) {
  const [state, action, pending] = useActionState(requestSignInAction, null);
  if (state && "sentTo" in state) {
    return <CodeForm email={state.sentTo} showTerminalHint={showTerminalHint} onStartOver={onStartOver} />;
  }
  return (
    <form action={action} className="space-y-3">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">Email</span>
        <input name="email" type="email" required autoComplete="email" autoFocus className={inputClass} />
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
function CodeForm({
  email,
  showTerminalHint,
  onStartOver,
}: {
  email: string;
  showTerminalHint: boolean;
  onStartOver: () => void;
}) {
  const [state, action, pending] = useActionState(verifyCodeAction, null);
  const needName = state?.needName ?? false;
  // React empties a form's boxes after each submit. Keeping these two in
  // state ("controlled" inputs) holds on to them, so the code is still
  // there when the name box appears.
  const [code, setCode] = useState(emptyCode);
  const [name, setName] = useState("");
  const resend = useResend(email);

  return (
    <form action={action} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Sign in</h2>
        <p role="status" className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Enter the code sent to <strong className="font-semibold text-ink dark:text-zinc-100">{email}</strong>
        </p>
        {showTerminalHint && (
          <p className="mt-1 text-xs text-zinc-500">While developing, the email is printed in the terminal running the app.</p>
        )}
      </div>
      <input type="hidden" name="email" value={email} />
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between text-sm">
          <span id="code-label" className="text-xs text-zinc-500">
            Code
          </span>
          <button
            type="button"
            onClick={resend.send}
            disabled={!resend.ready || needName}
            className={cn(
              "text-xs",
              resend.ready && !needName
                ? "text-sky-700 hover:underline dark:text-sky-400"
                : "cursor-default text-zinc-400 dark:text-zinc-600",
            )}
          >
            {resend.sending ? "Sending…" : resend.ready ? "Resend code" : `Resend code (${resend.secondsLeft})`}
          </button>
        </div>
        {/* Once the code is accepted and a name is needed, the code stays
            filled in but can't be edited. */}
        <div role="group" aria-labelledby="code-label">
          <CodeBoxes name="code" value={code} onChange={setCode} readOnly={needName} autoFocus />
        </div>
      </div>
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
      <Button
        type="submit"
        variant="primary"
        className="h-11 w-full text-base"
        disabled={pending || code.join("").length < CODE_LENGTH}
      >
        {pending ? "One moment…" : needName ? "Create account" : "Continue"}
      </Button>
      {state?.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      {resend.message && (
        <p role="status" className={resend.failed ? errorClass : "text-sm text-emerald-700 dark:text-emerald-400"}>
          {resend.message}
        </p>
      )}
      <button type="button" onClick={onStartOver} className="block text-xs text-sky-700 underline dark:text-sky-400">
        Use a different email
      </button>
    </form>
  );
}

// "Resend code": a countdown, then a button that emails a new code.
function useResend(email: string) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [sending, startSending] = useTransition();
  const [result, setResult] = useState<{ message: string; failed: boolean } | null>(null);

  // Count down once a second until zero. The effect runs again each time
  // secondsLeft changes, scheduling the next tick.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const send = () =>
    startSending(async () => {
      const { error } = await resendCodeAction(email);
      setResult(error ? { message: error, failed: true } : { message: "We sent a new code.", failed: false });
      if (!error) setSecondsLeft(RESEND_SECONDS);
    });

  return { secondsLeft, ready: secondsLeft <= 0 && !sending, sending, send, message: result?.message, failed: result?.failed };
}
