import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/index";
import { loadSampleSchool } from "../src/fixtures/sampleSchool";
import {
  borderPoint,
  chartLayout,
  edgeEndpoints,
  relatedTo,
  BROKEN_EDGE_COLOR,
  COLUMN_WIDTH,
  COURSE_COLORS,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  type PlannerEdge,
  type PlannerNode,
} from "../src/planner/layout";
import { derive, initialState, plannerReducer } from "../src/planner/state";
import { chartOf, obj } from "./helpers";

function sampleLayout(programIds: string[] = []) {
  let state = initialState(loadSampleSchool(), "bs-cs");
  for (const templateId of programIds) {
    state = plannerReducer(state, { type: "addProgram", ref: { templateId, version: "2026-27" } });
  }
  const view = derive(state);
  const layout = chartLayout(
    state.school.catalog,
    view.chart,
    view.check.issues,
    view.check.report.creditsByTerm,
    view.requirements.maxCreditsPerTerm,
  );
  return { ...layout, chart: view.chart };
}

const courses = (nodes: PlannerNode[]) => nodes.filter((n) => n.type === "course");

// Count pairs of lines that cross, treating each line as a straight segment
// from the right edge of its source card to the left edge of its target.
function crossings(edges: PlannerEdge[], position: (id: string) => { x: number; y: number }): number {
  const segment = (e: PlannerEdge) => {
    const a = position(e.source);
    const b = position(e.target);
    return { x1: a.x + NODE_WIDTH, y1: a.y + NODE_HEIGHT / 2, x2: b.x, y2: b.y + NODE_HEIGHT / 2 };
  };
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const p = segment(edges[i]);
      const q = segment(edges[j]);
      const shareEnd = [edges[i].source, edges[i].target].some((id) => id === edges[j].source || id === edges[j].target);
      if (shareEnd) continue;
      if (
        side(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1) * side(p.x1, p.y1, p.x2, p.y2, q.x2, q.y2) < 0 &&
        side(q.x1, q.y1, q.x2, q.y2, p.x1, p.y1) * side(q.x1, q.y1, q.x2, q.y2, p.x2, p.y2) < 0
      ) {
        count++;
      }
    }
  }
  return count;
}

describe("chartLayout look", () => {
  it("puts term stripes under the lines, alternately shaded", () => {
    const { nodes } = sampleLayout();
    const stripes = nodes.filter((n) => n.type === "term");
    expect(stripes.every((s) => s.zIndex === -1 && s.className === "term-stripe")).toBe(true);
    expect(stripes.map((s) => s.type === "term" && s.data.shaded)).toEqual(
      stripes.map((_, i) => i % 2 === 1),
    );
  });

  it("colors lines by the course they start from, never in the broken red", () => {
    const { edges, nodes } = sampleLayout();
    for (const edge of edges) {
      const source = nodes.find((n) => n.id === edge.source);
      expect(edge.style?.stroke).toBe(source?.type === "course" ? source.data.color : undefined);
      expect(COURSE_COLORS).toContain(edge.style?.stroke);
      expect(edge.style?.stroke).not.toBe(BROKEN_EDGE_COLOR);
    }
  });

  it("uses floating straight lines, dashed for concurrent requisites", () => {
    const { edges } = sampleLayout();
    expect(edges.every((e) => e.type === "floating")).toBe(true);
    const lab = edges.find((e) => e.id === "CS102->CS102L")!;
    expect(lab.style?.strokeDasharray).toBeDefined();
    expect(edges.find((e) => e.id === "CS101->CS102")!.style?.strokeDasharray).toBeUndefined();
  });

  it("keeps a lecture and its lab next to each other", () => {
    const { nodes } = sampleLayout();
    const y = (id: string) => nodes.find((n) => n.id === id)!.position.y;
    expect(y("CS102L") - y("CS102")).toBe(ROW_HEIGHT);
  });

  it("never overlaps cards in a column", () => {
    const { nodes } = sampleLayout(["minor-stats"]);
    const byColumn = new Map<number, number[]>();
    for (const n of courses(nodes)) {
      const column = Math.floor(n.position.x / COLUMN_WIDTH);
      byColumn.set(column, [...(byColumn.get(column) ?? []), n.position.y]);
    }
    for (const ys of byColumn.values()) {
      ys.sort((a, b) => a - b);
      ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(ROW_HEIGHT));
    }
  });

  it("crosses fewer lines than plain list order", () => {
    const { edges, nodes, chart } = sampleLayout(["minor-stats"]);
    const placed = new Map(courses(nodes).map((n) => [n.id, n.position]));
    // Plain list order: each card in the row it's listed in.
    const listed = new Map<string, { x: number; y: number }>();
    chart.terms.forEach((term, column) =>
      term.objectIds.forEach((id, row) => listed.set(id, { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT })),
    );
    const between = edges.filter((e) => placed.get(e.source)!.x !== placed.get(e.target)!.x);
    const ours = crossings(between, (id) => placed.get(id)!);
    const naive = crossings(between, (id) => listed.get(id)!);
    expect(ours).toBeLessThanOrEqual(naive);
    expect(ours).toBeLessThan(naive || 1);
  });

  it("marks one-season courses, minimum-grade courses, and gen eds", () => {
    const { nodes } = sampleLayout(["minor-stats"]);
    const data = (id: string) => {
      const n = nodes.find((node) => node.id === id);
      return n?.type === "course" ? n.data : undefined;
    };
    expect(data("CS301")?.onlyIn).toBe("spring");
    expect(data("CS400")?.onlyIn).toBe("fall");
    expect(data("CS101")?.onlyIn).toBeUndefined();
    expect(data("STAT200")?.needsMinGrade).toBe(true); // STAT300 needs a C in it
    expect(data("ENG101")?.generalEducation).toBe(true);
  });
});

