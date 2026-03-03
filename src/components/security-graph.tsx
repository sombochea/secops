"use client";

import { useEffect, useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, ReactFlowProvider,
  type Node, type Edge, type NodeTypes, Handle, Position, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Globe, Server, User, Activity, Cog, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_CONFIG = {
  ip: { icon: Globe, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  host: { icon: Server, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  user: { icon: User, color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
  event: { icon: Activity, color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  service: { icon: Cog, color: "#06b6d4", bg: "rgba(6,182,212,0.15)" },
} as const;

export { TYPE_CONFIG };

function SecurityNode({ data }: { data: { label: string; nodeType: keyof typeof TYPE_CONFIG; count: number; threats: number; riskMax: number; country?: string } }) {
  const cfg = TYPE_CONFIG[data.nodeType];
  const Icon = cfg.icon;
  const hasThreat = data.threats > 0;
  const highRisk = data.riskMax >= 70;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div
        className={cn(
          "rounded-lg border px-3 py-2 min-w-[120px] max-w-[200px] shadow-md transition-all",
          highRisk ? "border-red-500/60 shadow-red-500/20" : hasThreat ? "border-yellow-500/40" : "border-border"
        )}
        style={{ background: cfg.bg }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.color }} />
          <span className="text-xs font-medium truncate">{data.label}</span>
          {highRisk && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{data.count} events</span>
          {data.threats > 0 && <span className="text-red-400">{data.threats} threats</span>}
        </div>
        {data.country && <div className="text-[10px] text-muted-foreground mt-0.5">{data.country}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

const nodeTypes: NodeTypes = { securityNode: SecurityNode };

export type ApiNode = { id: string; type: string; count: number; threats: number; riskMax: number; label: string; country?: string };
export type ApiEdge = { id: string; source: string; target: string; count: number; threats: number };

export function layoutNodes(apiNodes: ApiNode[], apiEdges: ApiEdge[], threatsOnly = false): { nodes: Node[]; edges: Edge[] } {
  let filteredNodes = apiNodes;
  let filteredEdges = apiEdges;
  if (threatsOnly) {
    const ids = new Set(apiNodes.filter((n) => n.threats > 0).map((n) => n.id));
    filteredNodes = apiNodes.filter((n) => ids.has(n.id));
    filteredEdges = apiEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }
  const groups: Record<string, ApiNode[]> = {};
  for (const n of filteredNodes) (groups[n.type] ??= []).push(n);
  const typeOrder = ["ip", "user", "host", "service"];
  const nodes: Node[] = [];
  let yOffset = 0;
  for (const type of typeOrder) {
    const group = groups[type];
    if (!group?.length) continue;
    group.sort((a, b) => b.threats - a.threats || b.count - a.count);
    const startX = -(group.length * 200) / 2;
    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      nodes.push({ id: n.id, type: "securityNode", position: { x: startX + i * 200, y: yOffset }, data: { label: n.label, nodeType: n.type, count: n.count, threats: n.threats, riskMax: n.riskMax, country: n.country } });
    }
    yOffset += 140;
  }
  const many = filteredEdges.length > 80;
  const edges: Edge[] = filteredEdges.map((e) => ({
    id: e.id, source: e.source, target: e.target, animated: e.threats > 0, type: "smoothstep",
    style: { stroke: e.threats > 0 ? "#ef4444" : "#444", strokeWidth: Math.min(1 + Math.log2(e.count + 1), 3), opacity: Math.min(0.3 + e.count / 20, 0.9) },
    markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: e.threats > 0 ? "#ef4444" : "#444" },
    label: !many && e.count > 1 ? `${e.count}` : undefined,
    labelStyle: { fill: "#888", fontSize: 9 }, labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.8 },
  }));
  return { nodes, edges };
}

/** Standalone ReactFlow graph for security nodes. Provide apiNodes + apiEdges. */
export function SecurityGraph({
  apiNodes, apiEdges, threatsOnly = false, className, onNodeClick, minimap = true,
}: {
  apiNodes: ApiNode[]; apiEdges: ApiEdge[]; threatsOnly?: boolean; className?: string;
  onNodeClick?: (nodeType: string, label: string) => void; minimap?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <SecurityGraphInner apiNodes={apiNodes} apiEdges={apiEdges} threatsOnly={threatsOnly} className={className} onNodeClick={onNodeClick} minimap={minimap} />
    </ReactFlowProvider>
  );
}

function SecurityGraphInner({ apiNodes, apiEdges, threatsOnly, className, onNodeClick, minimap }: {
  apiNodes: ApiNode[]; apiEdges: ApiEdge[]; threatsOnly?: boolean; className?: string;
  onNodeClick?: (nodeType: string, label: string) => void; minimap?: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const { nodes: n, edges: e } = layoutNodes(apiNodes, apiEdges, threatsOnly);
    setNodes(n);
    setEdges(e);
  }, [apiNodes, apiEdges, threatsOnly]);

  return (
    <div className={cn("w-full h-full", className)}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1} maxZoom={3} proOptions={{ hideAttribution: true }} colorMode="dark"
        onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.data?.nodeType as string, node.data?.label as string) : undefined}
      >
        <Background gap={20} size={1} color="#333" />
        <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
        {minimap && (
          <MiniMap
            nodeColor={(n) => { const t = n.data?.nodeType as keyof typeof TYPE_CONFIG | undefined; return t ? TYPE_CONFIG[t].color : "#666"; }}
            maskColor="rgba(0,0,0,0.7)" className="!bg-card !border-border"
          />
        )}
      </ReactFlow>
    </div>
  );
}
