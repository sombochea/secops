"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
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
import { Globe, Server, User, Activity, Cog, AlertTriangle, RefreshCw, Maximize2, Minimize2, X, Search, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format-date";

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

// ─── Layout: hierarchical layered ────────────────────────────────────────────

type ApiNode = { id: string; type: string; count: number; threats: number; riskMax: number; label: string; country?: string };
type ApiEdge = { id: string; source: string; target: string; count: number; threats: number };

function layoutNodes(
  apiNodes: ApiNode[],
  apiEdges: ApiEdge[],
  threatsOnly: boolean
): { nodes: Node[]; edges: Edge[] } {
  let filteredNodes = apiNodes;
  let filteredEdges = apiEdges;

  if (threatsOnly) {
    const threatIds = new Set(apiNodes.filter((n) => n.threats > 0).map((n) => n.id));
    filteredNodes = apiNodes.filter((n) => threatIds.has(n.id));
    filteredEdges = apiEdges.filter((e) => threatIds.has(e.source) && threatIds.has(e.target));
  }

  // Build adjacency for degree-based sizing
  const degree = new Map<string, number>();
  for (const e of filteredEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // Group by type, sort by threats then count
  const groups: Record<string, ApiNode[]> = {};
  for (const n of filteredNodes) (groups[n.type] ??= []).push(n);

  const typeOrder = ["ip", "user", "host", "service"];
  const NODE_W = 200;
  const NODE_H = 80;
  const LAYER_GAP = 140;
  const nodes: Node[] = [];
  let yOffset = 0;

  for (const type of typeOrder) {
    const group = groups[type];
    if (!group?.length) continue;
    group.sort((a, b) => b.threats - a.threats || b.count - a.count);
    const totalWidth = group.length * NODE_W;
    const startX = -totalWidth / 2;
    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      nodes.push({
        id: n.id,
        type: "securityNode",
        position: { x: startX + i * NODE_W, y: yOffset },
        data: { label: n.label, nodeType: n.type, count: n.count, threats: n.threats, riskMax: n.riskMax, country: n.country },
      });
    }
    yOffset += LAYER_GAP;
  }

  const manyEdges = filteredEdges.length > 80;
  const edges: Edge[] = filteredEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.threats > 0,
    type: "smoothstep",
    style: {
      stroke: e.threats > 0 ? "#ef4444" : "#444",
      strokeWidth: Math.min(1 + Math.log2(e.count + 1), 3),
      opacity: Math.min(0.3 + e.count / 20, 0.9),
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: e.threats > 0 ? "#ef4444" : "#444" },
    label: !manyEdges && e.count > 1 ? `${e.count}` : undefined,
    labelStyle: { fill: "#888", fontSize: 9 },
    labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.8 },
  }));

  return { nodes, edges };
}

// ─── Detail Sidebar ──────────────────────────────────────────────────────────

