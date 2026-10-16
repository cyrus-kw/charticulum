// Turn a chart into React Flow nodes (boxes) and edges (arrows).
// Terms become columns; each object is a card in its term's column.
import type { Edge, Node } from "@xyflow/react";
import {
  satisfies,
  EXTERNAL_TERM,
  type Catalog,
  type Chart,
  type ChartIssue,
  type CourseObject,
  type Grade,
} from "../engine/index";

export const COLUMN_WIDTH = 230;
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 80;
export const HEADER_HEIGHT = 64;
export const ROW_HEIGHT = 92;
const COLUMN_PADDING = 12;
export const TERM_WIDTH = NODE_WIDTH + 2 * COLUMN_PADDING;
// Keep in sync with the .requisite-edge styles in globals.css.
const EDGE_COLOR = "#64748b";
const BROKEN_EDGE_COLOR = "#e11d48";

// React Flow requires node data to be a plain object type, so these use
// `type` rather than `interface`.
export type CourseNodeData = {
  object: CourseObject;
  grade?: Grade;
  issues: ChartIssue[];
  external: boolean;
};

export type TermNodeData = {
  label: string;
  credits: number;
  maxCredits: number;
  external: boolean;
  rows: number;
};

export type CourseNode = Node<CourseNodeData, "course">;
export type TermNode = Node<TermNodeData, "term">;
export type PlannerNode = CourseNode | TermNode;

export function chartLayout(
  catalog: Catalog,
  chart: Chart,
  issues: ChartIssue[],
  creditsByTerm: Record<number, number>,
  maxCredits: number,
): { nodes: PlannerNode[]; edges: Edge[] } {
  const rows = Math.max(1, ...chart.terms.map((t) => t.objectIds.length));
  const nodes: PlannerNode[] = [];
  const termOf = new Map<string, number>();

  chart.terms.forEach((term, column) => {
    const external = term.index === EXTERNAL_TERM;
    nodes.push({
      id: `term-${term.index}`,
      type: "term",
      position: { x: column * COLUMN_WIDTH - COLUMN_PADDING, y: 0 },
      data: {
        label: term.label,
        credits: creditsByTerm[term.index] ?? 0,
        maxCredits,
        external,
        rows,
      },
      // Fixed sizes let React Flow draw nodes before measuring them
      // (including in the server-rendered HTML).
      width: TERM_WIDTH,
      height: columnHeight(rows),
      draggable: false,
      selectable: false,
      zIndex: 0,
    });

    term.objectIds.forEach((id, row) => {
      const object = catalog.get(id);
      if (!object) return;
      termOf.set(id, term.index);
      nodes.push({
        id,
        type: "course",
        position: { x: column * COLUMN_WIDTH, y: HEADER_HEIGHT + row * ROW_HEIGHT },
        data: {
          object,
          ...(chart.grades?.[id] && { grade: chart.grades[id] }),
          issues: issues.filter((issue) => issue.objectId === id),
          external,
        },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        // Term 0 is filled automatically from outside credit.
        draggable: !external,
        zIndex: 1,
      });
    });
  });

  // One arrow from each placed requisite (or an equivalent standing in for
  // it) to the object that needs it. Red when the order is wrong.
  const edges: Edge[] = [];
  for (const [id, termIndex] of termOf) {
    const object = catalog.get(id)!;
    if (termIndex === EXTERNAL_TERM) continue;
    const links = [
      ...object.requisites.previous.map((req) => ({ req, concurrent: false })),
      ...object.requisites.concurrent.map((req) => ({ req, concurrent: true })),
    ];
    for (const { req, concurrent } of links) {
      for (const [sourceId, sourceTerm] of termOf) {
        if (!satisfies(catalog, req, sourceId)) continue;
        const ok = concurrent ? sourceTerm <= termIndex : sourceTerm < termIndex;
        edges.push({
          id: `${sourceId}->${id}`,
          source: sourceId,
          target: id,
          className: ok ? "requisite-edge" : "requisite-edge requisite-edge-broken",
          style: concurrent ? { strokeDasharray: "6 4" } : {},
          markerEnd: { type: "arrowclosed" as const, color: ok ? EDGE_COLOR : BROKEN_EDGE_COLOR },
        });
      }
    }
  }

  return { nodes, edges };
}

// Which term a card was dropped on, from its x position. Never Term 0.
export function termIndexAt(chart: Chart, x: number): number {
  const column = Math.round(x / COLUMN_WIDTH);
  const clamped = Math.min(Math.max(column, 1), chart.terms.length - 1);
  return chart.terms[clamped]?.index ?? 1;
}

export function columnHeight(rows: number): number {
  return HEADER_HEIGHT + rows * ROW_HEIGHT + COLUMN_PADDING;
}
