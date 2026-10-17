import { describe, expect, it } from "vitest";
import {
  applyExternalEquivalents,
  createCatalog,
  forkTemplate,
  latestTemplate,
  mergeCharts,
} from "../src/engine/index";
import { loadSampleSchool } from "../src/fixtures/sampleSchool";
import {
  arrangeChart,
  chartLayout,
  courseCode,
  geometryFor,
  termIndexAt,
  COMPACT_BELOW,
  edgeEndpoints,
  perimeterLength,
  perimeterOffset,
  perimeterPoint,
  perimeterStep,
  perimeterStepToward,
  relatedTo,
  sideAt,
  MIN_SIDE_GAP,
  TERM_SWITCH_MARGIN,
  sideMiddle,
  draggingEndpoints,
  type Side,
  BROKEN_EDGE_COLOR,
  COLUMN_WIDTH,
  COURSE_COLORS,
  HEADER_HEIGHT,
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

  it("arranges a new plan so no line runs behind a card, with fewer problems overall", () => {
    // The same major + minor, merged without arranging (the raw template order).
    const school = loadSampleSchool();
    const major = forkTemplate(latestTemplate(school.library, "bs-cs")!);
    const minor = forkTemplate(latestTemplate(school.library, "minor-stats")!);
    const raw = applyExternalEquivalents(school.catalog, mergeCharts(major, minor));
    const arranged = arrangeChart(school.catalog, raw);
    const score = (chart: typeof raw) => {
      const { nodes, edges } = chartLayout(school.catalog, chart, [], {}, 12);
      const placed = new Map(courses(nodes).map((n) => [n.id, n.position]));
      const between = edges.filter((e) => placed.get(e.source)!.x !== placed.get(e.target)!.x);
      // Lines running behind an unrelated card, checked by sampling points.
      let behind = 0;
      for (const e of between) {
        const a = placed.get(e.source)!;
        const b = placed.get(e.target)!;
        const [x1, y1, x2, y2] = [a.x + NODE_WIDTH, a.y + NODE_HEIGHT / 2, b.x, b.y + NODE_HEIGHT / 2];
        const hit = [...placed].some(
          ([id, c]) =>
            id !== e.source &&
            id !== e.target &&
            Array.from({ length: 49 }, (_, i) => (i + 1) / 50).some((t) => {
              const x = x1 + (x2 - x1) * t;
              const y = y1 + (y2 - y1) * t;
              return x > c.x && x < c.x + NODE_WIDTH && y > c.y && y < c.y + NODE_HEIGHT;
            }),
        );
        if (hit) behind++;
      }
      return { crossings: crossings(between, (id) => placed.get(id)!), behind };
    };
    const before = score(raw);
    const after = score(arranged);
    expect(after.behind).toBe(0);
    // Running behind a card counts as 3 crossings, as in the arranging.
    expect(after.crossings + 3 * after.behind).toBeLessThan(before.crossings + 3 * before.behind);
    // Arranging only reorders within terms.
    arranged.terms.forEach((term, i) =>
      expect([...term.objectIds].sort()).toEqual([...raw.terms[i].objectIds].sort()),
    );
  });

  it("follows each term's order from the chart, top to bottom", () => {
    const { nodes, chart } = sampleLayout();
    for (const term of chart.terms) {
      const ys = term.objectIds.map((id) => nodes.find((n) => n.id === id)!.position.y);
      ys.slice(1).forEach((y, i) => expect(y).toBeGreaterThan(ys[i]));
    }
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

  describe("while dragging", () => {
    // Cards sit centered in 212-wide term columns, like on the canvas.
    const card = (column: number, y: number) => box(column * 212 + 56, y);
    const drag = (source: ReturnType<typeof box>, target: ReturnType<typeof box>, previous = {}) =>
      draggingEndpoints(source, target, previous);

    it("uses the facing left and right sides between different terms, however steep", () => {
      expect(drag(card(0, 0), card(1, 600))).toMatchObject({ startSide: "right", endSide: "left" });
      expect(drag(card(2, 0), card(1, -600))).toMatchObject({ startSide: "left", endSide: "right" });
      expect(drag(card(0, 0), card(3, 10))).toMatchObject({ startSide: "right", endSide: "left" });
    });

    it("joins the facing top and bottom within the same term", () => {
      expect(drag(card(1, 0), card(1, 200))).toMatchObject({ startSide: "bottom", endSide: "top" });
      expect(drag(card(1, 200), card(1, 0))).toMatchObject({ startSide: "top", endSide: "bottom" });
    });

    it("switches to the sides once there's a clear gap across", () => {
      const anchor = card(1, 0); // x 268..368
      // Just over the column edge but only 14px across: still top to bottom.
      expect(drag(anchor, box(382, 300))).toMatchObject({ startSide: "bottom", endSide: "top" });
      // A clear gap: side to side.
      expect(drag(anchor, box(368 + MIN_SIDE_GAP + 2, 300))).toMatchObject({ startSide: "right", endSide: "left" });
    });

    it("joins top to bottom when cards in different terms are nearly level across", () => {
      // The screenshot case: MATH201 dragged just past a column edge, its left
      // side 6px from CS201's right side, far above it.
      const cs201 = box(36, 478);
      const math201 = box(36 + 100 + 6, 10);
      expect(drag(math201, cs201)).toMatchObject({ startSide: "bottom", endSide: "top" });
      // With a real gap between them, back to the sides.
      expect(drag(box(36 + 100 + MIN_SIDE_GAP + 1, 10), cs201)).toMatchObject({ startSide: "left", endSide: "right" });
    });

    it("keeps cards that sit side by side joined at their sides, however close", () => {
      // The second screenshot, mid-drag: MATH201 near the right edge of one
      // term, 34px across from CS201 and SOPH-REV in the next term, and
      // overlapping them vertically.
      const math201 = box(300, 50); // center over column 1
      const cs201 = box(400 + 34, 0); // center over column 2
      const sophRev = box(400 + 34, 90);
      expect(drag(math201, cs201)).toMatchObject({ startSide: "right", endSide: "left" });
      expect(drag(math201, sophRev)).toMatchObject({ startSide: "right", endSide: "left" });
      // Even if they were joined top to bottom a moment ago.
      const joined = { start: "top" as Side, end: "bottom" as Side };
      expect(drag(math201, cs201, joined)).toMatchObject({ startSide: "right", endSide: "left" });
    });

    it("never leaves a near-vertical side-to-side line", () => {
      // Sweep a card across past another, far below it: whenever the line uses
      // left/right sides, it must lean at least MIN_SIDE_GAP across.
      const anchor = box(0, 0);
      let previous: { start?: Side; end?: Side } = {};
      for (let x = -400; x <= 400; x += 4) {
        const other = box(x, 500);
        const ends = drag(anchor, other, previous);
        if (ends.startSide === "left" || ends.startSide === "right") {
          expect(Math.abs(ends.end.x - ends.start.x), `x=${x}`).toBeGreaterThanOrEqual(MIN_SIDE_GAP);
        }
        previous = { start: ends.startSide, end: ends.endSide };
      }
    });

    it("puts each end at the middle of its side", () => {
      const source = card(0, 0);
      const target = card(1, 500);
      const { start, end } = drag(source, target);
      expect(start).toEqual(sideMiddle(source, "right"));
      expect(end).toEqual(sideMiddle(target, "left"));
    });

    it("doesn't flicker when a card is held at the switch point", () => {
      // Wiggle a card back and forth across the gap where lines switch from
      // top-to-bottom to side-to-side.
      const anchor = card(1, 0);
      const wiggled = (i: number) => box(368 + MIN_SIDE_GAP + (i % 2 === 0 ? -8 : 8), 300);
      const countSwitches = (remember: boolean) => {
        let previous: { start?: Side; end?: Side } = {};
        let last: string | undefined;
        let switches = 0;
        for (let i = 0; i < 40; i++) {
          const ends = drag(anchor, wiggled(i), remember ? previous : {});
          const sides = `${ends.startSide}-${ends.endSide}`;
          if (last && last !== sides) switches++;
          last = sides;
          previous = { start: ends.startSide, end: ends.endSide };
        }
        return switches;
      };
      expect(countSwitches(false)).toBeGreaterThan(10); // without memory: flickers
      expect(countSwitches(true)).toBe(0); // with it: steady
    });

    it("does switch once the gap is clearly wide enough", () => {
      const anchor = card(1, 0);
      const joined = { start: "bottom" as Side, end: "top" as Side };
      expect(drag(anchor, box(368 + MIN_SIDE_GAP + 10, 300), joined).startSide).toBe("bottom");
      expect(drag(anchor, box(368 + MIN_SIDE_GAP + TERM_SWITCH_MARGIN + 10, 300), joined).startSide).toBe("right");
    });

    it("finds which side a border point is on", () => {
      const r = box(0, 0);
      for (const side of ["left", "right", "top", "bottom"] as const) {
        expect(sideAt(r, sideMiddle(r, side))).toBe(side);
      }
    });
  });

  describe("perimeterStepToward", () => {
    const r = box(0, 0); // border 280 long; left middle at 260, right middle at 120
    const left = perimeterOffset(r, sideMiddle(r, "left"));
    const right = perimeterOffset(r, sideMiddle(r, "right"));

    it("flows over the top when the other end is above", () => {
      const step = perimeterStepToward(r, left, right, { x: 50, y: -300 });
      // Halfway there it's on the top edge.
      expect(perimeterPoint(r, left + step / 2)).toEqual({ x: 50, y: 0 });
    });

    it("flows under the bottom when the other end is below", () => {
      const step = perimeterStepToward(r, left, right, { x: 50, y: 300 });
      expect(perimeterPoint(r, left + step / 2)).toEqual({ x: 50, y: 40 });
    });

    it("always ends where it should, whichever way it goes", () => {
      for (const toward of [{ x: 0, y: -100 }, { x: 0, y: 100 }, { x: 500, y: 20 }]) {
        const step = perimeterStepToward(r, right, left, toward);
        expect(perimeterPoint(r, right + step)).toEqual(sideMiddle(r, "left"));
      }
    });

    it("doesn't move when already there", () => {
      expect(perimeterStepToward(r, left, left, { x: 0, y: 0 })).toBe(0);
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

describe("layout stability across changes", () => {
  // The sample major + minor, laid out once, then changed with memory.
  function setup() {
    let state = initialState(loadSampleSchool(), "bs-cs");
    state = plannerReducer(state, { type: "addProgram", ref: { templateId: "minor-stats", version: "2026-27" } });
    state = plannerReducer(state, { type: "build" });
    const layoutOf = (s: typeof state, memory?: Parameters<typeof chartLayout>[5]) => {
      const v = derive(s);
      return chartLayout(s.school.catalog, v.chart, v.check.issues, v.check.report.creditsByTerm, 12, memory);
    };
    return { state, layoutOf };
  }
  const positions = (nodes: PlannerNode[]) =>
    new Map(courses(nodes).map((n) => [n.id, n.position]));
  const colorsOf = (nodes: PlannerNode[]) =>
    new Map(courses(nodes).flatMap((n) => (n.type === "course" && n.data.color ? [[n.id, n.data.color]] : [])));
  const columnOrder = (nodes: PlannerNode[], x: number) =>
    courses(nodes)
      .filter((n) => n.position.x === x)
      .sort((a, b) => a.position.y - b.position.y)
      .map((n) => n.id);

  it("keeps every other course where it was when one course moves", () => {
    const { state, layoutOf } = setup();
    const before = layoutOf(state);
    const fromTerm = state.chart.terms.find((t) => t.objectIds.includes("HIST110"))!.index;
    const toTerm = state.chart.terms.at(-1)!.index;
    expect(toTerm).not.toBe(fromTerm);
    const moved = plannerReducer(state, { type: "move", objectId: "HIST110", termIndex: toTerm });
    const after = layoutOf(moved, before.memory);

    const was = positions(before.nodes);
    const now = positions(after.nodes);
    const destinationX = now.get("HIST110")!.x;
    for (const [id, position] of was) {
      if (id === "HIST110" || position.x === destinationX) continue;
      expect(now.get(id), id).toEqual(position);
    }
    // In the destination term, the courses already there keep their order.
    const destinationBefore = columnOrder(before.nodes, destinationX);
    expect(columnOrder(after.nodes, destinationX).filter((id) => id !== "HIST110")).toEqual(destinationBefore);
  });

  it("keeps every course's color when one course moves", () => {
    const { state, layoutOf } = setup();
    const before = layoutOf(state);
    const moved = plannerReducer(state, { type: "move", objectId: "CS390", termIndex: state.chart.terms.at(-1)!.index });
    const after = layoutOf(moved, before.memory);
    for (const [id, color] of colorsOf(before.nodes)) expect(colorsOf(after.nodes).get(id), id).toBe(color);
  });

  it("is reshuffled without memory (so the memory is what keeps it steady)", () => {
    const { state, layoutOf } = setup();
    const before = layoutOf(state);
    const moved = plannerReducer(state, { type: "move", objectId: "HIST110", termIndex: state.chart.terms.at(-1)!.index });
    const fresh = layoutOf(moved);
    const steady = layoutOf(moved, before.memory);
    const changed = (layout: typeof fresh) =>
      [...positions(before.nodes)].filter(([id, p]) => id !== "HIST110" && positions(layout.nodes).get(id)!.y !== p.y).length;
    expect(changed(steady)).toBeLessThanOrEqual(changed(fresh));
  });

  it("lays out fresh when most of the plan changes", () => {
    const { state, layoutOf } = setup();
    const before = layoutOf(state);
    // Every course one term later: nothing stayed, so nothing is kept.
    const shifted = {
      ...state.chart,
      terms: [
        ...state.chart.terms.map((t, i) => ({
          ...t,
          objectIds: i <= 1 ? [] : state.chart.terms[i - 1].objectIds,
        })),
        { ...state.chart.terms.at(-1)!, index: state.chart.terms.at(-1)!.index + 1, label: "Later", objectIds: state.chart.terms.at(-1)!.objectIds },
      ],
    };
    const other = plannerReducer(state, { type: "loadChart", chart: shifted, savedId: "x" });
    expect(positions(layoutOf(other, before.memory).nodes)).toEqual(positions(layoutOf(other).nodes));
  });

  it("puts a moved course in a free spot without pushing others aside", () => {
    // Term 1: A, B, C. Term 2: D (needs B). Term 3: P, Q, R (packed).
    const catalog = createCatalog([
      obj("A"), obj("B"), obj("C"),
      obj("D", { previous: ["B"] }),
      obj("P"), obj("Q"), obj("R"),
    ]);
    const before = chartLayout(catalog, chartOf([[], ["A", "B", "C"], ["D"], ["P", "Q", "R"]]), [], {}, 18);
    const after = chartLayout(catalog, chartOf([[], ["A", "B", "C"], [], ["P", "Q", "R", "D"]]), [], {}, 18, before.memory);
    const y = (nodes: PlannerNode[], id: string) => nodes.find((n) => n.id === id)!.position.y;
    // No gap in term 3, so D goes below; nothing else moves.
    for (const id of ["A", "B", "C", "P", "Q", "R"]) expect(y(after.nodes, id), id).toBe(y(before.nodes, id));
    expect(y(after.nodes, "D")).toBeGreaterThan(y(before.nodes, "R"));
  });

  it("puts a dropped course at the height it was dropped, if there's room", () => {
    // Term 3 starts as P, X, R; X moves out, leaving a gap; D is dropped into it.
    const catalog = createCatalog([obj("A"), obj("B"), obj("C"), obj("D"), obj("P"), obj("X"), obj("R")]);
    const first = chartLayout(catalog, chartOf([[], ["A", "B", "C"], ["D"], ["P", "X", "R"], []]), [], {}, 18);
    const second = chartLayout(catalog, chartOf([[], ["A", "B", "C"], ["D"], ["P", "R"], ["X"]]), [], {}, 18, first.memory);
    const y = (layout: typeof first, id: string) => layout.nodes.find((n) => n.id === id)!.position.y;
    // ChartFlow records where a card was dropped in the memory.
    const memory = { ...second.memory, column: new Map(second.memory.column), y: new Map(second.memory.y) };
    memory.column.set("D", 3);
    memory.y.set("D", y(first, "X") - HEADER_HEIGHT);
    const third = chartLayout(catalog, chartOf([[], ["A", "B", "C"], [], ["P", "D", "R"], ["X"]]), [], {}, 18, memory);
    expect(y(third, "D")).toBe(y(first, "X"));
    for (const id of ["A", "B", "C", "P", "R", "X"]) expect(y(third, id), id).toBe(y(second, id));
  });

  it("packs a reordered term from the top, with no gaps, leaving other terms alone", () => {
    // Term 1: A, B, C, D (D's requisite sits low, so D starts with a gap above it).
    const catalog = createCatalog([obj("Z0"), obj("Z1"), obj("Z2"), obj("Z3"), obj("A"), obj("B"), obj("C"), obj("D", { previous: ["Z3"] })]);
    const before = chartLayout(catalog, chartOf([[], ["Z0", "Z1", "Z2", "Z3"], ["A", "B", "D"]]), [], {}, 18);
    const y = (layout: typeof before, id: string) => layout.nodes.find((n) => n.id === id)!.position.y;
    // Drag A to the bottom of term 2 (column 2): pack that term.
    const memory = { ...before.memory, pack: new Set([2]) };
    const after = chartLayout(catalog, chartOf([[], ["Z0", "Z1", "Z2", "Z3"], ["B", "D", "A"]]), [], {}, 18, memory);
    const term2 = ["B", "D", "A"].map((id) => y(after, id) - HEADER_HEIGHT);
    expect(term2).toEqual([0, ROW_HEIGHT, 2 * ROW_HEIGHT]);
    for (const id of ["Z0", "Z1", "Z2", "Z3"]) expect(y(after, id), id).toBe(y(before, id));
    // Packing happens once; the next layout keeps the packed heights.
    const again = chartLayout(catalog, chartOf([[], ["Z0", "Z1", "Z2", "Z3"], ["B", "D", "A"]]), [], {}, 18, after.memory);
    expect(["B", "D", "A"].map((id) => y(again, id))).toEqual(["B", "D", "A"].map((id) => y(after, id)));
  });

  it("lays out a reordered term afresh", () => {
    const catalog = createCatalog([obj("P"), obj("Q"), obj("R")]);
    const before = chartLayout(catalog, chartOf([[], ["P", "Q", "R"]]), [], {}, 18);
    const after = chartLayout(catalog, chartOf([[], ["R", "P", "Q"]]), [], {}, 18, before.memory);
    const order = courses(after.nodes)
      .sort((a, b) => a.position.y - b.position.y)
      .map((n) => n.id);
    expect(order).toEqual(["R", "P", "Q"]);
  });
});

describe("horizontal zoom geometry", () => {
  it("sizes cards to about 60% of the column, within limits", () => {
    expect(geometryFor(200)).toEqual({ columnWidth: 200, nodeWidth: 120 });
    expect(geometryFor(96).nodeWidth).toBe(64); // never narrower
    expect(geometryFor(800).nodeWidth).toBe(200); // never wider
    for (const width of [96, 150, 212, 400, 900]) {
      const { nodeWidth } = geometryFor(width);
      expect(width - nodeWidth, `gap at ${width}`).toBeGreaterThanOrEqual(16);
    }
  });

  it("goes compact (course code only) once cards are narrow", () => {
    expect(geometryFor(150).nodeWidth).toBeLessThan(COMPACT_BELOW);
    expect(geometryFor(212).nodeWidth).toBeGreaterThanOrEqual(COMPACT_BELOW);
  });

  it("writes course codes with a space", () => {
    expect(courseCode("CS101")).toBe("CS 101");
    expect(courseCode("MATH201")).toBe("MATH 201");
    expect(courseCode("CS102L")).toBe("CS 102L");
    expect(courseCode("SPAN-PROF")).toBe("SPAN-PROF");
  });

  it("spreads columns out without changing heights", () => {
    const state = initialState(loadSampleSchool(), "bs-cs");
    const view = derive(state);
    const at = (columnWidth: number) =>
      chartLayout(state.school.catalog, view.chart, [], {}, 12, undefined, geometryFor(columnWidth));
    const narrow = at(120);
    const wide = at(360);
    for (const n of courses(narrow.nodes)) {
      const w = wide.nodes.find((m) => m.id === n.id)!;
      expect(w.position.y, n.id).toBe(n.position.y);
      expect(w.width).toBe(geometryFor(360).nodeWidth);
    }
    const term = (layout: typeof narrow, i: number) => layout.nodes.find((n) => n.id === `term-${i}`)!;
    expect(term(wide, 2).position.x).toBe(2 * 360);
    expect(term(narrow, 2).position.x).toBe(2 * 120);
  });

  it("finds the drop term at any zoom", () => {
    const chart = chartOf([[], [], [], []]);
    const g = geometryFor(300);
    expect(termIndexAt(chart, 2 * 300 + 40, g)).toBe(2);
    expect(termIndexAt(chart, 0, g)).toBe(1); // never Pre-Credit
  });
});

describe("row grid", () => {
  it("puts every course on a whole row, so courses line up across terms", () => {
    let state = initialState(loadSampleSchool(), "bs-cs");
    state = plannerReducer(state, { type: "addProgram", ref: { templateId: "minor-stats", version: "2026-27" } });
    const layoutOf = (s: typeof state, memory?: Parameters<typeof chartLayout>[5]) => {
      const v = derive(s);
      return chartLayout(s.school.catalog, v.chart, v.check.issues, v.check.report.creditsByTerm, 12, memory);
    };
    const onGrid = (layout: ReturnType<typeof layoutOf>) =>
      courses(layout.nodes).every((n) => (n.position.y - HEADER_HEIGHT) % ROW_HEIGHT === 0);
    const before = layoutOf(state);
    expect(onGrid(before)).toBe(true);
    const moved = plannerReducer(state, { type: "move", objectId: "CS301", termIndex: state.chart.terms.at(-1)!.index });
    expect(onGrid(layoutOf(moved, before.memory))).toBe(true);
  });
});

describe("packed from the top", () => {
  it("starts every term on the top row with no gaps in a fresh plan", () => {
    let state = initialState(loadSampleSchool(), "bs-cs");
    state = plannerReducer(state, { type: "addProgram", ref: { templateId: "minor-stats", version: "2026-27" } });
    const view = derive(state);
    const { nodes } = chartLayout(state.school.catalog, view.chart, [], {}, 12);
    for (const term of view.chart.terms) {
      const ys = term.objectIds.map((id) => nodes.find((n) => n.id === id)!.position.y - HEADER_HEIGHT);
      expect(ys, term.label).toEqual(ys.map((_, k) => k * ROW_HEIGHT));
    }
  });
});
