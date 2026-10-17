"use client";

// The flowchart: terms as shaded stripes, objects as small cards, and
// requisites as straight colored lines. Drag a card to another term to move
// it; point at (or select) a card to trace everything it's connected to.
import {
  BaseEdge,
  Handle,
  Panel as FlowPanel,
  Position,
  ReactFlow,
  useInternalNode,
  useNodesState,
  useViewport,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Catalog, Chart, ChartIssue } from "../engine/index";
import {
  chartLayout,
  edgeEndpoints,
  perimeterOffset,
  perimeterPoint,
  perimeterStepToward,
  sideAt,
  draggingEndpoints,
  type Side,
  relatedTo,
  BROKEN_EDGE_COLOR,
  COLUMN_WIDTH,
  COMPACT_BELOW,
  courseCode,
  geometryFor,
  HEADER_HEIGHT,
  MAX_ZOOM_PERCENT,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  snapZoom,
  termIndexAt,
  ZOOM_STEP,
  type CourseNode,
  type Geometry,
  type LayoutMemory,
  type PlannerEdge,
  type PlannerNode,
  type Rect,
  type TermNode,
} from "../planner/layout";
import { concurrentBlock, dropIndex, packedTops, reorderPreview } from "../planner/ordering";
import { FitIcon, MinusIcon, PlusIcon, RedoIcon, UndoIcon } from "./icons";
import { cn, SEASON_TINT } from "./ui";

const hidden = { opacity: 0, pointerEvents: "none" as const };

// React Flow needs an attachment point on each card, but the floating edge
// below works out where lines really meet the card, so these stay hidden.
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} style={hidden} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={hidden} />
    </>
  );
}

// A card's current box on the canvas (it moves while being dragged).
function nodeRect(node: InternalNode): Rect {
  return {
    ...node.internals.positionAbsolute,
    width: node.measured.width ?? node.width ?? NODE_WIDTH,
    height: node.measured.height ?? node.height ?? NODE_HEIGHT,
  };
}

const GLIDE_MS = 220;

// Ease an end's position along its card's border toward `goal`. It moves
// around the border (so it flows around corners instead of cutting across),
// going the way that passes nearer `toward`, the other end of its line.
// Interrupting a glide just starts the next one from wherever it got to.
function useBorderGlide(goal: number, rect: Rect | undefined, toward: { x: number; y: number } | undefined): number {
  const [offset, setOffset] = useState(goal);
  const current = useRef(goal);
  // The latest card box and other end, read when a glide starts.
  const latest = useRef({ rect, toward });
  useEffect(() => {
    latest.current = { rect, toward };
  });

  useEffect(() => {
    const settle = (value: number) => {
      current.current = value;
      setOffset(value);
    };
    const { rect: box, toward: other } = latest.current;
    const from = current.current;
    const step = box && other ? perimeterStepToward(box, from, goal, other) : goal - from;
    if (Math.abs(step) < 0.5 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settle(goal);
      return;
    }
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - started) / GLIDE_MS);
      const eased = 1 - (1 - t) ** 3; // fast at first, then easing in
      settle(from + step * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [goal]);

  return offset;
}

