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
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { Catalog, Chart, ChartIssue } from "../engine/index";
import {
  chartLayout,
  edgeEndpoints,
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

// A straight line between the middles of the facing sides of two cards,
// whichever way the cards are arranged (even backwards or stacked).
function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps<PlannerEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;
  const { start, end } = edgeEndpoints(nodeRect(sourceNode), nodeRect(targetNode));
  return <BaseEdge id={id} path={`M ${start.x},${start.y} L ${end.x},${end.y}`} markerEnd={markerEnd} style={style} />;
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

function TermStripe({ data }: NodeProps<TermNode>) {
  const over = !data.external && data.credits > data.maxCredits;
  return (
    <div
      style={{ width: COLUMN_WIDTH, height: data.height }}
      className={cn(
        "pt-3 text-center",
        data.external
          ? "bg-sky-50 dark:bg-sky-950/40"
          : data.shaded
            ? "bg-zinc-100 dark:bg-white/5"
            : "bg-transparent",
      )}
    >
      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{data.label}</div>
      <div className={cn("text-xs", over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400")}>
        {data.credits}
        {!data.external && ` / ${data.maxCredits}`} credits
      </div>
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

  // Trace the course being pointed at, or else the selected one.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const focusId = hoveredId ?? selectedId;
  const related = useMemo(
    () => (focusId && layout.nodes.some((n) => n.id === focusId) ? relatedTo(layout.edges, focusId) : null),
    [focusId, layout],
  );

  // React Flow tracks node positions itself while dragging. Whenever the
  // chart (or the traced course) changes, reset them to the computed layout.
  const styledNodes = useMemo(
    () =>
      layout.nodes.map((n) =>
        n.type === "course"
          ? { ...n, selected: n.id === selectedId, className: related && !related.has(n.id) ? "is-dimmed" : "" }
          : n,
      ),
    [layout, selectedId, related],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<PlannerNode>(styledNodes);
  useEffect(() => setNodes(styledNodes), [styledNodes, setNodes]);

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
        // Snap back first; if the move is valid the chart update re-lays it out.
        setNodes(styledNodes);
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
    </ReactFlow>
  );
}