function DetailPanel({ detail }: { detail: { ip: string; totalEvents: number; threats: number; maxRisk: number; firstSeen: string; lastSeen: string; country: string; city: string; targetHosts: Record<string, number>; targetUsers: Record<string, number>; services: Record<string, number>; eventTypes: Record<string, number>; authMethods: Record<string, number> } }) {
  const Section = ({ title, data }: { title: string; data: Record<string, number> }) => {
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return null;
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
        {sorted.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs py-0.5">
            <span className="font-mono truncate mr-2">{k}</span>
            <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">{v}</Badge>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-[280px] border-l bg-card overflow-y-auto shrink-0 hidden lg:block">
      <div className="p-3 border-b">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-blue-500" />
          <span className="font-mono text-sm font-semibold">{detail.ip}</span>
        </div>
        <div className="text-xs text-muted-foreground">{[detail.city, detail.country].filter(Boolean).join(", ") || "Unknown location"}</div>
      </div>
      <div className="p-3 space-y-1 border-b text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Total events</span><span>{detail.totalEvents}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Threats</span><span className="text-red-400">{detail.threats}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Max risk</span><span className={detail.maxRisk >= 70 ? "text-red-400" : ""}>{detail.maxRisk}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">First seen</span><span>{formatRelative(detail.firstSeen)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Last seen</span><span>{formatRelative(detail.lastSeen)}</span></div>
      </div>
      <div className="p-3 space-y-3">
        <Section title="Target Hosts" data={detail.targetHosts} />
        <Section title="Target Users" data={detail.targetUsers} />
        <Section title="Event Types" data={detail.eventTypes} />
        <Section title="Services" data={detail.services} />
        <Section title="Auth Methods" data={detail.authMethods} />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SecurityFlowMap({ userName }: { userName: string }) {
  return (
    <ReactFlowProvider>
      <SecurityFlowMapInner userName={userName} />
    </ReactFlowProvider>
  );
}

function SecurityFlowMapInner({ userName }: { userName: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reactFlow = useReactFlow();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hours, setHours] = useState("24");
  const [topN, setTopN] = useState("30");
  const [threatsOnly, setThreatsOnly] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [ipFilter, setIpFilter] = useState(searchParams.get("ip") ?? "");
  const [ipInput, setIpInput] = useState(searchParams.get("ip") ?? "");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutKey, setLayoutKey] = useState(0);

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ hours, limit: "1000", topN });
    if (ipFilter) p.set("ip", ipFilter);
    return `/api/events/graph?${p}`;
  }, [hours, ipFilter, topN]);

  const { data, isLoading, mutate: refresh } = useSWR(apiUrl, fetcher, {
    refreshInterval: 30000,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (!data?.nodes) return;
    const { nodes: n, edges: e } = layoutNodes(data.nodes, data.edges, threatsOnly);
    setNodes(n);
    setEdges(e);
    setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 50);
  }, [data, threatsOnly, layoutKey]);

  const handleRealign = useCallback(() => setLayoutKey((k) => k + 1), []);

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

  const applyIp = (ip: string) => {
    setIpFilter(ip);
    setIpInput(ip);
    const url = ip ? `/flowmap?ip=${encodeURIComponent(ip)}` : "/flowmap";
    router.replace(url, { scroll: false });
  };

  const clearIp = () => applyIp("");

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
          <h2 className="text-sm font-semibold">Security Flow Map</h2>

          {/* IP filter */}
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); applyIp(ipInput.trim()); }}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Filter by IP..."
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                className="h-7 w-[160px] pl-7 text-xs font-mono"
              />
            </div>
            {ipFilter && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={clearIp}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </form>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Threats only</span>
              <Switch checked={threatsOnly} onCheckedChange={setThreatsOnly} />
            </div>

            <Select value={topN} onValueChange={setTopN}>
              <SelectTrigger className="h-7 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[["10", "Top 10"], ["20", "Top 20"], ["30", "Top 30"], ["50", "Top 50"], ["100", "Top 100"]].map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

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

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRealign} title="Re-align layout">
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refresh()}>
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* IP filter badge */}
        {ipFilter && (
          <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5 border-b bg-blue-500/10">
            <Globe className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs">Showing attack paths for</span>
            <Badge variant="outline" className="font-mono text-xs border-blue-500/50 text-blue-400">{ipFilter}</Badge>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={clearIp}>Clear</Button>
          </div>
        )}

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 px-4 sm:px-6 py-1.5 border-b bg-card/50 text-[11px]">
          <span className="text-muted-foreground">{data?.totalEvents ?? 0} events</span>
          {data?.totalNodes > nodes.length && <span className="text-yellow-500">showing top {topN}/type ({nodes.length} of {data.totalNodes} nodes)</span>}
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

        {/* Flow canvas + detail panel */}
        <div className="flex-1 flex overflow-hidden">
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
                onNodeClick={(_, node) => {
                  if (node.data?.nodeType === "ip") applyIp(node.data.label as string);
                }}
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
          {data?.detail && <DetailPanel detail={data.detail} />}
        </div>
      </div>
    </div>
  );
}
