"use client";

// The flowchart: terms as columns, objects as cards, requisites as arrows.
// Dragging a card to another column moves it to that term.
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import type { Catalog, Chart, ChartIssue } from "../engine/index";
import {
  chartLayout,
  columnHeight,
  NODE_HEIGHT,
  NODE_WIDTH,
  TERM_WIDTH,
  termIndexAt,
  type CourseNode,
  type PlannerNode,
  type TermNode,
} from "../planner/layout";
import { Badge, cn } from "./ui";

const hidden = { opacity: 0, pointerEvents: "none" as const };

function CourseCard({ data, selected }: NodeProps<CourseNode>) {
  const { object, grade, issues, external } = data;
  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cn(
        "overflow-hidden rounded-lg border bg-white px-3 py-2 text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100",
        issues.length > 0 ? "border-rose-500" : "border-zinc-300 dark:border-zinc-700",
        external && "border-dashed",
        selected && "ring-2 ring-sky-500",
        !external && "cursor-grab active:cursor-grabbing",
      )}
      title={issues.map((i) => i.message).join("\n") || undefined}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={hidden} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{object.id}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{object.credits} cr</span>
      </div>
      <div className="truncate text-sm">{object.title}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {object.kind !== "course" && <Badge>{object.kind}</Badge>}
        {external && <Badge tone="info">outside credit</Badge>}
        {grade && <Badge tone="good">{grade}</Badge>}
        {issues.length > 0 && (
          <Badge tone="bad">
            {issues.length} issue{issues.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} style={hidden} />
    </div>
  );
}

function TermColumn({ data }: NodeProps<TermNode>) {
  const over = !data.external && data.credits > data.maxCredits;
  return (
    <div
      style={{ width: TERM_WIDTH, height: columnHeight(data.rows) }}
      className={cn(
        "rounded-xl border px-3 pt-2",
        data.external
          ? "border-dashed border-sky-300 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30"
          : "border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40",
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
const nodeTypes: NodeTypes = { course: CourseCard, term: TermColumn };

export interface ChartFlowProps {
  catalog: Catalog;
  chart: Chart;
  issues: ChartIssue[];
  creditsByTerm: Record<number, number>;
  maxCredits: number;
  selectedId: string | null;
  onMove: (objectId: string, termIndex: number) => void;
  onSelect: (objectId: string | null) => void;
}

export function ChartFlow({ catalog, chart, issues, creditsByTerm, maxCredits, selectedId, onMove, onSelect }: ChartFlowProps) {
  const layout = useMemo(
    () => chartLayout(catalog, chart, issues, creditsByTerm, maxCredits),
    [catalog, chart, issues, creditsByTerm, maxCredits],
  );

  // React Flow tracks node positions itself while dragging. Whenever the
  // chart changes, reset them to the computed layout.
  const [nodes, setNodes, onNodesChange] = useNodesState<PlannerNode>(layout.nodes);
  useEffect(() => {
    setNodes(layout.nodes.map((n) => (n.type === "course" ? { ...n, selected: n.id === selectedId } : n)));
  }, [layout, selectedId, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={layout.edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => {
        if (node.type !== "course") return;
        // Snap back first; if the move is valid the chart update re-lays it out.
        setNodes(layout.nodes);
        onMove(node.id, termIndexAt(chart, node.position.x));
      }}
      onNodeClick={(_, node) => {
        if (node.type === "course") onSelect(node.id);
      }}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={false}
      edgesFocusable={false}
      colorMode="system"
      minZoom={0.2}
      fitView
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
