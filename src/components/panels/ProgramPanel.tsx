"use client";

import { useState } from "react";
import type { TemplateRef } from "../../engine/index";
import { Button, Panel, Select } from "../ui";
import type { PanelProps } from "./types";

const refKey = (ref: TemplateRef) => `${ref.templateId}@${ref.version}`;
const parseKey = (key: string): TemplateRef => {
  const [templateId, version] = key.split("@");
  return { templateId, version };
};

export function ProgramPanel({ state, dispatch }: PanelProps) {
  const { library } = state.school;
  const pinned = state.chart.pinnedTemplates ?? [];
  const options = library.map((t) => ({ key: refKey({ templateId: t.id, version: t.version }), template: t }));
  const addable = options.filter(({ template }) => !pinned.some((p) => p.templateId === template.id));

  // Default to the program the chart is on now.
  const [startKey, setStartKey] = useState(pinned[0] ? refKey(pinned[0]) : (options[0]?.key ?? ""));
  const [addKey, setAddKey] = useState("");

  return (
    <Panel title="Programs">
      <ul className="mb-3 space-y-1 text-sm">
        {pinned.length === 0 && <li className="text-zinc-500">No program yet.</li>}
        {pinned.map((ref) => {
          const template = library.find((t) => t.id === ref.templateId && t.version === ref.version);
          return (
            <li key={refKey(ref)} className="flex justify-between gap-2">
              <span>{template?.name ?? ref.templateId}</span>
              <span className="text-zinc-500 tabular-nums">{ref.version}</span>
            </li>
          );
        })}
      </ul>

      <label className="mb-1 block text-xs text-zinc-500">Start over from a program</label>
      <div className="mb-3 flex gap-2">
        <Select className="flex-1" value={startKey} onChange={(e) => setStartKey(e.target.value)}>
          {options.map(({ key, template }) => (
            <option key={key} value={key}>
              {template.name} ({template.version})
            </option>
          ))}
        </Select>
        <Button
          disabled={!startKey}
          onClick={() => {
            if (window.confirm("Replace your current plan with this program's suggested plan?")) {
              dispatch({ type: "startProgram", ref: parseKey(startKey) });
            }
          }}
        >
          Start
        </Button>
      </div>

      <label className="mb-1 block text-xs text-zinc-500">Add a minor or second program</label>
      <div className="flex gap-2">
        <Select className="flex-1" value={addKey} onChange={(e) => setAddKey(e.target.value)}>
          <option value="">Choose…</option>
          {addable.map(({ key, template }) => (
            <option key={key} value={key}>
              {template.name} ({template.version})
            </option>
          ))}
        </Select>
        <Button
          disabled={!addKey}
          onClick={() => {
            dispatch({ type: "addProgram", ref: parseKey(addKey) });
            setAddKey("");
          }}
        >
          Add
        </Button>
      </div>
    </Panel>
  );
}
