"use client";

import { useState, type ChangeEvent } from "react";
import {
  loadSchool,
  mergeEquivalencyRows,
  parseEquivalencyCsv,
  parseSchoolData,
  type SchoolData,
} from "../../engine/index";
import { loadSampleSchool } from "../../fixtures/sampleSchool";
import { forgetSchool, rememberSchool } from "../../storage/schoolMemory";
import { Button, Panel } from "../ui";
import type { PanelProps } from "./types";

const SAMPLE_PATH = "/samples/example-state-university.json";
const SAMPLE_CSV_PATH = "/samples/transfer-table.csv";

const fileInputClass =
  "block w-full text-sm file:mr-2 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-2 file:py-1 dark:file:border-zinc-700 dark:file:bg-zinc-900";

// Hand the viewer a file to save.
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

// Swap in another school's data, add a transfer table, or export the data.
export function SchoolPanel({ state, dispatch }: PanelProps) {
  const { data } = state.school;
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const report = (problems: string[], heading: string) => {
    setNotice(null);
    setErrors([heading, ...problems]);
  };

  const importSchool = async (file: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return report([], `${file.name} is not valid JSON.`);
    }
    const result = parseSchoolData(json);
    if (!result.ok) return report(result.errors, "That file has problems:");
    if (!window.confirm(`Load ${result.data.school.name}? This replaces your current plan.`)) return;
    rememberSchool(result.data);
    setErrors([]);
    setNotice(`Loaded ${result.data.school.name}.`);
    dispatch({ type: "loadSchool", school: loadSchool(result.data) });
  };

  const importTransferTable = async (file: File) => {
    const csv = parseEquivalencyCsv(await file.text());
    if (!csv.ok) return report(csv.errors, "That table has problems:");
    const before = data.equivalencyTable.length;
    const next: SchoolData = {
      ...data,
      equivalencyTable: mergeEquivalencyRows(data.equivalencyTable, csv.rows),
    };
    // Check the combined data, e.g. that every row names a real object.
    const result = parseSchoolData(next);
    if (!result.ok) return report(result.errors, "That table has problems:");
    rememberSchool(result.data);
    setErrors([]);
    setNotice(`Added ${result.data.equivalencyTable.length - before} equivalency row(s).`);
    dispatch({ type: "updateSchool", school: loadSchool(result.data) });
  };

  const onFile = (handle: (file: File) => Promise<void>) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handle(file);
    e.target.value = "";
  };

  return (
    <Panel title="School">
      <p className="mb-2 text-sm">
        {data.school.name}
        <span className="block text-xs text-zinc-500">
          {data.objects.length} objects · {data.templates.length} templates · {data.equivalencyTable.length}{" "}
          equivalency rows
        </span>
      </p>

      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-xs text-zinc-500">Import school data (JSON)</span>
        <input type="file" accept="application/json,.json" className={fileInputClass} onChange={onFile(importSchool)} />
      </label>

      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-xs text-zinc-500">
          Add a transfer / AP table (CSV: institution,externalId,objectId)
        </span>
        <input type="file" accept="text/csv,.csv" className={fileInputClass} onChange={onFile(importTransferTable)} />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            download(`${data.school.id}.json`, JSON.stringify(data, null, 2) + "\n", "application/json")
          }
        >
          Export this school
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (!window.confirm("Switch back to the sample school? This replaces your current plan.")) return;
            forgetSchool();
            setErrors([]);
            setNotice(null);
            dispatch({ type: "loadSchool", school: loadSampleSchool() });
          }}
        >
          Use sample school
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 text-sm">
        <a className="text-sky-700 underline dark:text-sky-400" href={SAMPLE_PATH} download>
          Sample school (JSON)
        </a>
        <a className="text-sky-700 underline dark:text-sky-400" href={SAMPLE_CSV_PATH} download>
          Sample transfer table (CSV)
        </a>
      </div>

      {notice && (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          <p className="font-semibold">{errors[0]}</p>
          <ul className="list-disc pl-5">
            {errors.slice(1, 11).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 11 && <li>…and {errors.length - 11} more</li>}
          </ul>
        </div>
      )}
    </Panel>
  );
}