// A straight line between the middles of the facing sides of two cards,
// whichever way the cards are arranged (even backwards or stacked). While
// either card is being dragged, the ends go to the facing left and right
// sides (top and bottom when over the same term), flowing smoothly around
// their card's border when they switch.
function FloatingEdge({ id, source, target, markerEnd, style, data }: EdgeProps<PlannerEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceRect = sourceNode && nodeRect(sourceNode);
  const targetRect = targetNode && nodeRect(targetNode);
  const dragging = Boolean(sourceNode?.dragging || targetNode?.dragging);

  // The sides the ends were on last time, so they don't flicker between
  // sides when a card is held near a switch point.
  const lastSides = useRef<{ start?: Side; end?: Side }>({});
  const ends =
    sourceRect && targetRect
      ? dragging
        ? draggingEndpoints(sourceRect, targetRect, lastSides.current, data?.columnWidth)
        : edgeEndpoints(sourceRect, targetRect)
      : null;
  useEffect(() => {
    if (!ends || !sourceRect || !targetRect) return;
    lastSides.current = { start: sideAt(sourceRect, ends.start), end: sideAt(targetRect, ends.end) };
  });

  // Hooks must run on every render, so these use stand-in values until
  // both cards exist.
  const tailOffset = useBorderGlide(
    ends && sourceRect ? perimeterOffset(sourceRect, ends.start) : 0,
    sourceRect,
    ends?.end,
  );
  const headOffset = useBorderGlide(
    ends && targetRect ? perimeterOffset(targetRect, ends.end) : 0,
    targetRect,
    ends?.start,
  );

  if (!sourceRect || !targetRect) return null;
  const tail = perimeterPoint(sourceRect, tailOffset);
  const head = perimeterPoint(targetRect, headOffset);
  return <BaseEdge id={id} path={`M ${tail.x},${tail.y} L ${head.x},${head.y}`} markerEnd={markerEnd} style={style} />;
}

function CourseCard({ data, selected, width }: NodeProps<CourseNode>) {
  const { object, grade, issues, external, color, onlyIn, needsMinGrade, generalEducation } = data;
  const markers = `${needsMinGrade ? "*" : ""}${generalEducation ? "+" : ""}`;
  const cardWidth = width ?? NODE_WIDTH;
  // Compressed (zoomed out): just the course code, e.g. "CS 101".
  const compact = cardWidth < COMPACT_BELOW;
  return (
    <div
      style={{ width: cardWidth, height: NODE_HEIGHT, ...(color && { borderColor: color }) }}
      className={cn(
        "relative flex flex-col justify-center rounded-md border-2 px-2 text-zinc-900 shadow-sm dark:text-zinc-100",
        (onlyIn && SEASON_TINT[onlyIn]) || "bg-white dark:bg-zinc-900",
        // Selected: a ring just inside the border, so nothing reaches past
        // the card's edge where arrowheads touch it.
        selected && "inset-ring-2 inset-ring-sky-500",
        !color && "border-zinc-300 dark:border-zinc-600",
        external && "border-dashed",
        !external && "cursor-grab active:cursor-grabbing",
        compact && "items-center px-1",
      )}
      title={[`${courseCode(object.id)}: ${object.title} (${object.credits} cr)`, ...issues.map((i) => i.message)].join("\n")}
    >
      <Handles />
      {compact ? (
        <span className="truncate font-mono text-xs font-semibold">
          {courseCode(object.id)}
          {markers}
        </span>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-1">
            <span className="truncate font-mono text-xs font-semibold">
              {courseCode(object.id)}
              {markers}
            </span>
            <span className="text-[11px] whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400">
              {grade && <span className="mr-1 font-semibold text-emerald-700 dark:text-emerald-400">{grade}</span>}
              {object.credits} cr
            </span>
          </div>
          <div className="truncate text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">{object.title}</div>
        </>
      )}
      {issues.length > 0 && (
        <span
          aria-label={`${issues.length} issue${issues.length > 1 ? "s" : ""}`}
          className="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white"
        >
          {issues.length}
        </span>
      )}
    </div>
  );
}

