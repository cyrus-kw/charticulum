import { evaluateRequirements, type RequirementReport } from "./requirements.js";
import type { Catalog, Chart, ChartIssue, Requirements } from "./types.js";
import { validateChart } from "./validate.js";

export interface ChartCheck {
  valid: boolean;
  issues: ChartIssue[];
  report: RequirementReport;
}

// Run every check on a chart: placement rules first, then requirements.
export function checkChart(
  catalog: Catalog,
  chart: Chart,
  requirements: Requirements,
): ChartCheck {
  const report = evaluateRequirements(catalog, chart, requirements);
  const issues = [...validateChart(catalog, chart), ...report.issues];
  return { valid: issues.length === 0, issues, report };
}
