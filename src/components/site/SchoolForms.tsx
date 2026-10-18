"use client";

import { useActionState } from "react";
import { addTransferTableAction, importSchoolAction } from "../../app/actions";
import { Button, cn } from "../ui";

const fileInputClass =
  "block w-full text-sm file:mr-2 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-2 file:py-1 dark:file:border-zinc-700 dark:file:bg-zinc-900";

// What a form's last submit said: a success line, or a list of problems.
function Result({ ok, text, errors }: { ok: boolean; text?: string; errors?: string[] }) {
  if (ok) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {text}
      </p>
    );
  }
  return (
    <div role="alert" className="text-sm text-rose-700 dark:text-rose-400">
      <p className="font-semibold">That file has problems:</p>
      <ul className="list-disc pl-5">
        {errors?.slice(0, 10).map((e) => <li key={e}>{e}</li>)}
        {errors && errors.length > 10 && <li>…and {errors.length - 10} more</li>}
      </ul>
    </div>
  );
}

// Add a school from a JSON file (or replace the one with the same id).
export function ImportSchoolForm() {
  // useActionState runs the server action on submit and keeps what it
  // returned (`result`), so the form can show it. `pending` is true while
  // it runs.
  const [result, action, pending] = useActionState(importSchoolAction, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-zinc-500">School data (JSON)</span>
        <input name="file" type="file" accept="application/json,.json" required className={fileInputClass} />
      </label>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Importing…" : "Import school"}
      </Button>
      {result && (
        <Result ok={result.ok} text={result.ok ? `Saved ${result.school.name}.` : undefined} errors={result.ok ? undefined : result.errors} />
      )}
    </form>
  );
}

// Add a transfer / AP table (CSV) to one school.
export function TransferTableForm({ schoolId, className }: { schoolId: string; className?: string }) {
  const [result, action, pending] = useActionState(addTransferTableAction, null);
  return (
    <form action={action} className={cn("space-y-2", className)}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-zinc-500">
          Add a transfer / AP table (CSV: institution,externalId,objectId)
        </span>
        <input name="file" type="file" accept="text/csv,.csv" required className={fileInputClass} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add table"}
      </Button>
      {result && (
        <Result
          ok={result.ok}
          text={result.ok ? `Added ${result.added} equivalency row(s).` : undefined}
          errors={result.ok ? undefined : result.errors}
        />
      )}
    </form>
  );
}