// A term's header. The shaded band behind the term is drawn by TermBands,
// so it can fill the canvas from top to bottom.
function TermStripe({ data, width }: NodeProps<TermNode>) {
  const over = !data.external && data.credits > data.maxCredits;
  return (
    <div style={{ width: width ?? COLUMN_WIDTH, height: data.height }} className="px-1 pt-3 text-center">
      <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{data.label}</div>
      <div className={cn("truncate text-xs", over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400")}>
        {data.credits}
        {!data.external && ` / ${data.maxCredits}`} credits
      </div>
    </div>
  );
}

// The alternating term bands, filling the whole height of the canvas. They
// follow panning and zooming sideways, and sit under the lines and cards.
function TermBands({ terms, columnWidth }: { terms: TermNode["data"][]; columnWidth: number }) {
  const { x } = useViewport();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {terms.map((term, column) => (
        <div
          key={column}
          className={cn(
            "absolute top-0 bottom-0",
            term.external
              ? "bg-sky-50 dark:bg-sky-950/40"
              : term.shaded
                ? "bg-zinc-100 dark:bg-white/5"
                : "bg-transparent",
          )}
          style={{ left: x + column * columnWidth, width: columnWidth }}
        />
      ))}
    </div>
  );
}

// Shared look for the small button groups on the chart (zoom, undo/redo).
const controlGroup =
  "flex items-center divide-x divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900";
const button =
  "flex h-7 min-w-7 items-center justify-center px-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800";

// Undo and redo for changes to the plan.
function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className={controlGroup}>
      <button type="button" className={button} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <UndoIcon />
      </button>
      <button type="button" className={button} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
        <RedoIcon />
      </button>
    </div>
  );
}

// Horizontal zoom buttons. Zooming spreads the terms out sideways or
// compresses them; text and rows keep their size.
function ZoomControls({
  zoom,
  onZoom,
  onFit,
}: {
  // A whole percentage.
  zoom: number;
  onZoom: (percent: number) => void;
  onFit: () => void;
}) {
  // What's typed in the box; applied on Enter or leaving the box.
  const [draft, setDraft] = useState<string | null>(null);
  const apply = () => {
    const typed = Number.parseFloat(draft ?? "");
    if (Number.isFinite(typed)) onZoom(snapZoom(typed));
    setDraft(null);
  };
  return (
    <div className={controlGroup}>
      <button type="button" className={button} aria-label="Compress the chart" title="Compress" disabled={zoom <= 100} onClick={() => onZoom(zoom - BUTTON_ZOOM_STEP)}>
        <MinusIcon />
      </button>
      <label className="flex h-7 items-center px-1.5 text-xs text-zinc-500 tabular-nums">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Zoom percent"
          title={`Zoom: 100–${MAX_ZOOM_PERCENT}%, in steps of ${ZOOM_STEP}`}
          className="w-[3ch] bg-transparent text-right outline-none focus:text-zinc-900 dark:focus:text-zinc-100"
          value={draft ?? String(zoom)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setDraft(null);
              // Leave without applying what was typed.
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
          }}
        />
        %
      </label>
      <button type="button" className={button} aria-label="Spread the chart out" title="Spread out" disabled={zoom >= MAX_ZOOM_PERCENT} onClick={() => onZoom(zoom + BUTTON_ZOOM_STEP)}>
        <PlusIcon />
      </button>
      <button type="button" className={button} aria-label="Fit to width" title="Fit to width" onClick={onFit}>
        <FitIcon />
      </button>
    </div>
  );
}

// The size of an element, kept up to date as it changes.
function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// Columns never get narrower than this (with many terms the chart then
// scrolls sideways even at 100%). See snapZoom for the zoom steps.
const MIN_COLUMN_WIDTH = 96;
// The + / − buttons zoom this much at a time (a typed zoom or Ctrl/Cmd +
// scroll goes in finer steps of ZOOM_STEP).
const BUTTON_ZOOM_STEP = 20;
// Ctrl/Cmd + scroll: this much scrolling (in pixels) is one zoom step.
const WHEEL_PER_STEP = 100;
// Cards being dragged sit above the rest.
const DRAGGING_Z = 1000;
// How long the other cards take to slide aside while reordering.
const SHIFT_MS = 150;

type Point = { x: number; y: number };

// Defined outside the component so React Flow sees the same object each render.
const nodeTypes: NodeTypes = { course: CourseCard, term: TermStripe };
const edgeTypes: EdgeTypes = { floating: FloatingEdge };

