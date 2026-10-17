// Turn a chart into React Flow nodes (boxes) and edges (arrows).
//
// Terms are vertical stripes; each object is a small card in its term's
// stripe. The layout tries to make requisite lines easy to follow by eye:
// wide gaps between terms, straight lines, one color per course, and card
// positions chosen so lines cross as little as possible.
import type { Edge, Node } from "@xyflow/react";
import {
  satisfies,
  EXTERNAL_TERM,
  EXTERNAL_TERM_LABEL,
  type Catalog,
  type Chart,
  type ChartIssue,
  type CourseObject,
  type Grade,
  type Season,
} from "../engine/index";

export const COLUMN_WIDTH = 212;
export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 52;
export const ROW_HEIGHT = 88;
export const HEADER_HEIGHT = 72;
const FOOTER_HEIGHT = 24;
// Cards are centered in their stripe, leaving a wide gap for lines.
const NODE_OFFSET = (COLUMN_WIDTH - NODE_WIDTH) / 2;

// The chart's horizontal sizes: how wide each term column is, and the cards
// in it. Zooming changes these (not the text or the row heights), so
// zooming in spreads the chart out sideways and zooming out compresses it.
export interface Geometry {
  columnWidth: number;
  nodeWidth: number;
}
export const DEFAULT_GEOMETRY: Geometry = { columnWidth: COLUMN_WIDTH, nodeWidth: NODE_WIDTH };

const MIN_NODE_WIDTH = 64;
const MAX_NODE_WIDTH = 200;
// Cards narrower than this show only the course code.
export const COMPACT_BELOW = 112;

// Horizontal zoom, as a whole percentage: 100 means the terms exactly fill
// the canvas width. It moves in steps of ZOOM_STEP, up to MAX_ZOOM_PERCENT.
export const ZOOM_STEP = 5;
export const MAX_ZOOM_PERCENT = 400;

// A zoom the user asked for (typed, or a step from the buttons) as one the
// chart allows: rounded up to the next step, and never below 100.
export function snapZoom(percent: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(100, Math.ceil(percent / ZOOM_STEP) * ZOOM_STEP));
}

// The sizes for a given column width: cards take about 60% of the column,
// leaving the rest for lines, within sensible limits.
export function geometryFor(columnWidth: number): Geometry {
  const nodeWidth = Math.round(Math.min(Math.max(columnWidth * 0.6, MIN_NODE_WIDTH), MAX_NODE_WIDTH));
  return { columnWidth, nodeWidth: Math.min(nodeWidth, columnWidth - 16) };
}

// A course id written for people: "CS101" becomes "CS 101".
export function courseCode(id: string): string {
  return id.replace(/^([A-Za-z]+)(\d)/, "$1 $2");
}

// The same, for every course code inside a sentence (an issue message, say):
// "CS390 needs CS201" -> "CS 390 needs CS 201". Only ids in the catalog are
// touched, whole words only, longest first (so CS102L isn't read as CS102).
const codePatterns = new WeakMap<Catalog, RegExp | null>();
export function withCourseCodes(text: string, catalog: Catalog): string {
  if (!codePatterns.has(catalog)) {
    const ids = [...catalog.keys()]
      .sort((a, b) => b.length - a.length)
      .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    codePatterns.set(catalog, ids.length ? new RegExp(`(?<![\\w-])(?:${ids.join("|")})(?![\\w-])`, "g") : null);
  }
  const pattern = codePatterns.get(catalog);
  return pattern ? text.replace(pattern, courseCode) : text;
}

// Line colors, one per course that other courses depend on. Red is left out
// on purpose: it only ever means "this link is out of order".
export const COURSE_COLORS = [
  "#2563eb", // blue
  "#0d9488", // teal
  "#7c3aed", // violet
  "#d97706", // amber
  "#16a34a", // green
  "#0891b2", // cyan
  "#a16207", // ochre
];
export const BROKEN_EDGE_COLOR = "#e11d48";

