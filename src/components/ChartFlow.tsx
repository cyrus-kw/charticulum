"use client";

// The flowchart: terms as shaded stripes, objects as small cards, and
// requisites as straight colored lines. Drag a card to another term to move
// it; point at (or select) a card to trace everything it's connected to.
import {
  BaseEdge,
  Controls,
  Handle,
  Panel as FlowPanel,
  Position,
  ReactFlow,
  useInternalNode,
  useNodesState,
  useReactFlow,
  useViewport,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  NODE_HEIGHT,
  NODE_WIDTH,
  termIndexAt,
  type CourseNode,
  type PlannerEdge,
  type PlannerNode,
  type Rect,
  type TermNode,
} from "../planner/layout";
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
// either card is being dragged, both ends snap only to left and right side
// middles, flowing smoothly around their card's border when they switch.
function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps<PlannerEdge>) {
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
        ? draggingEndpoints(sourceRect, targetRect, lastSides.current)
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

// Re-fit the chart to the canvas whenever `fitKey` changes (e.g. a sidebar
// opens or closes). Waits a frame so the canvas has its new size.
function FitOnChange({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.05, duration: 200 }));
    return () => cancelAnimationFrame(frame);
  }, [fitKey, fitView]);
  return null;
}

function CourseCard({ data, selected }: NodeProps<CourseNode>) {
  const { object, grade, issues, external, color, onlyIn, needsMinGrade, generalEducation } = data;
  const markers = `${needsMinGrade ? "*" : ""}${generalEducation ? "+" : ""}`;
  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, ...(color && { borderColor: color }) }}
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
      )}
      title={[`${object.id}: ${object.title}`, ...issues.map((i) => i.message)].join("\n")}
    >
      <Handles />
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-mono text-xs font-semibold">
          {object.id}
          {markers}
        </span>
        <span className="text-[11px] whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400">
          {grade && <span className="mr-1 font-semibold text-emerald-700 dark:text-emerald-400">{grade}</span>}
          {object.credits} cr
        </span>
      </div>
      <div className="truncate text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">{object.title}</div>
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
function TermStripe({ data }: NodeProps<TermNode>) {
  const over = !data.external && data.credits > data.maxCredits;
  return (
    <div style={{ width: COLUMN_WIDTH, height: data.height }} className="pt-3 text-center">
      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{data.label}</div>
      <div className={cn("text-xs", over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400")}>
        {data.credits}
        {!data.external && ` / ${data.maxCredits}`} credits
      </div>
    </div>
  );
}

// The alternating term bands, filling the whole height of the canvas. They
// follow panning and zooming sideways, and sit under the lines and cards.
function TermBands({ terms }: { terms: TermNode["data"][] }) {
  const { x, zoom } = useViewport();
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
          style={{ left: x + column * COLUMN_WIDTH * zoom, width: COLUMN_WIDTH * zoom }}
        />
      ))}
    </div>
  );
}

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
  onMove: (objectId: string, termIndex: number) => void;
  onSelect: (objectId: string | null) => void;
  // Change this to re-fit the chart, e.g. when the canvas is resized.
  fitKey?: string;
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
  fitKey = "",
}: ChartFlowProps) {
  const layout = useMemo(
    () => chartLayout(catalog, chart, issues, creditsByTerm, maxCredits),
    [catalog, chart, issues, creditsByTerm, maxCredits],
  );

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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={() => setHoveredId(null)}
      onNodeDragStop={(_, node) => {
        if (node.type !== "course") return;
        // Snap cards back to their places first (keeping their looks); if the
        // move is valid, the chart update then lays it out anew.
        const home = new Map(layout.nodes.map((n) => [n.id, n.position]));
        setNodes((current) => current.map((n) => ({ ...n, position: home.get(n.id) ?? n.position })));
        onMove(node.id, termIndexAt(chart, node.position.x));
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
      minZoom={0.2}
      fitView
      fitViewOptions={{ padding: 0.05 }}
    >
      <FlowPanel position="top-left">
        <Legend />
      </FlowPanel>
      <Controls showInteractive={false} />
      <FitOnChange fitKey={fitKey} />
      <TermBands terms={termData} />
    </ReactFlow>
  );
}
