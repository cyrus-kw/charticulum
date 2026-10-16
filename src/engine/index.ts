// The chart engine's public API. Other code (the visualizer, a future web
// app) should import from here rather than reaching into individual files,
// so the files can be reorganized without breaking anything outside.
export * from "./types.js";
export { createCatalog, satisfies } from "./catalog.js";
export { isOffered, slotLabel, termCalendar, type CalendarSlot } from "./availability.js";
export { validateChart } from "./validate.js";
export { evaluateRequirements, type RequirementReport } from "./requirements.js";
export { applyExternalEquivalents, externalPlacements } from "./equivalents.js";
export { checkChart, type ChartCheck } from "./check.js";
export { DEFAULT_MAX_CREDITS_PER_TERM, mergeRequirementSets } from "./scopes.js";
export { buildChart, type BuildOptions, type BuildResult } from "./scheduler.js";
export { formatChart } from "./format.js";
