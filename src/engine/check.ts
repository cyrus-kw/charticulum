import { applyOverrides } from "./overrides";
import { evaluateRequirements, type RequirementReport } from "./requirements";
import type { Catalog, Chart, ChartIssue, Override, Requirements } from "./types";
import { validateChart } from "./validate";

export interface ChartCheck {
  valid: boolean;
  issues: ChartIssue[];
  report: RequirementReport;
  appliedOverrides: Override[];
}

// Run every check on a chart: overrides first, then placement rules,
// then requirements.
export function checkChart(
  catalog: Catalog,
  chart: Chart,
  requirements: Requirements,
): ChartCheck {
  const effective = applyOverrides(catalog, requirements, chart.overrides ?? [], chart.grades);
  const report = evaluateRequirements(effective.catalog, chart, effective.requirements);
  const issues = [
    ...effective.issues,
    ...validateChart(effective.catalog, chart),
    ...report.issues,
  ];
  return { valid: issues.length === 0, issues, report, appliedOverrides: effective.applied };
}
