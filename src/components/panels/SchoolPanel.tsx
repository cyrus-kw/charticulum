"use client";

import { useState } from "react";
import { loadSchool, parseSchoolData } from "../../engine/index";
import { Panel } from "../ui";
import type { PanelProps } from "./types";

const SAMPLE_PATH = "/samples/example-state-university.json";

// Swap in another school's data from a JSON file.
export function SchoolPanel({ state, dispatch }: PanelProps) {
  const [errors, setErrors] = useState<string[]>([]);

  const importFile = async (file: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setErrors([`${file.name} is not valid JSON.`]);
      return;
    }
    const result = parseSchoolData(json);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!window.confirm(`Load ${result.data.school.name}? This replaces your current plan.`)) return;
    setErrors([]);
    dispatch({ type: "loadSchool", school: loadSchool(result.data) });
  };

  return (
    <Panel title="School">
      <p className="mb-2 text-sm">{state.school.data.school.name}</p>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-zinc-500">Import school data (JSON)</span>
        <input
          type="file"
          accept="application/json,.json"
          className="block w-full text-sm file:mr-2 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-2 file:py-1 dark:file:border-zinc-700 dark:file:bg-zinc-900"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <a className="mt-2 inline-block text-sm text-sky-700 underline dark:text-sky-400" href={SAMPLE_PATH} download>
        Download the sample format
      </a>
      {errors.length > 0 && (
        <div role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          <p className="font-semibold">That file has problems:</p>
          <ul className="list-disc pl-5">
            {errors.slice(0, 10).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 10 && <li>…and {errors.length - 10} more</li>}
          </ul>
        </div>
      )}
    </Panel>
  );
}
