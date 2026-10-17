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
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  NODE_HEIGHT,
  NODE_WIDTH,
  termIndexAt,
  type CourseNode,
  type Geometry,
  type LayoutMemory,
  type PlannerEdge,
  type PlannerNode,
  type Rect,
  type TermNode,
} from "../planner/layout";
import { concurrentBlock, dropIndex } from "../planner/ordering";
import { cn } from "./ui";

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
        onlyIn === "fall"
          ? "bg-orange-100 dark:bg-amber-950"
          : onlyIn === "spring"
            ? "bg-green-100 dark:bg-green-950"
            : "bg-white dark:bg-zinc-900",
        !color && "border-zinc-300 dark:border-zinc-600",
        external && "border-dashed",
        selected && "outline-2 outline-offset-2 outline-sky-500",
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

// Horizontal zoom buttons. Zooming spreads the terms out sideways or
// compresses them; text and rows keep their size.
function ZoomControls({ zoom, onZoom, onFit }: { zoom: number; onZoom: (factor: number) => void; onFit: () => void }) {
  const button =
    "flex h-7 min-w-7 items-center justify-center px-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800";
  return (
    <div className="flex items-center divide-x divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      <button type="button" className={button} aria-label="Compress the chart" disabled={zoom <= 1} onClick={() => onZoom(1 / ZOOM_STEP)}>
        −
      </button>
      <span className="px-2 text-xs text-zinc-500 tabular-nums">{Math.round(zoom * 100)}%</span>
      <button type="button" className={button} aria-label="Spread the chart out" disabled={zoom >= MAX_ZOOM} onClick={() => onZoom(ZOOM_STEP)}>
        +
      </button>
      <button type="button" className={button} onClick={onFit}>
        Fit
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

// Horizontal zoom: 1 means the terms exactly fill the canvas width; up to
// MAX_ZOOM times wider. Columns never get narrower than MIN_COLUMN_WIDTH
// (with many terms the chart then scrolls sideways even at 1).
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const MIN_COLUMN_WIDTH = 96;

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
      <span className="text-zinc-500">Point at a course to trace it.</span>
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
}: ChartFlowProps) {
  // The chart fills the canvas: measure it, and size the term columns to
  // fit across it, times the horizontal zoom.
  const wrapper = useRef<HTMLDivElement>(null);
  const size = useElementSize(wrapper);
  const [zoom, setZoom] = useState(1);
  const columns = Math.max(chart.terms.length, 1);
  const fillWidth = size ? Math.max(size.width / columns, MIN_COLUMN_WIDTH) : COLUMN_WIDTH;
  const geometry: Geometry = useMemo(() => geometryFor(fillWidth * zoom), [fillWidth, zoom]);

  // The previous layout's arrangement, so a change (like moving one course)
  // keeps everything else where it was and every course its color.
  const memory = useRef<LayoutMemory | undefined>(undefined);
  // The card being dragged: its term, the block moving with it, and where
  // every card started.
  const drag = useRef<{
    id: string;
    termIndex: number | undefined;
    block: string[];
    start: Map<string, { x: number; y: number }>;
  } | null>(null);
  const layout = useMemo(
    () => chartLayout(catalog, chart, issues, creditsByTerm, maxCredits, memory.current, geometry),
    [catalog, chart, issues, creditsByTerm, maxCredits, geometry],
  );
  useEffect(() => {
    memory.current = layout.memory;
  }, [layout]);

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
  useEffect(() => setNodes(layout.nodes), [layout, setNodes]);
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

  // How big the drawn chart is, and where the view may go: never past its
  // edges (and it always starts from the top-left corner).
  const contentWidth = columns * geometry.columnWidth;
  const contentHeight = termData[0]?.height ?? 0;
  const flow = useRef<ReactFlowInstance<PlannerNode, PlannerEdge> | null>(null);
  const clampView = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(x, (size?.width ?? 0) - contentWidth)),
      y: Math.min(0, Math.max(y, (size?.height ?? 0) - contentHeight)),
      zoom: 1,
    }),
    [size, contentWidth, contentHeight],
  );

  // Zoom by a factor, keeping the point at `anchorX` (canvas pixels) in
  // place. The view is moved once the new layout is drawn.
  const pendingAnchor = useRef<{ anchorX: number; columns: number } | null>(null);
  const zoomBy = useCallback(
    (factor: number, anchorX = (size?.width ?? 0) / 2) => {
      const view = flow.current?.getViewport() ?? { x: 0, y: 0 };
      // The anchor's position in the chart, measured in columns.
      pendingAnchor.current = { anchorX, columns: (anchorX - view.x) / geometry.columnWidth };
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z * factor)));
    },
    [size, geometry.columnWidth],
  );
  useEffect(() => {
    const view = flow.current?.getViewport();
    if (!flow.current || !view) return;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    const x = anchor ? anchor.anchorX - anchor.columns * geometry.columnWidth : view.x;
    void flow.current.setViewport(clampView(x, view.y));
  }, [geometry, clampView]);

  // Ctrl/Cmd + scroll, or a trackpad pinch, zooms horizontally. (Plain
  // scrolling moves the view; React Flow handles that.)
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = element.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * 0.002), event.clientX - bounds.left);
    };
    element.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => element.removeEventListener("wheel", onWheel, { capture: true });
  }, [zoomBy]);

  return (
    <div ref={wrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => {
          setHoveredId(null);
          if (node.type !== "course") return;
          // Courses taken together with this one in its term move with it.
          const term = chart.terms.find((t) => t.objectIds.includes(node.id));
          const block = term ? concurrentBlock(catalog, term.objectIds, node.id) : [node.id];
          const home = new Map(layout.nodes.map((n) => [n.id, n.position]));
          drag.current = { id: node.id, termIndex: term?.index, block, start: home };
        }}
        onNodeDrag={(_, node) => {
          const current = drag.current;
          if (!current || current.block.length < 2) return;
          // Partners follow while the card is over its own term (reordering);
          // over another term only the dragged course moves, so they stay home.
          const start = current.start.get(node.id)!;
          const follow = termIndexAt(chart, node.position.x, geometry) === current.termIndex;
          const dx = node.position.x - start.x;
          const dy = node.position.y - start.y;
          setNodes((nodes) =>
            nodes.map((n) => {
              if (n.id === node.id || !current.block.includes(n.id)) return n;
              const home = current.start.get(n.id)!;
              return { ...n, position: follow ? { x: home.x + dx, y: home.y + dy } : home };
            }),
          );
        }}
        onNodeDragStop={(_, node) => {
          const current = drag.current;
          drag.current = null;
          if (node.type !== "course" || !current) return;
          const termIndex = termIndexAt(chart, node.position.x, geometry);
          const target = chart.terms.find((t) => t.index === termIndex);
          const column = chart.terms.findIndex((t) => t.index === termIndex);
          const moving = termIndex === current.termIndex ? current.block : [node.id];
          const start = current.start.get(node.id)!;
          const dy = node.position.y - start.y;

          // Where in the term's order it goes: by where the block's middle was
          // dropped, among the cards there (never inside another block).
          const homeMiddle = (id: string) => {
            const at = current.start.get(id);
            return at && (at.y + NODE_HEIGHT / 2);
          };
          const movingMiddles = moving.map((id) => homeMiddle(id)! + dy);
          const dropMiddle = (Math.min(...movingMiddles) + Math.max(...movingMiddles)) / 2;
          const position = target ? dropIndex(catalog, target.objectIds, moving, dropMiddle, homeMiddle) : 0;

          if (memory.current && column >= 0) {
            if (termIndex === current.termIndex) {
              // Reordered within its term: pack that term from the top, so
              // the other cards close up with no gaps.
              memory.current.pack = new Set([column]);
            } else {
              // Moved to another term: remember where it was dropped, so it
              // lands there if there's room (other terms stay as they are).
              for (const id of moving) {
                memory.current.column.set(id, column);
                memory.current.y.set(id, current.start.get(id)!.y + dy - HEADER_HEIGHT);
              }
            }
          }

          // Snap cards back to their places first (keeping their looks); if the
          // move is valid, the chart update then lays it out anew.
          setNodes((nodes) => nodes.map((n) => ({ ...n, position: current.start.get(n.id) ?? n.position })));
          onMove(node.id, termIndex, position);
        }}
        onNodeClick={(_, node) => {
          if (node.type === "course") onSelect(node.id);
        }}
        onNodeMouseEnter={(_, node) => {
          if (node.type === "course") setHoveredId(node.id);
        }}
        onNodeMouseLeave={() => setHoveredId(null)}
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
          [0, 0],
          [Math.max(contentWidth, size?.width ?? 0), Math.max(contentHeight, size?.height ?? 0)],
        ]}
      >
        {/* Leaves room for the zoom controls on the left; wraps if narrow. */}
        <FlowPanel position="bottom-right" style={{ maxWidth: "calc(100% - 220px)" }}>
          <Legend />
        </FlowPanel>
        <FlowPanel position="bottom-left">
          <ZoomControls
            zoom={zoom}
            onZoom={(factor) => zoomBy(factor)}
            onFit={() => {
              pendingAnchor.current = { anchorX: 0, columns: 0 };
              setZoom(1);
            }}
          />
        </FlowPanel>
        <TermBands terms={termData} columnWidth={geometry.columnWidth} />
      </ReactFlow>
    </div>
  );
}