describe("edgeEndpoints", () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 40 });

  it("joins facing sides for cards side by side", () => {
    expect(edgeEndpoints(box(0, 0), box(300, 0))).toEqual({ start: { x: 100, y: 20 }, end: { x: 300, y: 20 } });
  });

  it("joins the other pair of sides when the line runs backwards", () => {
    // The case from the screenshot: the requisite sits to the right.
    expect(edgeEndpoints(box(300, 0), box(0, 100))).toMatchObject({
      start: { x: 300 },
      end: { x: 100 },
    });
  });

  it("joins bottom to top for stacked cards", () => {
    expect(edgeEndpoints(box(0, 0), box(0, 100))).toEqual({ start: { x: 50, y: 40 }, end: { x: 50, y: 100 } });
  });

  it("always ends exactly on the border, on the side facing the other card", () => {
    const a = box(0, 0);
    for (const [x, y] of [[300, 10], [-250, 60], [20, -200], [180, 160], [-60, 90]]) {
      const b = box(x, y);
      const { start, end } = edgeEndpoints(a, b);
      const onBorder = (p: { x: number; y: number }, r: ReturnType<typeof box>) =>
        (Math.abs(p.x - r.x) < 1e-9 || Math.abs(p.x - (r.x + r.width)) < 1e-9) && p.y >= r.y - 1e-9 && p.y <= r.y + r.height + 1e-9 ||
        (Math.abs(p.y - r.y) < 1e-9 || Math.abs(p.y - (r.y + r.height)) < 1e-9) && p.x >= r.x - 1e-9 && p.x <= r.x + r.width + 1e-9;
      expect(onBorder(start, a), `start for ${x},${y}`).toBe(true);
      expect(onBorder(end, b), `end for ${x},${y}`).toBe(true);
      // Seen from its own card's center, each end points toward the other card.
      const towardB = (start.x - 50) * (x + 50 - 50) + (start.y - 20) * (y + 20 - 20);
      const towardA = (end.x - (x + 50)) * (50 - (x + 50)) + (end.y - (y + 20)) * (20 - (y + 20));
      expect(towardB, `start for ${x},${y}`).toBeGreaterThan(0);
      expect(towardA, `end for ${x},${y}`).toBeGreaterThan(0);
    }
  });

  it("handles cards in the same spot without dividing by zero", () => {
    expect(borderPoint(box(0, 0), { x: 50, y: 20 })).toEqual({ x: 50, y: 20 });
  });
});

describe("relatedTo", () => {
  // A -> B -> C, and A -> D (D is B's sibling, not part of C's chain).
  const edges = [
    { source: "A", target: "B" },
    { source: "B", target: "C" },
    { source: "A", target: "D" },
  ];

  it("follows requisites back and dependents forward", () => {
    expect([...relatedTo(edges, "B")].sort()).toEqual(["A", "B", "C"]);
    expect([...relatedTo(edges, "A")].sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("doesn't pull in siblings", () => {
    expect(relatedTo(edges, "C").has("D")).toBe(false);
  });

  it("handles cycles without looping forever", () => {
    expect([...relatedTo([...edges, { source: "C", target: "A" }], "B")].sort()).toEqual(["A", "B", "C", "D"]);
  });
});

describe("chartLayout edge cases", () => {
  it("lays out an empty chart", () => {
    const { nodes, edges } = chartLayout(createCatalog([obj("A")]), chartOf([[], []]), [], {}, 12);
    expect(nodes.filter((n) => n.type === "term")).toHaveLength(2);
    expect(edges).toEqual([]);
  });

  it("skips objects missing from the catalog", () => {
    const { nodes } = chartLayout(createCatalog([obj("A")]), chartOf([[], ["A", "GHOST"]]), [], {}, 12);
    expect(courses(nodes).map((n) => n.id)).toEqual(["A"]);
  });
});
