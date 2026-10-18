"use client";

import { useActionState, useState, useTransition } from "react";
import {
  confirmEmailChangeAction,
  deleteAccountAction,
  requestEmailChangeAction,
  updateNameAction,
  type FormResult,
} from "../../app/(site)/settings/actions";
import { Button, inputClass } from "../ui";
import { CODE_LENGTH, CodeBoxes, emptyCode } from "./CodeBoxes";

function Message({ result }: { result: FormResult }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      {result.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
      {result.error}
    </p>
  );
}

// One text field with a button, e.g. "Name [ Ana ] Save".
function FieldForm({
  action,
  name,
  label,
  type,
  defaultValue,
  button,
}: {
  action: (previous: FormResult, form: FormData) => Promise<FormResult>;
  name: string;
  label: string;
  type: "text" | "email";
  defaultValue: string;
  button: string;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">{label}</span>
        <div className="flex gap-2">
          <input
            name={name}
            type={type}
            required
            defaultValue={defaultValue}
            autoComplete={type === "email" ? "email" : "name"}
            className={`${inputClass} flex-1`}
          />
          <Button type="submit" disabled={pending}>
            {button}
          </Button>
        </div>
      </label>
      <Message result={result} />
    </form>
  );
}

export function NameForm({ name }: { name: string }) {
  return <FieldForm action={updateNameAction} name="name" label="Name" type="text" defaultValue={name} button="Save" />;
}

// Change email: type the new address, then the code sent to it.
export function EmailForm({ email }: { email: string }) {
  const [request, requestAction, requesting] = useActionState(requestEmailChangeAction, null);
  const [confirm, confirmAction, confirming] = useActionState(confirmEmailChangeAction, null);
  const sentTo = request?.sentTo;
  // Kept in state so a wrong guess doesn't empty the boxes (React empties
  // a form after each submit).
  const [code, setCode] = useState(emptyCode);

  if (confirm?.done) return <Message result={{ ok: true, message: confirm.done }} />;
  if (sentTo) {
    return (
      <form action={confirmAction} className="space-y-2">
        <input type="hidden" name="email" value={sentTo} />
        <div className="grid gap-1">
          <span id="email-code-label" className="text-xs text-zinc-500">
            Enter the code sent to <strong className="font-semibold">{sentTo}</strong>
          </span>
          <div role="group" aria-labelledby="email-code-label" className="max-w-xs">
            <CodeBoxes name="code" value={code} onChange={setCode} autoFocus />
          </div>
        </div>
        <Button type="submit" disabled={confirming || code.join("").length < CODE_LENGTH}>
          Confirm
        </Button>
        {confirm?.error && <Message result={{ ok: false, error: confirm.error }} />}
        <p className="text-xs text-zinc-500">Until you confirm, your email stays {email}.</p>
      </form>
    );
  }
  return (
    <form action={requestAction} className="space-y-2">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">Email</span>
        <div className="flex gap-2">
          <input name="email" type="email" required defaultValue={email} autoComplete="email" className={`${inputClass} flex-1`} />
          <Button type="submit" disabled={requesting}>
            Change
          </Button>
        </div>
      </label>
      {request?.error && <Message result={{ ok: false, error: request.error }} />}
    </form>
  );
}

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      className="border border-rose-300 dark:border-rose-800"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Delete your account and all your charts? This can't be undone.")) {
          startTransition(() => deleteAccountAction());
        }
      }}
    >
      {pending ? "Deleting…" : "Delete account"}
    </Button>
  );
}
