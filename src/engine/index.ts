// The chart engine's public API. Other code (the visualizer, a future web
// app) should import from here rather than reaching into individual files,
// so the files can be reorganized without breaking anything outside.
export * from "./types";
export { createCatalog, satisfies } from "./catalog";
export { compareByCode, courseCodeId, formatCourseCode, parseCourseCode } from "./codes";
export { compareSlots, isOffered, slotBeside, slotLabel, termCalendar, type CalendarSlot } from "./availability";
export { validateChart } from "./validate";
export { evaluateRequirements, type RequirementReport } from "./requirements";
export { applyExternalEquivalents, externalPlacements } from "./equivalents";
export { checkChart, type ChartCheck } from "./check";
export { DEFAULT_MAX_CREDITS_PER_TERM, mergeRequirementSets } from "./scopes";
export { GRADE_POINTS, chartGpa, meetsGrade } from "./grades";
export { applyOverrides, type OverrideResult } from "./overrides";
export {
  findTemplate,
  forkTemplate,
  latestTemplate,
  mergeCharts,
  publishTemplate,
  resolveRequirements,
  type TemplateLibrary,
} from "./templates";
export { buildChart, type BuildOptions, type BuildResult } from "./scheduler";
export { formatChart } from "./format";
export {
  mergeEquivalencyRows,
  parseCsv,
  parseEquivalencyCsv,
  type CsvResult,
  type EquivalencyRow,
} from "./equivalencyCsv";
export { combineSchoolFiles, type SchoolFile, type SchoolFiles } from "./schoolFiles";
export {
  chartSchema,
  loadSchool,
  parseSchoolData,
  schoolDataSchema,
  type LoadedSchool,
  type ParseResult,
  type SchoolData,
  type SchoolDataInput,
} from "./school";
