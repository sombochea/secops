"use client";

import useSWR from "swr";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Shield,
  Crosshair,
  Activity,
  AlertTriangle,
  Server,
  Globe,
  Users,
  Zap,
  ArrowLeft,
  Maximize,
  Minimize,
} from "lucide-react";
import { useTimezone } from "@/lib/timezone-context";
import { formatTz, formatRelative } from "@/lib/format-date";
import type { SecurityEvent, RiskSource, Stats, TimelinePoint } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isThreat(e: SecurityEvent) {
  return e.status === "failed" || e.authMethod === "invalid_user" || e.event === "ssh_attempt" || e.status === "suspicious";
}

function ThreatLevel({ stats }: { stats?: Stats }) {
  if (!stats) return null;
  const ratio = stats.total > 0 ? stats.threats / stats.total : 0;
  const level = ratio > 0.5 ? "CRITICAL" : ratio > 0.2 ? "HIGH" : ratio > 0.05 ? "ELEVATED" : "LOW";
  const color = ratio > 0.5 ? "text-red-500" : ratio > 0.2 ? "text-orange-500" : ratio > 0.05 ? "text-yellow-500" : "text-emerald-500";
  const bg = ratio > 0.5 ? "bg-red-500/10" : ratio > 0.2 ? "bg-orange-500/10" : ratio > 0.05 ? "bg-yellow-500/10" : "bg-emerald-500/10";
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${bg}`}>
      <span className={`h-2 w-2 rounded-full animate-pulse ${color.replace("text-", "bg-")}`} />
      <span className={`text-xs font-bold tracking-widest ${color}`}>{level}</span>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color = "text-foreground" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-card/50 px-4 py-3 min-w-[100px]">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function LiveFeed({ events, tz }: { events: SecurityEvent[]; tz: string }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
          <span className="text-xs font-medium uppercase tracking-wider">Live Feed</span>
        </div>
        <button
          className={`text-[10px] ${autoScroll ? "text-emerald-500" : "text-muted-foreground"}`}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? "AUTO" : "PAUSED"}
        </button>
      </div>
      <div ref={feedRef} className="flex-1 overflow-y-auto space-y-0.5 p-1">
        {events.map((e) => {
          const threat = isThreat(e);
          return (
            <div
              key={e.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-mono transition-colors ${
                threat ? "bg-red-500/5 border-l-2 border-red-500" : "bg-card/30 border-l-2 border-transparent"
              }`}
            >
              <span className="text-[10px] text-muted-foreground shrink-0 w-[52px]">
                {formatTz(e.timestamp, "HH:mm:ss", tz)}
              </span>
              <span className={`shrink-0 ${threat ? "text-red-400" : "text-emerald-400"}`}>
                {e.status === "failed" ? "✗" : e.status === "suspicious" ? "⚠" : "•"}
              </span>
              <span className="text-muted-foreground shrink-0 w-[110px] truncate">{e.sourceIp ?? "—"}</span>
              <span className="truncate flex-1">{e.event}</span>
              <span className="text-muted-foreground truncate max-w-[80px]">{e.user ?? ""}</span>
              <span className="text-muted-foreground truncate max-w-[100px] hidden lg:inline">{e.host ?? ""}</span>
              {(e.riskScore ?? 0) > 0 && (
                <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${
                  (e.riskScore ?? 0) >= 60 ? "border-red-500/50 text-red-400" : "border-yellow-500/50 text-yellow-400"
                }`}>
                  {e.riskScore}
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttackerBoard({ sources }: { sources: RiskSource[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Crosshair className="h-3.5 w-3.5 text-red-500" />
        <span className="text-xs font-medium uppercase tracking-wider">Top Attackers</span>
        <Badge variant="outline" className="text-[9px] ml-auto">{sources.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {sources.map((s, i) => (
          <div key={s.sourceIp} className="flex items-center gap-2 rounded px-2 py-1.5 bg-card/30 text-xs">
            <span className="text-red-500 font-bold w-4 text-center">{i + 1}</span>
            <span className="font-mono flex-1 truncate">{s.sourceIp}</span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${Math.min(100, (s.count / (sources[0]?.count || 1)) * 100)}%` }}
                />
              </div>
              <span className="text-muted-foreground tabular-nums w-8 text-right">{s.count}</span>
            </div>
          </div>
        ))}
        {!sources.length && (
          <p className="text-xs text-muted-foreground text-center py-8">No attackers detected</p>
        )}
      </div>
    </div>
  );
}

function MiniTimeline({ data }: { data: TimelinePoint[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Zap className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs font-medium uppercase tracking-wider">Activity</span>
      </div>
      <div className="flex-1 p-2">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ckTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ckThreats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Area type="monotone" dataKey="total" stroke="hsl(221, 83%, 53%)" strokeWidth={1.5} fill="url(#ckTotal)" />
              <Area type="monotone" dataKey="threats" stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} fill="url(#ckThreats)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No data</div>
        )}
      </div>
    </div>
  );
}

export function CyberKillerView() {
  const router = useRouter();
  const { timezone } = useTimezone();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [apiUrl] = useState(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 86400000);
    return `/api/events?limit=50&from=${from.toISOString()}&to=${now.toISOString()}`;
  });

  const { data } = useSWR(apiUrl, fetcher, {
    refreshInterval: 3000,
    keepPreviousData: true,
  });

  const events: SecurityEvent[] = data?.events ?? [];
  const stats: Stats | undefined = data?.stats;
  const riskSources: RiskSource[] = data?.riskSources ?? [];
  const timeline: TimelinePoint[] = data?.timeline ?? [];
  const threatEvents = events.filter(isThreat);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const now = new Date();

  return (
    <div ref={containerRef} className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            <span className="font-bold text-sm tracking-wider uppercase">CyberKiller</span>
            <Badge variant="outline" className="text-[9px] border-red-500/50 text-red-400">SOC</Badge>
          </div>
          <ThreatLevel stats={stats} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE · 3s
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {formatTz(now.toISOString(), "HH:mm:ss zzz", timezone)}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto shrink-0">
        <StatBox icon={Activity} label="Total" value={stats?.total ?? 0} />
        <StatBox icon={AlertTriangle} label="Threats" value={stats?.threats ?? 0} color="text-red-500" />
        <StatBox icon={Zap} label="Last 24h" value={stats?.last24h ?? 0} color="text-blue-500" />
        <StatBox icon={Server} label="Hosts" value={stats?.uniqueHosts ?? 0} />
        <StatBox icon={Globe} label="IPs" value={stats?.uniqueIps ?? 0} />
        <StatBox icon={Users} label="Users" value={stats?.uniqueUsers ?? 0} />
        <StatBox icon={Crosshair} label="Attackers" value={riskSources.length} color="text-red-500" />
      </div>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 overflow-hidden">
        {/* Left: live feed */}
        <div className="border-r border-border/50 overflow-hidden flex flex-col">
          <LiveFeed events={events} tz={timezone} />
        </div>

        {/* Right: attackers + timeline */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden border-b border-border/50">
            <AttackerBoard sources={riskSources} />
          </div>
          <div className="h-[180px] shrink-0">
            <MiniTimeline data={timeline} />
          </div>
        </div>
      </div>
    </div>
  );
}
