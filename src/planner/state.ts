// The planner's state and every change a user can make to it, as plain
// functions with no React in them, so they can be tested directly.
//
// This uses the "reducer" pattern: the UI sends an action such as
// { type: "move", objectId: "CS102", termIndex: 3 }, and plannerReducer
// returns the next state. State is never edited in place; each action
// produces a new object, which is how React knows something changed.
import {
  applyExternalEquivalents,
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
  type Chart,
  type ChartCheck,
  type ChartIssue,
  type CompletedExternal,
  type Grade,
  type LoadedSchool,
  type Override,
  type Requirements,
  type TemplateRef,
  type Term,
} from "../engine/index";

export interface PlannerState {
  school: LoadedSchool;
  // The student's chart as they edited it. Term 0 is filled in from
  // completedExternal when the chart is checked (see derive below).
  chart: Chart;
  selectedId: string | null;
  // Problems the builder hit on its last run, if any.
  builderIssues: ChartIssue[];
  // The saved copy this chart belongs to; null until it's first saved.
  savedId: string | null;
}

export type PlannerAction =
  | { type: "loadSchool"; school: LoadedSchool }
  | { type: "loadChart"; chart: Chart; savedId: string }
  | { type: "saved"; savedId: string | null }
  | { type: "startProgram"; ref: TemplateRef }
  | { type: "addProgram"; ref: TemplateRef }
  | { type: "build" }
  | { type: "rename"; name: string }
  | { type: "select"; objectId: string | null }
  | { type: "move"; objectId: string; termIndex: number }
  | { type: "remove"; objectId: string }
  | { type: "addTerm" }
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
    ? forkTemplate(template)
    : { name: "My plan", terms: [emptyTermZero()], completedExternal: [] };
  return { school, chart, selectedId: null, builderIssues: [], savedId: null };
}

const emptyTermZero = (): Term => ({ index: EXTERNAL_TERM, label: "Term 0 (External)", objectIds: [] });

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

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  const { chart, school } = state;
  const withChart = (next: Chart): PlannerState => ({ ...state, chart: next });

  switch (action.type) {
    case "loadSchool":
      return initialState(action.school);

    case "loadChart":
      return { ...state, chart: action.chart, selectedId: null, builderIssues: [], savedId: action.savedId };

    case "saved":
      return { ...state, savedId: action.savedId };

    case "startProgram": {
      const template = findTemplate(school.library, action.ref);
      if (!template) return state;
      // Keep what the student brings with them: outside credit.
      const fork = forkTemplate(template, chart.name);
      return {
        ...state,
        chart: { ...fork, completedExternal: chart.completedExternal },
        selectedId: null,
        builderIssues: [],
      };
    }

    case "addProgram": {
      const template = findTemplate(school.library, action.ref);
      if (!template) return state;
      const alreadyPinned = chart.pinnedTemplates?.some(
        (ref) => ref.templateId === action.ref.templateId,
      );
      if (alreadyPinned) return state;
      return withChart({ ...mergeCharts(chart, forkTemplate(template)), name: chart.name });
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
        chart: { ...built.chart, ...(chart.pinnedTemplates && { pinnedTemplates: chart.pinnedTemplates }) },
        builderIssues: built.issues,
        selectedId: null,
      };
    }

    case "rename":
      return withChart({ ...chart, name: action.name });

    case "select":
      return { ...state, selectedId: action.objectId };

    case "move": {
      // Term 0 only holds outside credit, which is placed automatically.
      if (action.termIndex === EXTERNAL_TERM) return state;
      if (!school.catalog.has(action.objectId)) return state;
      if (!chart.terms.some((t) => t.index === action.termIndex)) return state;
      const terms = without(chart.terms, action.objectId).map((term) =>
        term.index === action.termIndex
          ? { ...term, objectIds: [...term.objectIds, action.objectId] }
          : term,
      );
      return withChart({ ...chart, terms });
    }

    case "remove":
      return {
        ...withChart({ ...chart, terms: without(chart.terms, action.objectId) }),
        selectedId: state.selectedId === action.objectId ? null : state.selectedId,
      };

    case "addTerm":
      return withChart({ ...chart, terms: [...chart.terms, nextTerm(chart, school.data.calendar.seasons)] });

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
// stored: the chart with Term 0 applied, its rules, and the check results.
export interface PlannerView {
  chart: Chart;
  requirements: Requirements;
  check: ChartCheck;
  // Problems resolving the chart's pinned templates.
  templateIssues: ChartIssue[];
}

export function derive(state: PlannerState): PlannerView {
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
