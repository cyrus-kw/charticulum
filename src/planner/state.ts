// The planner's state and every change a user can make to it, as plain
// functions with no React in them, so they can be tested directly.
//
// This uses the "reducer" pattern: the UI sends an action such as
// { type: "move", objectId: "CS102", termIndex: 3 }, and plannerReducer
// returns the next state. State is never edited in place; each action
// produces a new object, which is how React knows something changed.
import {
  applyExternalEquivalents,
  compareSlots,
  slotBeside,
  buildChart,
  checkChart,
  forkTemplate,
  latestTemplate,
  findTemplate,
  mergeCharts,
  resolveRequirements,
  slotLabel,
  termCalendar,
  EXTERNAL_TERM,
  EXTERNAL_TERM_LABEL,
  type Chart,
  type ChartCheck,
  type ChartIssue,
  type CompletedExternal,
  type Grade,
  type LoadedSchool,
  type Override,
  type Requirements,
  type Season,
  type TemplateRef,
  type Term,
} from "../engine/index";
import { arrangeChart } from "./layout";
import { concurrentBlock } from "./ordering";

export interface PlannerState {
  school: LoadedSchool;
  // The student's chart as they edited it. Pre-Credit is filled in from
  // completedExternal when the chart is checked (see derive below).
  chart: Chart;
  selectedId: string | null;
  // Problems the builder hit on its last run, if any.
  builderIssues: ChartIssue[];
  // The saved copy this chart belongs to; null until it's first saved.
  savedId: string | null;
  // Goes up whenever a whole new plan appears (built, started from a
  // program, merged with another, or opened), so the chart lays it out
  // fresh instead of keeping cards where the old plan had them.
  layoutVersion: number;
}

export type PlannerAction =
  | { type: "loadSchool"; school: LoadedSchool }
  | { type: "updateSchool"; school: LoadedSchool }
  | { type: "loadChart"; chart: Chart; savedId: string }
  | { type: "saved"; savedId: string | null }
  | { type: "startProgram"; ref: TemplateRef }
  | { type: "addProgram"; ref: TemplateRef }
  | { type: "build" }
  | { type: "rename"; name: string }
  | { type: "select"; objectId: string | null }
  // `position`: where in the term's top-to-bottom order (an index among
  // the term's other courses); missing means at the bottom.
  | { type: "move"; objectId: string; termIndex: number; position?: number }
  | { type: "remove"; objectId: string }
  | { type: "addTerm" }
  | { type: "removeTerm"; termIndex: number }
  | { type: "insertTerm"; termIndex: number; side: TermSide; season: Season }
  | { type: "setGrade"; objectId: string; grade: Grade | null }
  | { type: "addExternal"; work: CompletedExternal }
  | { type: "removeExternal"; work: CompletedExternal }
  | { type: "addOverride"; override: Override }
  | { type: "removeOverride"; id: string };

export function initialState(school: LoadedSchool, programId?: string): PlannerState {
  const template = programId
    ? latestTemplate(school.library, programId)
    : school.library[school.library.length - 1];
  const chart: Chart = template
    ? arrangeChart(school.catalog, forkTemplate(template))
    : { name: "My plan", terms: [emptyTermZero()], completedExternal: [] };
  return { school, chart, selectedId: null, builderIssues: [], savedId: null, layoutVersion: 0 };
}

const emptyTermZero = (): Term => ({ index: EXTERNAL_TERM, label: EXTERNAL_TERM_LABEL, objectIds: [] });

const sameWork = (a: CompletedExternal, b: CompletedExternal) =>
  a.institution === b.institution && a.externalId === b.externalId;

// Remove an object from every term.
const without = (terms: Term[], objectId: string): Term[] =>
  terms.map((term) => ({ ...term, objectIds: term.objectIds.filter((id) => id !== objectId) }));

// The term that comes after the chart's last one, following the school calendar.
export function nextTerm(chart: Chart, seasons: LoadedSchool["data"]["calendar"]["seasons"]): Term {
  const last = chart.terms[chart.terms.length - 1];
  const index = (last?.index ?? 0) + 1;
  if (last?.season && last.year !== undefined && seasons.includes(last.season)) {
    const [, slot] = termCalendar({ season: last.season, year: last.year }, seasons, 2);
    return { index, label: slotLabel(slot), season: slot.season, year: slot.year, objectIds: [] };
  }
  return { index, label: `Term ${index}`, objectIds: [] };
}

// Number the terms 1, 2, 3, ... in order, with no gaps (Pre-Credit stays
// 0). A plain "Term 4" label is renamed to match its new number; a term
// with a season and year keeps its label.
function renumber(terms: Term[]): Term[] {
  let next = 1;
  return terms.map((t) => {
    if (t.index === EXTERNAL_TERM) return t;
    const index = next++;
    const label = t.label === `Term ${t.index}` ? `Term ${index}` : t.label;
    return { ...t, index, label };
  });
}

