"use client";

import { useState } from "react";
import type { TemplateRef } from "../../engine/index";
import { askToConfirm } from "../ConfirmDialog";
import { ProgramIcon } from "../icons";
import { Popover } from "../TermMenu";
import { Button, ICON_BUTTON, Select, TOOLBAR_BUTTON_SIZE } from "../ui";
import type { PanelProps } from "./types";

const refKey = (ref: TemplateRef) => `${ref.templateId}@${ref.version}`;
const parseKey = (key: string): TemplateRef => {
  const [templateId, version] = key.split("@");
  return { templateId, version };
};

// The menu's width (pixels), so it can line up under the button.
const MENU_WIDTH = 360;

// The programs button in the Plan box's title row (a graduation cap). It
// opens a menu to start the plan over from a program, or add a minor or
// second program to it. (The plan's programs are listed in the Plan box.)
export function ProgramMenu({ state, dispatch }: PanelProps) {
  const { library } = state.school;
  const pinned = state.chart.pinnedTemplates ?? [];
  const options = library.map((t) => ({ key: refKey({ templateId: t.id, version: t.version }), template: t }));
  const addable = options.filter(({ template }) => !pinned.some((p) => p.templateId === template.id));

  // Where the menu opens (window pixels), or null while it's shut.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  // Default to the program the chart is on now.
  const [startKey, setStartKey] = useState(pinned[0] ? refKey(pinned[0]) : (options[0]?.key ?? ""));
  const [addKey, setAddKey] = useState("");
  const close = () => setMenuAt(null);

  return (
    <>
      <button
        type="button"
        aria-label="Programs"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        data-tooltip="Programs"
        onClick={(e) => {
          // Just under the button, lined up with its right edge.
          const box = e.currentTarget.getBoundingClientRect();
          setMenuAt(menuAt ? null : { x: box.right - MENU_WIDTH, y: box.bottom + 4 });
        }}
        style={TOOLBAR_BUTTON_SIZE}
        className={ICON_BUTTON}
      >
        <ProgramIcon />
      </button>
      {menuAt && (
        <Popover x={menuAt.x} y={menuAt.y} width={MENU_WIDTH} height={150} label="Programs" onClose={close}>
          <div className="px-3 py-2">
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
                onClick={async () => {
                  // Shut the menu first, so only the question is showing.
                  close();
                  const message = "Replace your current plan with this program's suggested plan?";
                  if (await askToConfirm({ message, confirmLabel: "Replace" })) {
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
                  close();
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
