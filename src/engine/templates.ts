import { mergeRequirementSets } from "./scopes";
import type {
  Chart,
  ChartIssue,
  ChartTemplate,
  RequirementSet,
  Requirements,
  TemplateRef,
  Term,
} from "./types";

// Every published template version. Versions never change once
// published: a new academic year is a new entry.
export type TemplateLibrary = ChartTemplate[];

export function publishTemplate(library: TemplateLibrary, template: ChartTemplate): TemplateLibrary {
  if (findTemplate(library, { templateId: template.id, version: template.version })) {
    throw new Error(`${template.id} ${template.version} is already published.`);
  }
  return [...library, template];
}

export function findTemplate(library: TemplateLibrary, ref: TemplateRef): ChartTemplate | undefined {
  return library.find((t) => t.id === ref.templateId && t.version === ref.version);
}

// The newest version of a template. Versions like "2026-27" sort correctly
// as plain text.
export function latestTemplate(library: TemplateLibrary, templateId: string): ChartTemplate | undefined {
  return library
    .filter((t) => t.id === templateId)
    .sort((a, b) => b.version.localeCompare(a.version))[0];
}

const copyTerms = (terms: Term[]): Term[] =>
  terms.map((term) => ({ ...term, objectIds: [...term.objectIds] }));

// Start a student's own chart from a template. The chart is pinned to the
// template's version, so later versions don't change its requirements.
export function forkTemplate(template: ChartTemplate, name = `${template.name} (my plan)`): Chart {
  return {
    name,
    terms: copyTerms(template.terms),
    completedExternal: [],
    pinnedTemplates: [{ templateId: template.id, version: template.version }],
  };
}

// The rules a chart is checked against: the school's global sets plus the
// local sets of every template it's pinned to.
export function resolveRequirements(
  library: TemplateLibrary,
  globalSets: RequirementSet[],
  chart: Chart,
): { requirements: Requirements; issues: ChartIssue[] } {
  const issues: ChartIssue[] = [];
  const localSets: RequirementSet[] = [];
  for (const ref of chart.pinnedTemplates ?? []) {
    const template = findTemplate(library, ref);
    if (!template) {
      issues.push({
        code: "TEMPLATE_NOT_FOUND",
        message: `Template ${ref.templateId} ${ref.version} is not in the library.`,
      });
      continue;
    }
    localSets.push(...template.requirementSets);
  }
  return { requirements: mergeRequirementSets([...globalSets, ...localSets]), issues };
}

// Combine two charts, e.g. a major plus a minor. Terms with the same index
// are joined. If an object appears in both, the first chart's placement
// wins, and so does its grade if both charts grade the same object.
export function mergeCharts(first: Chart, second: Chart, name = `${first.name} + ${second.name}`): Chart {
  const terms = new Map<number, Term>();
  const placed = new Set<string>();

  for (const chart of [first, second]) {
    for (const term of chart.terms) {
      let target = terms.get(term.index);
      if (!target) {
        target = { ...term, objectIds: [] };
        terms.set(term.index, target);
      }
      for (const id of term.objectIds) {
        if (placed.has(id)) continue;
        placed.add(id);
        target.objectIds.push(id);
      }
    }
  }

  const unique = <T>(items: T[], key: (item: T) => string) =>
    [...new Map(items.map((item) => [key(item), item])).values()];

  return {
    name,
    terms: [...terms.values()].sort((a, b) => a.index - b.index),
    completedExternal: unique(
      [...first.completedExternal, ...second.completedExternal],
      (e) => `${e.institution}|${e.externalId}`,
    ),
    grades: { ...second.grades, ...first.grades },
    overrides: unique([...(first.overrides ?? []), ...(second.overrides ?? [])], (o) => o.id),
    pinnedTemplates: unique(
      [...(first.pinnedTemplates ?? []), ...(second.pinnedTemplates ?? [])],
      (r) => `${r.templateId}|${r.version}`,
    ),
  };
}