// Can this term be removed? Not Pre-Credit, and not the only term left.
export function canRemoveTerm(chart: Chart, termIndex: number): boolean {
  const planned = chart.terms.filter((t) => t.index !== EXTERNAL_TERM);
  return planned.length > 1 && planned.some((t) => t.index === termIndex);
}

// The chart without one term. Its courses come off the chart with it, and
// the terms after it are renumbered. Each term keeps its season and year,
// so removing Spring 2027 leaves a plan that skips that semester.
export function removeTerm(chart: Chart, termIndex: number): Chart {
  if (!canRemoveTerm(chart, termIndex)) return chart;
  return { ...chart, terms: renumber(chart.terms.filter((t) => t.index !== termIndex)) };
}

export type TermSide = "before" | "after";

// The new, empty term that adding `season` right before or after a term
// would make (the nearest such season in the calendar), or why it can't
// be added there. The terms stay in calendar order, so the new one has to
// fit between the term and its neighbor: after Spring 2027, with Fall 2027
// next, only Summer 2027 fits. Pre-Credit can't have terms beside it.
export function termBeside(
  chart: Chart,
  termIndex: number,
  side: TermSide,
  season: Season,
): { term: Term } | { reason: string } {
  const planned = chart.terms.filter((t) => t.index !== EXTERNAL_TERM);
  const at = planned.findIndex((t) => t.index === termIndex);
  if (at === -1) return { reason: "Terms can only be added beside a planned term." };
  const from = planned[at];
  const name = season[0].toUpperCase() + season.slice(1);
  // Without a season and year there's no calendar to place it in.
  if (!from.season || from.year === undefined) {
    return { term: { index: -1, label: name, season, objectIds: [] } };
  }
  const slot = slotBeside({ season: from.season, year: from.year }, season, side);
  const neighbor = planned[side === "after" ? at + 1 : at - 1];
  if (neighbor?.season && neighbor.year !== undefined) {
    const order = compareSlots(slot, { season: neighbor.season, year: neighbor.year });
    if (order === 0) return { reason: `${slotLabel(slot)} is already in the plan.` };
    if (side === "after" ? order > 0 : order < 0) {
      return { reason: `${slotLabel(slot)} would come ${side} ${neighbor.label}.` };
    }
  }
  return { term: { index: -1, label: slotLabel(slot), season: slot.season, year: slot.year, objectIds: [] } };
}

