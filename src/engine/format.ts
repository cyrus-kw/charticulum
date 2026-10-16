import type { ChartCheck } from "./check.js";
import type { Catalog, Chart } from "./types.js";

// Turn a chart into plain text, one block per term. This is a stand-in
// for the visual flowchart that the chart-visualizer will draw later.
export function formatChart(catalog: Catalog, chart: Chart, check?: ChartCheck): string {
  const lines: string[] = [chart.name, "=".repeat(chart.name.length)];

  for (const term of chart.terms) {
    const termCredits = term.objectIds.reduce(
      (sum, id) => sum + (catalog.get(id)?.credits ?? 0),
      0,
    );
    lines.push("", `${term.label.padEnd(40)}${String(termCredits).padStart(3)} cr`);
    if (term.objectIds.length === 0) lines.push("  (empty)");
    for (const id of term.objectIds) {
      const object = catalog.get(id);
      const title = object ? object.title : "(not in catalog)";
      const credits = object ? String(object.credits) : "?";
      lines.push(`  ${id.padEnd(10)}${title.padEnd(30)}${credits.padStart(3)}`);
    }
  }

  if (check) {
    const { totalCredits, creditsByCategory } = check.report;
    const categories = Object.entries(creditsByCategory)
      .map(([category, credits]) => `${category} ${credits}`)
      .join(", ");
    lines.push("", `Total: ${totalCredits} credits`, `Categories: ${categories || "none"}`);
    lines.push(check.valid ? "Issues: none" : `Issues (${check.issues.length}):`);
    for (const issue of check.issues) lines.push(`  [${issue.code}] ${issue.message}`);
  }

  return lines.join("\n");
}
