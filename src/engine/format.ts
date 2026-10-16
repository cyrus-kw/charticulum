import type { ChartCheck } from "./check";
import type { Catalog, Chart } from "./types";

// Turn a chart into plain text, one block per term. Used by the terminal
// demo (npm run demo); the web app draws charts with React Flow instead.
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
    const { totalCredits, creditsByCategory, gpa } = check.report;
    const categories = Object.entries(creditsByCategory)
      .map(([category, credits]) => `${category} ${credits}`)
      .join(", ");
    lines.push("", `Total: ${totalCredits} credits`, `Categories: ${categories || "none"}`);
    if (gpa !== undefined) lines.push(`GPA: ${gpa.toFixed(2)}`);
    lines.push(check.valid ? "Issues: none" : `Issues (${check.issues.length}):`);
    for (const issue of check.issues) lines.push(`  [${issue.code}] ${issue.message}`);
  }

  return lines.join("\n");
}
