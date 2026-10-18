"use client";

import Link from "next/link";
import { Button, countsByKind, Panel } from "../ui";
import type { PanelProps } from "./types";

// Hand the viewer a file to save.
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

// The school this chart uses, with a way to download its data. Importing
// and editing schools happens on the Schools page.
export function SchoolPanel({ state }: PanelProps) {
  const { data } = state.school;
  return (
    <Panel title="School">
      <p className="mb-2 text-sm">
        {data.school.name}
        <span className="block text-xs text-zinc-500">
          {countsByKind(data.objects)} · {data.templates.length} programs · {data.equivalencyTable.length}{" "}
          equivalency rows
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() =>
            download(`${data.school.id}.json`, JSON.stringify(data, null, 2) + "\n", "application/json")
          }
        >
          Export this school
        </Button>
        <Link href="/schools" className="text-sm text-sky-700 underline dark:text-sky-400">
          All schools
        </Link>
      </div>
    </Panel>
  );
}