// React Flow requires node data to be a plain object type, so these use
// `type` rather than `interface`.
export type CourseNodeData = {
  object: CourseObject;
  grade?: Grade;
  issues: ChartIssue[];
  external: boolean;
  // Outline color; only courses that other courses depend on get one.
  color?: string;
  // Set when the object is offered in just one season.
  onlyIn?: Season;
  // Some other course needs a minimum grade in this one.
  needsMinGrade: boolean;
  generalEducation: boolean;
};

export type TermNodeData = {
  label: string;
  credits: number;
  maxCredits: number;
  external: boolean;
  // Every other stripe is shaded so terms are easy to tell apart.
  shaded: boolean;
  height: number;
};

export type EdgeData = {
  concurrent: boolean;
  broken: boolean;
  color: string;
  // The column width the chart is drawn at (for the drag rules).
  columnWidth: number;
};

export type CourseNode = Node<CourseNodeData, "course">;
export type TermNode = Node<TermNodeData, "term">;
export type PlannerNode = CourseNode | TermNode;
export type PlannerEdge = Edge<EdgeData>;

interface Link {
  source: string;
  target: string;
  concurrent: boolean;
  broken: boolean;
}

// What a layout remembers so the next one can keep things steady: each
// course's column (to tell an edit from a new plan) and each line color.
export interface LayoutMemory {
  column: Map<string, number>;
  colors: Map<string, string>;
}

// Reuse the previous arrangement only when at least this share of courses
// are still in the same term. Otherwise (a newly built plan, a different
// program) lay everything out fresh.
const REUSE_SHARE = 0.5;

