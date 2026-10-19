// Where each problem with the plan is shown. A problem with a term (too
// many credits) or with a course placed in it (a requisite out of order,
// not offered that season) belongs to that term: it shows in Selected when
// the course or term is selected, and counts toward the term title's
// badge. Everything else is about the plan as a whole (a required course
// missing, too few credits, GPA) and shows under Requirements.
import type { Chart, ChartIssue, Term } from "../engine/index";

export function issueInTerm(issue: ChartIssue, term: Term): boolean {
  return issue.termIndex === term.index || (issue.objectId !== undefined && term.objectIds.includes(issue.objectId));
}

// The problems that belong to no term on the chart.
export function planIssues(chart: Chart, issues: ChartIssue[]): ChartIssue[] {
  return issues.filter((issue) => !chart.terms.some((term) => issueInTerm(issue, term)));
}

// The problems of what's selected: a course's own, or a term's (with its
// courses'). None when nothing is selected.
export function selectionIssues(
  chart: Chart,
  issues: ChartIssue[],
  selectedId: string | null,
  selectedTerm: number | null,
): ChartIssue[] {
  const term = chart.terms.find((t) => t.index === selectedTerm);
  if (term) return issues.filter((issue) => issueInTerm(issue, term));
  if (selectedId) return issues.filter((issue) => issue.objectId === selectedId);
  return [];
}