// The chart with a new, empty term right before or after another one (see
// termBeside). Unchanged if the term can't go there.
export function insertTerm(chart: Chart, termIndex: number, side: TermSide, season: Season): Chart {
  const beside = termBeside(chart, termIndex, side, season);
  if (!("term" in beside)) return chart;
  const at = chart.terms.findIndex((t) => t.index === termIndex) + (side === "after" ? 1 : 0);
  return { ...chart, terms: renumber([...chart.terms.slice(0, at), beside.term, ...chart.terms.slice(at)]) };
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  const { chart, school } = state;
  const withChart = (next: Chart): PlannerState => ({ ...state, chart: next });

  switch (action.type) {
    case "loadSchool":
      return initialState(action.school);

    // New data for the same school (e.g. a transfer table was added):
    // keep the student's plan. A different school starts over.
    case "updateSchool": {
      if (action.school.data.school.id !== school.data.school.id) return initialState(action.school);
      const { selectedId } = state;
      return {
        ...state,
        school: action.school,
        builderIssues: [],
        selectedId: selectedId && action.school.catalog.has(selectedId) ? selectedId : null,
      };
    }

    case "loadChart":
      return {
        ...state,
        chart: action.chart,
        selectedId: null,
        builderIssues: [],
        savedId: action.savedId,
        layoutVersion: state.layoutVersion + 1,
      };

    case "saved":
      return { ...state, savedId: action.savedId };

    case "startProgram": {
      const template = findTemplate(school.library, action.ref);
      if (!template) return state;
      // Keep what the student brings with them: outside credit.
      const fork = forkTemplate(template, chart.name);
      return {
        ...state,
        chart: arrangeChart(school.catalog, { ...fork, completedExternal: chart.completedExternal }),
        selectedId: null,
        builderIssues: [],
        layoutVersion: state.layoutVersion + 1,
      };
    }

    case "addProgram": {
      const template = findTemplate(school.library, action.ref);
      if (!template) return state;
      const alreadyPinned = chart.pinnedTemplates?.some(
        (ref) => ref.templateId === action.ref.templateId,
      );
      if (alreadyPinned) return state;
      return {
        ...withChart(arrangeChart(school.catalog, { ...mergeCharts(chart, forkTemplate(template)), name: chart.name })),
        layoutVersion: state.layoutVersion + 1,
      };
    }

    case "build": {
      const { requirements } = resolveRequirements(school.library, school.globalSets, chart);
      const built = buildChart(school.catalog, requirements, {
        name: chart.name,
        completedExternal: chart.completedExternal,
        calendar: school.data.calendar,
        ...(chart.overrides && { overrides: chart.overrides }),
        ...(chart.grades && { grades: chart.grades }),
      });
      return {
        ...state,
        chart: arrangeChart(school.catalog, {
          ...built.chart,
          ...(chart.pinnedTemplates && { pinnedTemplates: chart.pinnedTemplates }),
        }),
        builderIssues: built.issues,
        selectedId: null,
        layoutVersion: state.layoutVersion + 1,
      };
    }

    case "rename":
      return withChart({ ...chart, name: action.name });

    case "select":
      return { ...state, selectedId: action.objectId };

    case "move": {
      // Pre-Credit only holds outside credit, which is placed automatically.
      if (action.termIndex === EXTERNAL_TERM) return state;
      if (!school.catalog.has(action.objectId)) return state;
      if (!chart.terms.some((t) => t.index === action.termIndex)) return state;
      // Within its own term, a course moves with the courses taken together
      // with it (e.g. a lecture and its lab) as one block. Moving to another
      // term, it goes alone.
      const from = chart.terms.find((t) => t.objectIds.includes(action.objectId));
      const moving =
        from?.index === action.termIndex
          ? concurrentBlock(school.catalog, from.objectIds, action.objectId)
          : [action.objectId];
      const terms = chart.terms
        .map((term) => ({ ...term, objectIds: term.objectIds.filter((id) => !moving.includes(id)) }))
        .map((term) => {
          if (term.index !== action.termIndex) return term;
          const ids = [...term.objectIds];
          const at = Math.min(Math.max(action.position ?? ids.length, 0), ids.length);
          ids.splice(at, 0, ...moving);
          return { ...term, objectIds: ids };
        });
      return withChart({ ...chart, terms });
    }

    case "remove":
      return {
        ...withChart({ ...chart, terms: without(chart.terms, action.objectId) }),
        selectedId: state.selectedId === action.objectId ? null : state.selectedId,
      };

    case "addTerm":
      return withChart({ ...chart, terms: [...chart.terms, nextTerm(chart, school.data.calendar.seasons)] });

    case "removeTerm": {
      const next = removeTerm(chart, action.termIndex);
      if (next === chart) return state;
      // Unselect a course that left the chart with its term.
      const removed = chart.terms.find((t) => t.index === action.termIndex)?.objectIds ?? [];
      const selectedId = state.selectedId && removed.includes(state.selectedId) ? null : state.selectedId;
      return { ...withChart(next), selectedId };
    }

    case "insertTerm": {
      const next = insertTerm(chart, action.termIndex, action.side, action.season);
      return next === chart ? state : withChart(next);
    }

    case "setGrade": {
      const grades = { ...chart.grades };
      if (action.grade) grades[action.objectId] = action.grade;
      else delete grades[action.objectId];
      return withChart({ ...chart, grades });
    }

    case "addExternal":
      if (chart.completedExternal.some((w) => sameWork(w, action.work))) return state;
      return withChart({ ...chart, completedExternal: [...chart.completedExternal, action.work] });

    case "removeExternal":
      return withChart({
        ...chart,
        completedExternal: chart.completedExternal.filter((w) => !sameWork(w, action.work)),
      });

    case "addOverride":
      return withChart({
        ...chart,
        overrides: [...(chart.overrides ?? []).filter((o) => o.id !== action.override.id), action.override],
      });

    case "removeOverride":
      return withChart({
        ...chart,
        overrides: (chart.overrides ?? []).filter((o) => o.id !== action.id),
      });
  }
}

// Everything the UI shows that is computed from the state rather than
// stored: the chart with Pre-Credit applied, its rules, and the check results.
export interface PlannerView {
  chart: Chart;
  requirements: Requirements;
  check: ChartCheck;
  // Problems resolving the chart's pinned templates.
  templateIssues: ChartIssue[];
}

// It reads only the school and the chart (the type makes sure of that), so
// the Planner recomputes it only when one of those changes, not on every
// edit. Selecting a course in particular mustn't redo it: a fresh view
// means a fresh layout, which would yank a card being dragged back home.
export function derive(state: Pick<PlannerState, "school" | "chart">): PlannerView {
  const { school } = state;
  const chart = applyExternalEquivalents(school.catalog, state.chart);
  const resolved = resolveRequirements(school.library, school.globalSets, chart);
  return {
    chart,
    requirements: resolved.requirements,
    check: checkChart(school.catalog, chart, resolved.requirements),
    templateIssues: resolved.issues,
  };
}