export function chartLayout(
  catalog: Catalog,
  chart: Chart,
  issues: ChartIssue[],
  creditsByTerm: Record<number, number>,
  maxCredits: number,
  // The previous layout's memory, so moving one course doesn't reshuffle
  // the others or change their colors.
  previous?: LayoutMemory,
  geometry: Geometry = DEFAULT_GEOMETRY,
): { nodes: PlannerNode[]; edges: PlannerEdge[]; memory: LayoutMemory; fresh: boolean } {
  const { columnWidth, nodeWidth } = geometry;
  const nodeOffset = (columnWidth - nodeWidth) / 2;
  // 1. What's placed where, and every requisite link between placed objects.
  const columns = chart.terms.map((term) => term.objectIds.filter((id) => catalog.has(id)));
  const columnOf = new Map<string, number>();
  columns.forEach((ids, column) => ids.forEach((id) => columnOf.set(id, column)));
  const links = requisiteLinks(catalog, chart, columnOf);

  // 2. Cards go top to bottom in each term's order as stored in the chart
  //    (the user's order; see arrangeChart for a fresh plan's), packed from
  //    the top with no gaps. The order only changes where the user changes
  //    it, so a move shifts just the cards below it, by one row.
  const stayed = [...columnOf].filter(([id, column]) => previous?.column.get(id) === column).map(([id]) => id);
  const reuse = previous !== undefined && stayed.length >= REUSE_SHARE * columnOf.size;
  const ordered = columns;
  const y = placeVertically(ordered);

  // 3. Colors for courses that have outgoing lines; a course keeps its color.
  const colors = assignColors(ordered, links, y, reuse ? previous.colors : undefined);

  // 4. Nodes: one stripe per term (drawn under the lines), then the cards.
  const bottom = Math.max(ROW_HEIGHT, ...[...y.values()].map((v) => v + NODE_HEIGHT));
  const stripeHeight = HEADER_HEIGHT + bottom + FOOTER_HEIGHT;
  const minGradeIds = new Set(
    [...catalog.values()].flatMap((o) => Object.keys(o.requisites.minGrades ?? {})),
  );

  const nodes: PlannerNode[] = chart.terms.map((term, column) => ({
    id: `term-${term.index}`,
    type: "term",
    position: { x: column * columnWidth, y: 0 },
    data: {
      label: term.index === EXTERNAL_TERM ? EXTERNAL_TERM_LABEL : term.label,
      credits: creditsByTerm[term.index] ?? 0,
      maxCredits,
      external: term.index === EXTERNAL_TERM,
      shaded: column % 2 === 1,
      height: stripeHeight,
    },
    // Fixed sizes let React Flow draw nodes before measuring them
    // (including in the server-rendered HTML).
    width: columnWidth,
    height: stripeHeight,
    draggable: false,
    selectable: false,
    focusable: false,
    // Below the lines (which sit at 0), so stripes never hide them.
    zIndex: -1,
    className: "term-stripe",
  }));

  ordered.forEach((ids, column) => {
    const external = chart.terms[column].index === EXTERNAL_TERM;
    for (const id of ids) {
      const object = catalog.get(id)!;
      const seasons = object.availability?.seasons;
      nodes.push({
        id,
        type: "course",
        position: { x: column * columnWidth + nodeOffset, y: HEADER_HEIGHT + y.get(id)! },
        data: {
          object,
          ...(chart.grades?.[id] && { grade: chart.grades[id] }),
          // Messages with course codes written as on the card ("CS 201").
          issues: issues
            .filter((issue) => issue.objectId === id)
            .map((issue) => ({ ...issue, message: withCourseCodes(issue.message, catalog) })),
          external,
          ...(colors.has(id) && { color: colors.get(id) }),
          ...(seasons?.length === 1 && { onlyIn: seasons[0] }),
          needsMinGrade: minGradeIds.has(id),
          generalEducation: object.categories.includes("general-education"),
        },
        width: nodeWidth,
        height: NODE_HEIGHT,
        // Pre-Credit is filled automatically from outside credit.
        draggable: !external,
        zIndex: 1,
      });
    }
  });

  // 5. Straight lines between card borders. They're drawn by the "floating"
  //    edge in ChartFlow, which aims each line from card center to card
  //    center and stops it at each card's nearest side (see edgeEndpoints).
  const edges: PlannerEdge[] = links.map((link) => {
    const color = link.broken ? BROKEN_EDGE_COLOR : (colors.get(link.source) ?? COURSE_COLORS[0]);
    return {
      id: `${link.source}->${link.target}`,
      source: link.source,
      target: link.target,
      type: "floating",
      className: link.broken ? "requisite-edge requisite-edge-broken" : "requisite-edge",
      style: {
        stroke: color,
        strokeWidth: link.broken ? 2.5 : 1.75,
        ...(link.concurrent && { strokeDasharray: "6 4" }),
      },
      markerEnd: { type: "arrowclosed" as const, color, width: 16, height: 16 },
      data: { concurrent: link.concurrent, broken: link.broken, color, columnWidth },
    };
  });

  // `fresh`: laid out from scratch (a new plan), not kept from last time.
  return { nodes, edges, memory: { column: columnOf, colors }, fresh: !reuse };
}

// One link from each placed requisite (or an equivalent standing in for it)
// to the placed object that needs it.
function requisiteLinks(catalog: Catalog, chart: Chart, columnOf: Map<string, number>): Link[] {
  const termIndexOf = (id: string) => chart.terms[columnOf.get(id)!].index;
  const links: Link[] = [];
  for (const [id] of columnOf) {
    const targetTerm = termIndexOf(id);
    if (targetTerm === EXTERNAL_TERM) continue;
    const { previous, concurrent } = catalog.get(id)!.requisites;
    const needs = [
      ...previous.map((req) => ({ req, concurrent: false })),
      ...concurrent.map((req) => ({ req, concurrent: true })),
    ];
    for (const { req, concurrent: isConcurrent } of needs) {
      for (const [sourceId] of columnOf) {
        if (sourceId === id || !satisfies(catalog, req, sourceId)) continue;
        const sourceTerm = termIndexOf(sourceId);
        const ok = isConcurrent ? sourceTerm <= targetTerm : sourceTerm < targetTerm;
        links.push({ source: sourceId, target: id, concurrent: isConcurrent, broken: !ok });
      }
    }
  }
  return links;
}

