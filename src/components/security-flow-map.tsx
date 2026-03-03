"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { Globe, Server, User, Activity, Cog, AlertTriangle, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Custom Node ─────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  ip: { icon: Globe, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  host: { icon: Server, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  user: { icon: User, color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
  event: { icon: Activity, color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  service: { icon: Cog, color: "#06b6d4", bg: "rgba(6,182,212,0.15)" },
} as const;

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

// ─── Layout: force-directed-ish placement ────────────────────────────────────

function layoutNodes(
  apiNodes: { id: string; type: string; count: number; threats: number; riskMax: number; label: string; country?: string }[],
  apiEdges: { id: string; source: string; target: string; count: number; threats: number }[],
  threatsOnly: boolean
): { nodes: Node[]; edges: Edge[] } {
  let filteredNodes = apiNodes;
  let filteredEdges = apiEdges;

  if (threatsOnly) {
    const threatIds = new Set(apiNodes.filter((n) => n.threats > 0).map((n) => n.id));
    filteredNodes = apiNodes.filter((n) => threatIds.has(n.id));
    filteredEdges = apiEdges.filter((e) => threatIds.has(e.source) && threatIds.has(e.target));
  }

  // Group by type for layered layout
  const groups: Record<string, typeof filteredNodes> = {};
  for (const n of filteredNodes) {
    (groups[n.type] ??= []).push(n);
  }

  const typeOrder = ["ip", "user", "host", "service", "event"];
  const nodes: Node[] = [];
  let yOffset = 0;

  for (const type of typeOrder) {
    const group = groups[type];
    if (!group?.length) continue;
    // Sort by threat count desc, then event count desc
    group.sort((a, b) => b.threats - a.threats || b.count - a.count);
    const cols = Math.max(1, Math.ceil(Math.sqrt(group.length * 2)));
    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      nodes.push({
        id: n.id,
        type: "securityNode",
        position: { x: (i % cols) * 220 + Math.random() * 20, y: yOffset + Math.floor(i / cols) * 100 },
        data: { label: n.label, nodeType: n.type, count: n.count, threats: n.threats, riskMax: n.riskMax, country: n.country },
      });
    }
    yOffset += (Math.ceil(group.length / cols)) * 100 + 80;
  }

  const edges: Edge[] = filteredEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.threats > 0,
    style: {
      stroke: e.threats > 0 ? "#ef4444" : "#444",
      strokeWidth: Math.min(1 + Math.log2(e.count + 1), 4),
      opacity: Math.min(0.3 + e.count / 20, 1),
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: e.threats > 0 ? "#ef4444" : "#444" },
    label: e.count > 1 ? `${e.count}` : undefined,
    labelStyle: { fill: "#888", fontSize: 10 },
    labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.8 },
  }));

  return { nodes, edges };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SecurityFlowMap({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hours, setHours] = useState("24");
  const [threatsOnly, setThreatsOnly] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { data, isLoading, mutate: refresh } = useSWR(`/api/events/graph?hours=${hours}&limit=1000`, fetcher, {
    refreshInterval: 30000,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (!data?.nodes) return;
    const { nodes: n, edges: e } = layoutNodes(data.nodes, data.edges, threatsOnly);
    setNodes(n);
    setEdges(e);
  }, [data, threatsOnly]);

  const stats = useMemo(() => {
    if (!data?.nodes) return { ips: 0, hosts: 0, users: 0, services: 0, threats: 0, totalEdges: 0 };
    const ns = data.nodes as { type: string; threats: number }[];
    return {
      ips: ns.filter((n) => n.type === "ip").length,
      hosts: ns.filter((n) => n.type === "host").length,
      users: ns.filter((n) => n.type === "user").length,
      services: ns.filter((n) => n.type === "service").length,
      threats: ns.filter((n) => n.threats > 0).length,
      totalEdges: (data.edges as unknown[]).length,
    };
  }, [data]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {!fullscreen && <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-2 border-b bg-card">
          <h2 className="text-sm font-semibold mr-auto">Security Flow Map</h2>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Threats only</span>
            <Switch checked={threatsOnly} onCheckedChange={setThreatsOnly} />
          </div>

          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[["1", "1 hour"], ["6", "6 hours"], ["12", "12 hours"], ["24", "24 hours"], ["72", "3 days"], ["168", "7 days"]].map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refresh()}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 px-4 sm:px-6 py-1.5 border-b bg-card/50 text-[11px]">
          <span className="text-muted-foreground">{data?.totalEvents ?? 0} events</span>
          <span><Globe className="inline h-3 w-3 mr-0.5 text-blue-500" />{stats.ips} IPs</span>
          <span><Server className="inline h-3 w-3 mr-0.5 text-green-500" />{stats.hosts} hosts</span>
          <span><User className="inline h-3 w-3 mr-0.5 text-purple-500" />{stats.users} users</span>
          <span><Cog className="inline h-3 w-3 mr-0.5 text-cyan-500" />{stats.services} services</span>
          <span className="text-red-400"><AlertTriangle className="inline h-3 w-3 mr-0.5" />{stats.threats} threat nodes</span>
          <span className="text-muted-foreground">{stats.totalEdges} connections</span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 px-4 sm:px-6 py-1 border-b text-[10px] text-muted-foreground">
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
            <span key={type} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: cfg.color }} />
              {type}
            </span>
          ))}
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-red-500 inline-block" />threat edge</span>
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-zinc-600 inline-block" />normal edge</span>
        </div>

        {/* Flow canvas */}
        <div className="flex-1 relative">
          {nodes.length === 0 && !isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              No events found for the selected period
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={3}
              proOptions={{ hideAttribution: true }}
              colorMode="dark"
            >
              <Background gap={20} size={1} color="#333" />
              <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
              <MiniMap
                nodeColor={(n) => {
                  const t = n.data?.nodeType as keyof typeof TYPE_CONFIG | undefined;
                  return t ? TYPE_CONFIG[t].color : "#666";
                }}
                maskColor="rgba(0,0,0,0.7)"
                className="!bg-card !border-border"
              />
            </ReactFlow>
          )}
        </div>
      </div>
    </div>
  );
}
