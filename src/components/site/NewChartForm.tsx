"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createChartAction } from "../../app/actions";
import type { SchoolChoice } from "../../server/site";
import { Button, inputClass, Select } from "../ui";

// Pick a school and a program; the server makes the chart and opens it.
export function NewChartForm({ schools }: { schools: SchoolChoice[] }) {
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const programs = schools.find((s) => s.id === schoolId)?.programs ?? [];

  return (
    // A form whose action is a server action: submitting sends the fields
    // (by their `name`) to createChartAction on the server.
    <form action={createChartAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">School</span>
        <Select name="schoolId" className="h-9" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      {/* key: a new list of programs when the school changes, starting
          from its first program again. */}
      <label key={schoolId} className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">Program</span>
        <Select name="program" className="h-9" defaultValue={programs[0] ? `${programs[0].templateId}@${programs[0].version}` : ""}>
          {programs.map((p) => (
            <option key={`${p.templateId}@${p.version}`} value={`${p.templateId}@${p.version}`}>
              {p.name} ({p.version})
            </option>
          ))}
          <option value="">Empty plan</option>
        </Select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs text-zinc-500">Name (optional)</span>
        <input name="name" autoComplete="off" maxLength={200} className={`${inputClass} h-9`} placeholder="My plan" />
      </label>
      <SubmitButton />
    </form>
  );
}

// useFormStatus reads the state of the form this button is inside, so it
// has to be its own component.
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="h-9" disabled={pending}>
      {pending ? "Creating…" : "New chart"}
    </Button>
  );
}