function Legend() {
  const line = (dashed: boolean, color = "currentColor") => (
    <svg width="28" height="8" aria-hidden className="shrink-0">
      <line x1="0" y1="4" x2="28" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "5 3" : undefined} />
    </svg>
  );
  const swatch = (className: string) => <span className={cn("inline-block size-3 shrink-0 rounded-sm border", className)} />;
  const item = "flex items-center gap-1.5";
  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-zinc-200 bg-white/90 px-3 py-1.5 text-[11px] text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300">
      <span className={item}>{line(false)} take first</span>
      <span className={item}>{line(true)} take together</span>
      <span className={item}>{line(false, BROKEN_EDGE_COLOR)} out of order</span>
      <span className={item}>
        {swatch("border-orange-300 bg-orange-100 dark:border-amber-800 dark:bg-amber-950")} fall only
      </span>
      <span className={item}>
        {swatch("border-green-300 bg-green-100 dark:border-green-800 dark:bg-green-950")} spring only
      </span>
      <span className={item}>
        <b className="font-mono">*</b> minimum grade
      </span>
      <span className={item}>
        <b className="font-mono">+</b> gen ed
      </span>
    </div>
  );
}

// The viewer's light/dark preference. React Flow has a "system" mode, but
// with server rendering it can get stuck on light: the server can't know
// the preference, and React keeps the server's class when the page loads.
// Starting as "light" everywhere and switching after load avoids that.
function useColorScheme(): "light" | "dark" {
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setScheme(query.matches ? "dark" : "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return scheme;
}

export interface ChartFlowProps {
  catalog: Catalog;
  chart: Chart;
  issues: ChartIssue[];
  creditsByTerm: Record<number, number>;
  maxCredits: number;
  selectedId: string | null;
  // `position`: where in the term's top-to-bottom order it was dropped.
  onMove: (objectId: string, termIndex: number, position: number) => void;
  onSelect: (objectId: string | null) => void;
  // Changes when a whole new plan appears: lay it out fresh.
  layoutVersion?: number;
  // Identifies this version of the plan (the same object whenever undo or
  // redo brings it back), so its exact arrangement can be restored.
  planVersion?: object;
  // Extra controls floating on the chart's top corners (e.g. the icons of
  // collapsed sidebars).
  topLeft?: ReactNode;
  topRight?: ReactNode;
  // Undo/redo (buttons in the top-left corner).
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function ChartFlow({
  catalog,
  chart,
  issues,
  creditsByTerm,
  maxCredits,
  selectedId,
  onMove,
  onSelect,
  layoutVersion = 0,
  planVersion = chart,
  topLeft,
  topRight,
  canUndo = false,
  canRedo = false,
  onUndo = () => {},
  onRedo = () => {},
}: ChartFlowProps) {
  // The chart fills the canvas: measure it, and size the term columns to
  // fit across it, times the horizontal zoom.
  const wrapper = useRef<HTMLDivElement>(null);
  const size = useElementSize(wrapper);
  // A whole percentage (see snapZoom).
  const [zoom, setZoom] = useState(100);
  const columns = Math.max(chart.terms.length, 1);
  const fillWidth = size ? Math.max(size.width / columns, MIN_COLUMN_WIDTH) : COLUMN_WIDTH;
  const geometry: Geometry = useMemo(() => geometryFor((fillWidth * zoom) / 100), [fillWidth, zoom]);

  // The previous layout's arrangement, so a change (like moving one course)
  // keeps everything else where it was and every course its color.
  const memory = useRef<LayoutMemory | undefined>(undefined);
  // The card being dragged: its term, the block moving with it, and where
  // every card started.
  const drag = useRef<{
    id: string;
    termIndex: number | undefined;
    termIds: string[];
    block: string[];
    start: Map<string, Point>;
    // Where the block would go in its own term right now (null when the
    // card isn't over its own term).
    previewIndex: number | null;
    // The preview being shown (which term, which spot), so cards only
    // slide when it changes.
    previewKey: string | null;
  } | null>(null);
  // Where to start from: the arrangement this exact version of the plan
  // had before (when undo/redo brings it back), else the latest one, or
  // nothing for a whole new plan (see layoutVersion).
  const memoryVersion = useRef(layoutVersion);
  const arrangements = useRef(new WeakMap<object, LayoutMemory>());
  const layout = useMemo(() => {
    const before = arrangements.current.get(planVersion);
    if (before) memory.current = before;
    else if (memoryVersion.current !== layoutVersion) memory.current = undefined;
    return chartLayout(catalog, chart, issues, creditsByTerm, maxCredits, memory.current, geometry);
  }, [catalog, chart, issues, creditsByTerm, maxCredits, geometry, layoutVersion, planVersion]);
  useEffect(() => {
    memoryVersion.current = layoutVersion;
  }, [layoutVersion]);
  useEffect(() => {
    memory.current = layout.memory;
    arrangements.current.set(planVersion, layout.memory);
  }, [layout, planVersion]);

  const colorScheme = useColorScheme();
  const termData = useMemo(
    () => layout.nodes.flatMap((n) => (n.type === "term" ? [n.data] : [])),
    [layout],
  );

  // Trace the course being pointed at, or else the selected one.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const focusId = hoveredId ?? selectedId;
  const related = useMemo(
    () => (focusId && layout.nodes.some((n) => n.id === focusId) ? relatedTo(layout.edges, focusId) : null),
    [focusId, layout],
  );

  // React Flow keeps its own copy of the cards so it can move them while
  // dragging. Two separate updates feed it:
  const [nodes, setNodes, onNodesChange] = useNodesState<PlannerNode>(layout.nodes);
  // 1. A new layout (the chart changed): reset every card to its place.
  useEffect(() => {
    cancelAnimationFrame(shiftFrame.current);
    setNodes(layout.nodes);
  }, [layout, setNodes]);
  // 2. Selection and tracing only change how cards look. Update just that,
  //    keeping each card's current position and React Flow's measurements,
  //    so a card being dragged isn't yanked back or its lines lost.
  useEffect(() => {
    setNodes((current) =>
      current.map((n) =>
        n.type === "course"
          ? { ...n, selected: n.id === selectedId, className: related && !related.has(n.id) ? "is-dimmed" : "" }
          : n,
      ),
    );
  }, [layout, selectedId, related, setNodes]);

  const edges = useMemo(
    () =>
      layout.edges.map((e) =>
        related && !(related.has(e.source) && related.has(e.target))
          ? { ...e, style: { ...e.style, opacity: 0.12 } }
          : e,
      ),
    [layout, related],
  );

  // Slide cards to new positions (the other cards making room while a
  // course is reordered, or going back if it isn't placed).
  const shiftFrame = useRef(0);
  const slideTo = useCallback(
    (targets: Map<string, Point>) => {
      cancelAnimationFrame(shiftFrame.current);
      if (targets.size === 0) return;
      const from = new Map([...targets].map(([id, to]) => [id, flow.current?.getNode(id)?.position ?? to]));
      const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const started = performance.now();
      const tick = (now: number) => {
        const t = instant ? 1 : Math.min(1, (now - started) / SHIFT_MS);
        const eased = 1 - (1 - t) ** 3;
        setNodes((nodes) =>
          nodes.map((n) => {
            const to = targets.get(n.id);
            if (!to) return n;
            const f = from.get(n.id)!;
            return { ...n, position: { x: f.x + (to.x - f.x) * eased, y: f.y + (to.y - f.y) * eased } };
          }),
        );
        if (t < 1) shiftFrame.current = requestAnimationFrame(tick);
      };
      shiftFrame.current = requestAnimationFrame(tick);
    },
    [setNodes],
  );

  // Where a course dragged over another term would go there: into the order
  // by its middle, compared with where the cards there started (never
  // inside a block). Shared by the preview and the drop so they agree.
  const crossTermDrop = (current: { id: string; start: Map<string, Point> }, y: number, termIndex: number) => {
    const target = chart.terms.find((t) => t.index === termIndex);
    const middle = (id: string) => {
      const at = current.start.get(id);
      return at && at.y + NODE_HEIGHT / 2;
    };
    const position = target ? dropIndex(catalog, target.objectIds, [current.id], y + NODE_HEIGHT / 2, middle) : 0;
    return { target, position };
  };

  // How big the drawn chart is, and where the view may go: never past its
  // edges.
  const contentWidth = columns * geometry.columnWidth;
  const contentHeight = termData[0]?.height ?? 0;
  const flow = useRef<ReactFlowInstance<PlannerNode, PlannerEdge> | null>(null);
  // A plan shorter than the canvas sits in its vertical middle; a taller
  // one starts at the top and scrolls. It's centered when first drawn, when
  // the canvas is resized, and for a whole new plan, but not after each
  // edit: moving one course shouldn't shift every card. (It does move up
  // if the plan grows past the bottom.)
  const lastCenter = useRef<{ height: number; offset: number } | null>(null);
  const centerOffset = useMemo(() => {
    const height = size?.height ?? 0;
    const room = Math.max(0, height - contentHeight);
    const recenter = !lastCenter.current || lastCenter.current.height !== height || layout.fresh;
    return recenter ? room / 2 : Math.min(lastCenter.current!.offset, room);
  }, [size?.height, contentHeight, layout]);
  useEffect(() => {
    lastCenter.current = { height: size?.height ?? 0, offset: centerOffset };
  }, [size?.height, centerOffset]);
  const clampView = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(x, (size?.width ?? 0) - contentWidth)),
      y: centerOffset > 0 ? centerOffset : Math.min(0, Math.max(y, (size?.height ?? 0) - contentHeight)),
      zoom: 1,
    }),
    [size, contentWidth, contentHeight, centerOffset],
  );

  // Zoom to a percentage (snapped to the allowed steps), keeping the point
  // at `anchorX` (canvas pixels) in place. The view is moved once the new
  // layout is drawn.
  const pendingAnchor = useRef<{ anchorX: number; columns: number } | null>(null);
  const zoomTo = useCallback(
    (percent: number, anchorX = (size?.width ?? 0) / 2) => {
      const next = snapZoom(percent);
      if (next === zoom) return;
      const view = flow.current?.getViewport() ?? { x: 0, y: 0 };
      // The anchor's position in the chart, measured in columns.
      pendingAnchor.current = { anchorX, columns: (anchorX - view.x) / geometry.columnWidth };
      setZoom(next);
    },
    [size, geometry.columnWidth, zoom],
  );
  useEffect(() => {
    const view = flow.current?.getViewport();
    if (!flow.current || !view) return;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    const x = anchor ? anchor.anchorX - anchor.columns * geometry.columnWidth : view.x;
    void flow.current.setViewport(clampView(x, view.y));
  }, [geometry, clampView]);

  // Ctrl/Cmd + scroll, or a trackpad pinch, zooms horizontally, one step
  // per WHEEL_PER_STEP of scrolling. (Plain scrolling moves the view; React
  // Flow handles that.)
  const wheelTotal = useRef(0);
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      // Scrolled by lines or pages (some mice): roughly in pixels.
      const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
      wheelTotal.current += event.deltaY * scale;
      const steps = Math.trunc(wheelTotal.current / WHEEL_PER_STEP);
      if (steps === 0) return;
      wheelTotal.current -= steps * WHEEL_PER_STEP;
      const bounds = element.getBoundingClientRect();
      zoomTo(zoom - steps * ZOOM_STEP, event.clientX - bounds.left);
    };
    element.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => element.removeEventListener("wheel", onWheel, { capture: true });
  }, [zoomTo, zoom]);

  return (
    <div ref={wrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => {
          if (node.type !== "course") return;
          // Courses taken together with this one in its term move with it.
          const term = chart.terms.find((t) => t.objectIds.includes(node.id));
          const block = term ? concurrentBlock(catalog, term.objectIds, node.id) : [node.id];
          const home = new Map(layout.nodes.map((n) => [n.id, n.position]));
          drag.current = {
            id: node.id,
            termIndex: term?.index,
            termIds: term?.objectIds ?? [],
            block,
            start: home,
            previewIndex: null,
            previewKey: null,
          };
          // Trace the course being moved (not whatever it passes over), and
          // keep it above the other cards while it moves.
          setHoveredId(node.id);
          setNodes((nodes) => nodes.map((n) => (block.includes(n.id) ? { ...n, zIndex: DRAGGING_Z } : n)));
        }}
        onNodeDrag={(_, node) => {
          const current = drag.current;
          if (!current) return;
          const start = current.start.get(node.id)!;
          const overOwnTerm = termIndexAt(chart, node.position.x, geometry) === current.termIndex;
          const dx = node.position.x - start.x;
          const dy = node.position.y - start.y;

          // Partners (a lecture and its lab) follow while the card is over
          // its own term; over another term only the dragged course moves,
          // and they slide with the rest of the term (below).
          if (current.block.length > 1 && overOwnTerm) {
            setNodes((nodes) =>
              nodes.map((n) => {
                if (n.id === node.id || !current.block.includes(n.id)) return n;
                const home = current.start.get(n.id)!;
                return { ...n, position: { x: home.x + dx, y: home.y + dy } };
              }),
            );
          }

          // The other cards slide to show where it would land. Over its own
          // term, they open a space there. Over another term, that term
          // opens a row where it would go and its own term closes up behind
          // it: the same rule as the drop, so it lands where the space is.
          let tops: Map<string, number>;
          let key: string;
          if (overOwnTerm) {
            const top = Math.min(...current.block.map((id) => current.start.get(id)!.y)) + dy;
            const preview = reorderPreview(
              catalog,
              current.termIds,
              current.block,
              top,
              { top: HEADER_HEIGHT, rowHeight: ROW_HEIGHT },
              current.previewIndex,
            );
            current.previewIndex = preview.index;
            key = `own:${preview.index}`;
            tops = packedTops(preview.order, HEADER_HEIGHT, ROW_HEIGHT);
          } else {
            current.previewIndex = null;
            const termIndex = termIndexAt(chart, node.position.x, geometry);
            const { target, position } = crossTermDrop(current, node.position.y, termIndex);
            key = target ? `${termIndex}:${position}` : "none";
            tops = packedTops(
              current.termIds.filter((id) => id !== current.id),
              HEADER_HEIGHT,
              ROW_HEIGHT,
            );
            if (target) {
              const order = target.objectIds.filter((id) => id !== current.id);
              order.splice(position, 0, current.id);
              for (const [id, y] of packedTops(order, HEADER_HEIGHT, ROW_HEIGHT)) tops.set(id, y);
            }
          }
          if (key === current.previewKey) return;
          current.previewKey = key;
          // Every other card goes to its preview spot, or back home.
          const following = overOwnTerm ? current.block : [current.id];
          const targets = new Map<string, Point>();
          for (const id of chart.terms.flatMap((t) => t.objectIds)) {
            const home = current.start.get(id);
            if (home && !following.includes(id)) targets.set(id, { x: home.x, y: tops.get(id) ?? home.y });
          }
          slideTo(targets);
        }}
        onNodeDragStop={(_, node) => {
          const current = drag.current;
          drag.current = null;
          if (node.type !== "course" || !current) return;
          const termIndex = termIndexAt(chart, node.position.x, geometry);
          setHoveredId(null);

          if (termIndex === current.termIndex) {
            // The same rule as the preview, so it lands where the space opened.
            const dy = node.position.y - current.start.get(node.id)!.y;
            const top = Math.min(...current.block.map((id) => current.start.get(id)!.y)) + dy;
            const preview = reorderPreview(
              catalog,
              current.termIds,
              current.block,
              top,
              { top: HEADER_HEIGHT, rowHeight: ROW_HEIGHT },
              current.previewIndex,
            );
            const resetZ = (nodes: PlannerNode[]) =>
              nodes.map((n) => (current.block.includes(n.id) ? { ...n, zIndex: 1 } : n));
            // Same place in the order, and the term already has no gaps:
            // nothing to do, so everything slides back. (If it has gaps,
            // dropping closes them up, like the preview showed.)
            const packed = packedTops(preview.order, HEADER_HEIGHT, ROW_HEIGHT);
            const alreadyPacked = current.termIds.every((id) => current.start.get(id)!.y === packed.get(id));
            if (preview.index === preview.originalIndex && alreadyPacked) {
              setNodes(resetZ);
              slideTo(new Map(current.termIds.map((id) => [id, current.start.get(id)!])));
              return;
            }
            // Placed: the term is packed from the top in its new order,
            // exactly where the space opened.
            cancelAnimationFrame(shiftFrame.current);
            setNodes(resetZ);
            onMove(node.id, termIndex, preview.index);
            return;
          }
          // Moved to another term: only the dragged course goes, into the
          // order by where it was dropped (never inside a block there).
          cancelAnimationFrame(shiftFrame.current);
          const { target, position } = crossTermDrop(current, node.position.y, termIndex);
          if (target) {
            // The new layout puts every card where the preview showed it.
            setNodes((nodes) => nodes.map((n) => (n.id === node.id ? { ...n, zIndex: 1 } : n)));
            onMove(node.id, termIndex, position);
            return;
          }
          // Nowhere to go: every card back to its place.
          setNodes((nodes) =>
            nodes.map((n) =>
              current.start.has(n.id)
                ? { ...n, position: current.start.get(n.id)!, zIndex: n.type === "course" ? 1 : n.zIndex }
                : n,
            ),
          );
        }}
        // Click a course to select it; click it again to deselect it.
        onNodeClick={(_, node) => {
          if (node.type === "course") onSelect(node.id === selectedId ? null : node.id);
        }}
        // While dragging, cards passed over don't count as pointed at.
        onNodeMouseEnter={(_, node) => {
          if (node.type === "course" && !drag.current) setHoveredId(node.id);
        }}
        onNodeMouseLeave={() => {
          if (!drag.current) setHoveredId(null);
        }}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        edgesFocusable={false}
        colorMode={colorScheme}
        onInit={(instance) => {
          flow.current = instance;
        }}
        // The canvas never scales: zooming changes the column widths instead.
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={1}
        maxZoom={1}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll
        translateExtent={[
          [0, -centerOffset],
          [Math.max(contentWidth, size?.width ?? 0), Math.max(contentHeight, (size?.height ?? 0) - centerOffset)],
        ]}
      >
        {/* Leaves room for the zoom controls on the left; wraps if narrow. */}
        <FlowPanel position="bottom-right" style={{ maxWidth: "calc(100% - 220px)" }}>
          <Legend />
        </FlowPanel>
        <FlowPanel position="top-left" className="flex items-start gap-2">
          {topLeft}
          <HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
        </FlowPanel>
        {topRight && (
          // A row of boxes, top aligned. Each scrolls on its own if it's
          // taller than the chart ("nowheel" keeps the wheel from moving the
          // chart underneath). The row itself lets clicks through to the
          // chart below the boxes.
          <FlowPanel
            position="top-right"
            className={cn(
              "nowheel flex h-[calc(100%-30px)] max-w-[calc(100%-30px)] items-start gap-2 !pointer-events-none",
              "*:pointer-events-auto *:max-h-full *:overflow-y-auto",
            )}
          >
            {topRight}
          </FlowPanel>
        )}
        <FlowPanel position="bottom-left">
          <ZoomControls
            zoom={zoom}
            onZoom={(percent) => zoomTo(percent)}
            onFit={() => zoomTo(100, 0)}
          />
        </FlowPanel>
        <TermBands terms={termData} columnWidth={geometry.columnWidth} />
      </ReactFlow>
    </div>
  );
}
