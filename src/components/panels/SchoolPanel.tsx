"use client";

import Link from "next/link";
import { countsByType, Panel } from "../ui";
import type { PanelProps } from "./types";

// The school this chart uses. Importing and editing schools happens on the
// Schools page (admins only).
export function SchoolPanel({ state }: PanelProps) {
  const { data } = state.school;
  return (
    <Panel title="School">
      <p className="mb-2 text-sm">
        {data.school.name}
        <span className="block text-xs text-zinc-500">
          {countsByType(data.objects)} · {data.templates.length} programs · {data.equivalencyTable.length}{" "}
          equivalency rows
        </span>
      </p>
      <Link href="/schools" className="text-sm text-sky-700 underline dark:text-sky-400">
        All schools
      </Link>
    </Panel>
  );
}
