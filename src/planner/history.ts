// Undo and redo for the planner: a list of earlier states (past), the
// current one, and the ones undone so far (future).
import { plannerReducer, type PlannerAction, type PlannerState } from "./state";

export interface PlannerHistory {
  past: PlannerState[];
  present: PlannerState;
  future: PlannerState[];
}

export type HistoryAction = PlannerAction | { type: "undo" } | { type: "redo" };

// Changes to the plan itself, which undo can take back.
const UNDOABLE = new Set<PlannerAction["type"]>([
  "move",
  "remove",
  "addTerm",
  "removeTerm",
  "insertTerm",
  "setGrade",
  "addExternal",
  "removeExternal",
  "addOverride",
  "removeOverride",
  "build",
  "startProgram",
  "addProgram",
]);

// A different plan or school altogether: undo history no longer applies.
const RESETS = new Set<PlannerAction["type"]>(["loadSchool", "loadChart"]);

// How many changes undo remembers.
export const HISTORY_LIMIT = 100;

export function startHistory(present: PlannerState): PlannerHistory {
  return { past: [], present, future: [] };
}

// Going back (or forward) to `target` from the current state. Some things
// aren't part of the plan and stay as they are now: the school data, which
// saved copy this is, and (cleared) the selection. If the step crosses a
// whole new plan (e.g. undoing "Build for me"), it's laid out fresh.
function travel(present: PlannerState, target: PlannerState): PlannerState {
  return {
    ...target,
    school: present.school,
    savedId: present.savedId,
    selectedId: null,
    layoutVersion: target.layoutVersion === present.layoutVersion ? present.layoutVersion : present.layoutVersion + 1,
  };
}

export function historyReducer(history: PlannerHistory, action: HistoryAction): PlannerHistory {
  const { past, present, future } = history;

  if (action.type === "undo") {
    if (past.length === 0) return history;
    return {
      past: past.slice(0, -1),
      present: travel(present, past[past.length - 1]),
      future: [present, ...future],
    };
  }
  if (action.type === "redo") {
    if (future.length === 0) return history;
    return {
      past: [...past, present],
      present: travel(present, future[0]),
      future: future.slice(1),
    };
  }

  const next = plannerReducer(present, action);
  if (next === present) return history;
  if (RESETS.has(action.type)) return startHistory(next);
  if (UNDOABLE.has(action.type)) {
    return { past: [...past, present].slice(-HISTORY_LIMIT), present: next, future: [] };
  }
  // Selection, renaming, saving, school updates: not undo steps.
  return { past, present: next, future };
}
