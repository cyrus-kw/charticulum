import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/engine/index";
import { loadSampleSchool } from "../src/fixtures/sampleSchool";
import {
  chartLayout,
  edgeEndpoints,
  perimeterLength,
  perimeterOffset,
  perimeterPoint,
  perimeterStep,
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
    expect(edgeEndpoints(box(300, 0), box(0, 100))).toEqual({
      start: { x: 300, y: 20 },
      end: { x: 100, y: 120 },
    });
  });

  it("joins bottom to top for stacked cards", () => {
    expect(edgeEndpoints(box(0, 0), box(0, 100))).toEqual({ start: { x: 50, y: 40 }, end: { x: 50, y: 100 } });
  });

  it("uses side midpoints even for steep lines between terms", () => {
    // Far below and to the right: still right side to left side.
    expect(edgeEndpoints(box(0, 0), box(300, 400))).toEqual({ start: { x: 100, y: 20 }, end: { x: 300, y: 420 } });
    expect(edgeEndpoints(box(300, 400), box(0, 0))).toEqual({ start: { x: 300, y: 420 }, end: { x: 100, y: 20 } });
  });

  it("uses top and bottom only when cards overlap side to side", () => {
    // Slightly offset, as while dragging within a column.
    expect(edgeEndpoints(box(0, 200), box(30, 0))).toEqual({ start: { x: 50, y: 200 }, end: { x: 80, y: 40 } });
    // Just past each other: back to the sides.
    expect(edgeEndpoints(box(0, 200), box(100, 0)).start).toEqual({ x: 100, y: 220 });
  });

  describe("while dragging (both ends on any side)", () => {
    const at = (x: number, y: number) => edgeEndpoints(box(0, 0), box(x, y), true);

    it("uses left/right sides when the cards are more across than down", () => {
      expect(at(300, 100)).toEqual({ start: { x: 100, y: 20 }, end: { x: 300, y: 120 } });
      expect(at(-300, -100)).toEqual({ start: { x: 0, y: 20 }, end: { x: -200, y: -80 } });
    });

    it("uses top/bottom sides at both ends when they're more down than across", () => {
      expect(at(150, 300)).toEqual({ start: { x: 50, y: 40 }, end: { x: 200, y: 300 } });
      expect(at(150, -300)).toEqual({ start: { x: 50, y: 0 }, end: { x: 200, y: -260 } });
    });

    it("slides both ends around their borders as a card circles, always to a side's middle", () => {
      // Which side of a 100x40 box at (rx, ry) the point is the middle of.
      const middleOf = (p: { x: number; y: number }, rx: number, ry: number) =>
        p.x === rx && p.y === ry + 20
          ? "left"
          : p.x === rx + 100 && p.y === ry + 20
            ? "right"
            : p.y === ry && p.x === rx + 50
              ? "top"
              : p.y === ry + 40 && p.x === rx + 50
                ? "bottom"
                : "NOT A MIDDLE";
      const startSides = new Set<string>();
      const endSides = new Set<string>();
      for (let angle = 0; angle < 360; angle += 15) {
        const x = Math.round(400 * Math.cos((angle * Math.PI) / 180));
        const y = Math.round(300 * Math.sin((angle * Math.PI) / 180));
        const { start, end } = at(x, y);
        startSides.add(middleOf(start, 0, 0));
        endSides.add(middleOf(end, x, y));
      }
      expect([...startSides].sort()).toEqual(["bottom", "left", "right", "top"]);
      expect([...endSides].sort()).toEqual(["bottom", "left", "right", "top"]);
    });

    it("puts the two ends on facing sides", () => {
      const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" } as const;
      for (const [x, y] of [[300, 100], [150, 300], [-300, -100], [150, -300], [-120, 250]]) {
        const { start, end } = at(x, y);
        const startSide = start.x === 0 ? "left" : start.x === 100 ? "right" : start.y === 0 ? "top" : "bottom";
        const endSide = end.x === x ? "left" : end.x === x + 100 ? "right" : end.y === y ? "top" : "bottom";
        expect(endSide, `${x},${y}`).toBe(opposite[startSide]);
      }
    });

    it("matches the normal rule when the cards are simply side by side", () => {
      expect(at(300, 0)).toEqual(edgeEndpoints(box(0, 0), box(300, 0)));
    });
  });

  describe("positions along the border", () => {
    const r = box(10, 20); // 100 wide, 40 tall: border is 280 long

    it("measures clockwise from the top-left corner", () => {
      expect(perimeterLength(r)).toBe(280);
      expect(perimeterOffset(r, { x: 60, y: 20 })).toBe(50); // top middle
      expect(perimeterOffset(r, { x: 110, y: 40 })).toBe(120); // right middle
      expect(perimeterOffset(r, { x: 60, y: 60 })).toBe(190); // bottom middle
      expect(perimeterOffset(r, { x: 10, y: 40 })).toBe(260); // left middle
    });

    it("turns offsets back into points, wrapping around", () => {
      for (const offset of [0, 50, 100, 120, 140, 190, 240, 260]) {
        expect(perimeterOffset(r, perimeterPoint(r, offset))).toBeCloseTo(offset);
      }
      expect(perimeterPoint(r, 280 + 50)).toEqual(perimeterPoint(r, 50));
      expect(perimeterPoint(r, -20)).toEqual({ x: 10, y: 40 }); // up the left side
    });

    it("goes the short way around", () => {
      expect(perimeterStep(50, 120, 280)).toBe(70); // top to right: clockwise
      expect(perimeterStep(50, 260, 280)).toBe(-70); // top to left: back past the corner
      expect(perimeterStep(260, 50, 280)).toBe(70); // left to top: forward past the corner
    });

    it("finds every snapped arrowhead on its card's border", () => {
      for (const [x, y] of [[300, 100], [150, 300], [-300, -100], [150, -300]]) {
        const target = box(x, y);
        const { end } = edgeEndpoints(box(0, 0), target, true);
        expect(perimeterPoint(target, perimeterOffset(target, end))).toEqual(end);
      }
    });
  });

  it("gives finite points for cards in the same spot", () => {
    const { start, end } = edgeEndpoints(box(0, 0), box(0, 0));
    expect([start.x, start.y, end.x, end.y].every(Number.isFinite)).toBe(true);
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