// Order cards within each column so lines cross less: the "barycenter"
// method. Each card moves toward the average position of the cards it's
// linked to in the neighboring direction. Sweeping forward (using
// requisites) and backward (using dependents) a few times settles it.
function orderColumns(
  columns: string[][],
  links: Link[],
  columnOf: Map<string, number>,
): string[][] {
  const order = columns.map((ids) => [...ids]);
  const neighbors = (id: string, direction: "before" | "after") =>
    links
      .filter((l) => (direction === "before" ? l.target === id : l.source === id))
      .map((l) => (direction === "before" ? l.source : l.target))
      .filter((other) => {
        const c = columnOf.get(other)!;
        return direction === "before" ? c < columnOf.get(id)! : c > columnOf.get(id)!;
      });

  const sortColumn = (column: number, direction: "before" | "after") => {
    const position = new Map<string, number>();
    order.forEach((ids) => ids.forEach((id, row) => position.set(id, row)));
    const score = (id: string, row: number) => {
      const linked = neighbors(id, direction);
      // No links that way: stay where it is.
      if (linked.length === 0) return row;
      return linked.reduce((sum, other) => sum + position.get(other)!, 0) / linked.length;
    };
    const scored = order[column].map((id, row) => ({ id, row, score: score(id, row) }));
    // Ties keep their current order, so the result is stable.
    scored.sort((a, b) => a.score - b.score || a.row - b.row);
    order[column] = scored.map((s) => s.id);
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c < order.length; c++) sortColumn(c, "before");
    for (let c = order.length - 2; c >= 0; c--) sortColumn(c, "after");
  }
  for (let c = 1; c < order.length; c++) sortColumn(c, "before");

  // Clean-up: try swapping each pair of neighboring cards, and keep a swap
  // only if the lines (as actually drawn) cross less. Charts are small, so
  // measuring every option is quick.
  let best = countCrossings(order, links, columnOf);
  for (let pass = 0; pass < 4 && best > 0; pass++) {
    let improved = false;
    for (const ids of order) {
      for (let i = 0; i + 1 < ids.length; i++) {
        [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
        const count = countCrossings(order, links, columnOf);
        if (count < best) {
          best = count;
          improved = true;
        } else {
          [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]; // undo
        }
      }
    }
    if (!improved) break;
  }

  // Keep a concurrent pair (e.g. lecture and lab) next to each other.
  for (const link of links) {
    if (!link.concurrent || columnOf.get(link.source) !== columnOf.get(link.target)) continue;
    const ids = order[columnOf.get(link.source)!];
    ids.splice(ids.indexOf(link.target), 1);
    ids.splice(ids.indexOf(link.source) + 1, 0, link.target);
  }
  return order;
}

// How many pairs of lines between different terms cross, with cards placed
// as placeVertically would place them for this order.
function countCrossings(order: string[][], links: Link[], columnOf: Map<string, number>): number {
  const y = placeVertically(order);
  const rect = (id: string): Rect => ({
    x: columnOf.get(id)! * COLUMN_WIDTH + NODE_OFFSET,
    y: y.get(id)!,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  });
  const segments = links
    .filter((l) => columnOf.get(l.source) !== columnOf.get(l.target))
    .map((l) => {
      const { start, end } = edgeEndpoints(rect(l.source), rect(l.target));
      return { ends: [l.source, l.target], x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    });
  // Which side of line a->b the point c is on: -1, 0, or 1.
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

  let count = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const p = segments[i];
      const q = segments[j];
      // Lines that share a card meet there; that isn't a crossing.
      if (p.ends.some((id) => q.ends.includes(id))) continue;
      const crossesQ = side(q.x1, q.y1, q.x2, q.y2, p.x1, p.y1) * side(q.x1, q.y1, q.x2, q.y2, p.x2, p.y2) < 0;
      const crossesP = side(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1) * side(p.x1, p.y1, p.x2, p.y2, q.x2, q.y2) < 0;
      if (crossesQ && crossesP) count++;
    }
  }

  // A line running behind an unrelated card is worse than a crossing: it
  // looks like it goes through that course.
  const cards = [...columnOf.keys()].map((id) => ({ id, box: rect(id) }));
  for (const segment of segments) {
    for (const card of cards) {
      if (segment.ends.includes(card.id)) continue;
      if (segmentHitsRect(segment, card.box)) count += THROUGH_CARD_PENALTY;
    }
  }
  return count;
}

