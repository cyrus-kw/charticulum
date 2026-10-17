"use client";

import { useMemo, useState } from "react";
import { Button, inputClass, Panel } from "../ui";
import type { PanelProps } from "./types";

// AP exams, transfer courses, and other work done elsewhere. Anything the
// school recognizes lands in Pre-Credit automatically.
export function ExternalCreditPanel({ state, dispatch }: PanelProps) {
  const { catalog } = state.school;
  const [institution, setInstitution] = useState("");
  const [externalId, setExternalId] = useState("");

  // Everything the catalog knows how to credit, for suggestions.
  const known = useMemo(
    () =>
      [...catalog.values()].flatMap((object) =>
        object.externalEquivalents.map((e) => ({ ...e, objectId: object.id })),
      ),
    [catalog],
  );
  const institutions = [...new Set(known.map((k) => k.institution))];
  const creditsFor = (inst: string, id: string) =>
    known.filter((k) => k.institution === inst && k.externalId === id).map((k) => k.objectId);

  const add = () => {
    if (!institution.trim() || !externalId.trim()) return;
    dispatch({ type: "addExternal", work: { institution: institution.trim(), externalId: externalId.trim() } });
    setExternalId("");
  };

  return (
    <Panel title="Pre-Credit (AP, transfer)">
      <ul className="mb-2 space-y-1 text-sm">
        {state.chart.completedExternal.length === 0 && <li className="text-zinc-500">None added.</li>}
        {state.chart.completedExternal.map((work) => {
          const counts = creditsFor(work.institution, work.externalId);
          return (
            <li key={`${work.institution}|${work.externalId}`} className="flex items-center justify-between gap-2">
              <span>
                {work.institution} {work.externalId}{" "}
                <span className="text-zinc-500">→ {counts.length ? counts.join(", ") : "no match"}</span>
              </span>
              <Button variant="danger" aria-label={`Remove ${work.institution} ${work.externalId}`} onClick={() => dispatch({ type: "removeExternal", work })}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      <form
        className="grid grid-cols-[1fr_1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          autoComplete="off"
          className={inputClass}
          placeholder="Institution"
          aria-label="Institution"
          list="known-institutions"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
        <input
          autoComplete="off"
          className={inputClass}
          placeholder="Course / exam"
          aria-label="Course or exam id"
          list="known-external-ids"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
        />
        <Button type="submit">Add</Button>
        <datalist id="known-institutions">
          {institutions.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
        <datalist id="known-external-ids">
          {known
            .filter((k) => !institution || k.institution === institution)
            .map((k) => (
              <option key={`${k.institution}|${k.externalId}`} value={k.externalId}>
                {k.objectId}
              </option>
            ))}
        </datalist>
      </form>
    </Panel>
  );
}