// How many crossings a line running behind a card counts as.
const THROUGH_CARD_PENALTY = 3;

// Does the segment pass through the inside of the box? Touching an edge
// doesn't count. (Liang-Barsky clipping.)
function segmentHitsRect(s: { x1: number; y1: number; x2: number; y2: number }, r: Rect): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (denominator: number, numerator: number) => {
    if (denominator === 0) return numerator > 0;
    const t = numerator / denominator;
    if (denominator < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  const inside =
    clip(-dx, s.x1 - r.x) &&
    clip(dx, r.x + r.width - s.x1) &&
    clip(-dy, s.y1 - r.y) &&
    clip(dy, r.y + r.height - s.y1);
  return inside && t1 - t0 > 1e-6;
}

// Vertical positions. Each term is packed from the top, in its order, on
// whole rows (so courses line up across terms), with no gaps.
function placeVertically(order: string[][]): Map<string, number> {
  const y = new Map<string, number>();
  for (const ids of order) ids.forEach((id, row) => y.set(id, row * ROW_HEIGHT));
  return y;
}

// Give each course with outgoing lines a color, avoiding colors already
// used by nearby courses so neighboring lines are easy to tell apart.
// Courses that already had a color keep it, so lines stay easy to follow
// by eye as the plan changes.
function assignColors(
  order: string[][],
  links: Link[],
  y: Map<string, number>,
  keep?: Map<string, string>,
): Map<string, string> {
  const sources = new Set(links.map((l) => l.source));
  const colors = new Map<string, string>();
  const used = new Map<string, number>(COURSE_COLORS.map((c) => [c, 0]));
  const placed: { column: number; y: number; color: string }[] = [];

  order.forEach((ids, column) => {
    for (const id of ids) {
      const color = keep?.get(id);
      if (!sources.has(id) || !color) continue;
      colors.set(id, color);
      used.set(color, (used.get(color) ?? 0) + 1);
      placed.push({ column, y: y.get(id)!, color });
    }
  });

  order.forEach((ids, column) => {
    for (const id of ids) {
      if (!sources.has(id) || colors.has(id)) continue;
      const near = placed.filter(
        (p) => Math.abs(p.column - column) <= 1 && Math.abs(p.y - y.get(id)!) <= 3 * ROW_HEIGHT,
      );
      const best = [...COURSE_COLORS].sort(
        (a, b) =>
          near.filter((p) => p.color === a).length - near.filter((p) => p.color === b).length ||
          used.get(a)! - used.get(b)!,
      )[0];
      colors.set(id, best);
      used.set(best, used.get(best)! + 1);
      placed.push({ column, y: y.get(id)!, color: best });
    }
  });
  return colors;
}

// Everything connected to `id` through requisites: what it needs (all the
// way back) and what needs it (all the way forward), plus itself.
export function relatedTo(edges: Pick<Edge, "source" | "target">[], id: string): Set<string> {
  // Follow edges in one direction only, so "siblings" (other courses that
  // happen to share a requisite) aren't pulled in.
  const reach = (forward: boolean) => {
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const from = stack.pop()!;
      for (const edge of edges) {
        const [here, there] = forward ? [edge.source, edge.target] : [edge.target, edge.source];
        if (here === from && !seen.has(there)) {
          seen.add(there);
          stack.push(there);
        }
      }
    }
    return seen;
  };
  return new Set([id, ...reach(true), ...reach(false)]);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

// The two ends of a straight line joining two cards. Like a printed
// flowchart, lines between terms run from the middle of one card's left or
// right side to the middle of the facing side of the other card. Cards
// stacked in the same column (e.g. a lab under its lecture) join from the
// middle of the facing top and bottom instead.
//
// With `anySide` (used while a card is being dragged), "same term" means
// the cards' centers are over the same column; see draggingEndpoints.
export function edgeEndpoints(source: Rect, target: Rect, anySide = false) {
  const s = center(source);
  const t = center(target);
  const vertical = source.x < target.x + target.width && target.x < source.x + source.width;

  if (anySide) {
    const { start, end } = draggingEndpoints(source, target);
    return { start, end };
  }

  if (vertical) {
    const targetBelow = t.y > s.y;
    return {
      start: { x: s.x, y: targetBelow ? source.y + source.height : source.y },
      end: { x: t.x, y: targetBelow ? target.y : target.y + target.height },
    };
  }
  const targetRight = t.x > s.x;
  return {
    start: { x: targetRight ? source.x + source.width : source.x, y: s.y },
    end: { x: targetRight ? target.x : target.x + target.width, y: t.y },
  };
}

export type Side = "left" | "right" | "top" | "bottom";
type Point = { x: number; y: number };

// While a card is dragged, how far past the edge of a term's column it must
// go before a top-to-bottom link (same term) switches to a side-to-side one.
// Without it, a card held right on a column edge flickers between the two.
export const TERM_SWITCH_MARGIN = 24;

// The term column a point on the canvas falls in.
const columnAt = (x: number, columnWidth: number) => Math.floor(x / columnWidth);

export function sideMiddle(r: Rect, side: Side): { x: number; y: number } {
  const c = center(r);
  switch (side) {
    case "left":
      return { x: r.x, y: c.y };
    case "right":
      return { x: r.x + r.width, y: c.y };
    case "top":
      return { x: c.x, y: r.y };
    case "bottom":
      return { x: c.x, y: r.y + r.height };
  }
}

// Which side of a card a point on its border is on.
export function sideAt(r: Rect, p: { x: number; y: number }): Side {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (near(p.x, r.x)) return "left";
  if (near(p.x, r.x + r.width)) return "right";
  return near(p.y, r.y) ? "top" : "bottom";
}

// While a card is dragged, the least horizontal gap between two cards for a
// line to join their left and right sides. Closer than that (e.g. a card
// dragged just past a column edge, almost level with a card in the next
// term), a side-to-side line would run nearly straight up and down along
// the cards' edges, so they join top to bottom instead.
export const MIN_SIDE_GAP = 40;

// Both ends of a line while a card is being dragged, at side middles: the
// facing left and right sides, or the facing top and bottom when the cards
// are over the same term's column (or too close across for a side-to-side
// line; see MIN_SIDE_GAP). Pass the sides from last time so a card held on
// a switch point doesn't flicker (see TERM_SWITCH_MARGIN).
export function draggingEndpoints(
  source: Rect,
  target: Rect,
  previous: { start?: Side; end?: Side } = {},
  columnWidth = COLUMN_WIDTH,
) {
  const s = center(source);
  const t = center(target);
  const wasVertical = previous.start === "top" || previous.start === "bottom";
  const margin = wasVertical ? TERM_SWITCH_MARGIN : 0;
  const sameTerm =
    columnAt(s.x, columnWidth) === columnAt(t.x, columnWidth) ||
    (wasVertical && Math.abs(s.x - t.x) < columnWidth / 2 + margin);
  // Space between the cards across and down (negative when they overlap).
  const gapX = Math.max(target.x - (source.x + source.width), source.x - (target.x + target.width));
  const gapY = Math.max(target.y - (source.y + source.height), source.y - (target.y + target.height));
  // Too close across for a side-to-side line, but only when the cards are
  // also farther apart down than across: cards side by side (even close
  // together) still join their facing left and right sides.
  const tooCloseAcross = gapX < MIN_SIDE_GAP + margin && gapY > gapX - margin;

  const [startSide, endSide]: [Side, Side] = sameTerm || tooCloseAcross
    ? t.y > s.y
      ? ["bottom", "top"]
      : ["top", "bottom"]
    : t.x > s.x
      ? ["right", "left"]
      : ["left", "right"];
  return { start: sideMiddle(source, startSide), end: sideMiddle(target, endSide), startSide, endSide };
}

// Of the two ways around a border from `from` to `to`, the one whose
// halfway point is nearer `toward`. Used so an end switching sides flows
// around the edge facing the other end of its line.
export function perimeterStepToward(r: Rect, from: number, to: number, toward: Point): number {
  const total = perimeterLength(r);
  const short = perimeterStep(from, to, total);
  if (Math.abs(short) < 1e-9) return 0;
  const long = short > 0 ? short - total : short + total;
  const distance = (step: number) => {
    const p = perimeterPoint(r, from + step / 2);
    return Math.hypot(p.x - toward.x, p.y - toward.y);
  };
  return distance(long) < distance(short) ? long : short;
}

// Positions along a card's border, measured as a distance clockwise from
// its top-left corner: along the top, down the right side, back along the
// bottom, and up the left side. Used to glide an arrowhead around a card.
export function perimeterLength(r: Rect): number {
  return 2 * (r.width + r.height);
}

// The distance along the border of a point on the border.
export function perimeterOffset(r: Rect, p: { x: number; y: number }): number {
  const { width: w, height: h } = r;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (near(p.y, r.y)) return p.x - r.x; // top
  if (near(p.x, r.x + w)) return w + (p.y - r.y); // right
  if (near(p.y, r.y + h)) return w + h + (r.x + w - p.x); // bottom
  return 2 * w + h + (r.y + h - p.y); // left
}

// The point at a distance along the border (any number; it wraps around).
export function perimeterPoint(r: Rect, offset: number): { x: number; y: number } {
  const { width: w, height: h } = r;
  const total = perimeterLength(r);
  const d = ((offset % total) + total) % total;
  if (d <= w) return { x: r.x + d, y: r.y };
  if (d <= w + h) return { x: r.x + w, y: r.y + (d - w) };
  if (d <= 2 * w + h) return { x: r.x + w - (d - w - h), y: r.y + h };
  return { x: r.x, y: r.y + h - (d - 2 * w - h) };
}

// The shortest way around the border from one offset to another: a
// change between -half and +half the border's length.
export function perimeterStep(from: number, to: number, total: number): number {
  const step = (((to - from) % total) + total) % total;
  return step > total / 2 ? step - total : step;
}

// Which term a card was dropped on, from where its center ended up.
// Never Pre-Credit (it's filled from outside work), whether it's shown or not.
export function termIndexAt(chart: Chart, x: number, geometry: Geometry = DEFAULT_GEOMETRY): number {
  const choosable = chart.terms.map((term, column) => ({ term, column })).filter(({ term }) => term.index !== EXTERNAL_TERM);
  if (choosable.length === 0) return 1;
  const column = Math.floor((x + geometry.nodeWidth / 2) / geometry.columnWidth);
  const first = choosable[0].column;
  const last = choosable[choosable.length - 1].column;
  return chart.terms[Math.min(Math.max(column, first), last)].index;
}

// A fresh plan's top-to-bottom order in each term: the order with the
// fewest crossing lines (see orderColumns), courses taken together kept
// next to each other. Run when a plan is created or built; after that the
// order is the user's, and the layout follows it.
export function arrangeChart(catalog: Catalog, chart: Chart): Chart {
  const columns = chart.terms.map((term) => term.objectIds.filter((id) => catalog.has(id)));
  const columnOf = new Map<string, number>();
  columns.forEach((ids, column) => ids.forEach((id) => columnOf.set(id, column)));
  const order = orderColumns(columns, requisiteLinks(catalog, chart, columnOf), columnOf);
  return {
    ...chart,
    terms: chart.terms.map((term, column) => ({
      ...term,
      // Anything not in the catalog stays, at the end.
      objectIds: [...order[column], ...term.objectIds.filter((id) => !catalog.has(id))],
    })),
  };
}
