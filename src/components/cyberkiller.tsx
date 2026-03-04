'use client';

import useSWR from 'swr';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid } from 'recharts';
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
    GitCompareArrows,
    TrendingUp,
    TrendingDown,
    Minus,
    Workflow,
} from 'lucide-react';
import { useTimezone } from '@/lib/timezone-context';
import { formatTz, formatRelative } from '@/lib/format-date';
import type {
    SecurityEvent,
    RiskSource,
    Stats,
    TimelinePoint,
    GeoPoint,
} from '@/lib/types';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isThreat(e: SecurityEvent) {
    return (
        e.status === 'failed' ||
        e.authMethod === 'invalid_user' ||
        e.event === 'ssh_attempt' ||
        e.status === 'suspicious'
    );
}

function ThreatLevel({ stats }: { stats?: Stats }) {
    if (!stats) return null;
    const ratio = stats.total > 0 ? stats.threats / stats.total : 0;
    const level =
        ratio > 0.5
            ? 'CRITICAL'
            : ratio > 0.2
              ? 'HIGH'
              : ratio > 0.05
                ? 'ELEVATED'
                : 'LOW';
    const color =
        ratio > 0.5
            ? 'text-red-500'
            : ratio > 0.2
              ? 'text-orange-500'
              : ratio > 0.05
                ? 'text-yellow-500'
                : 'text-emerald-500';
    const bg =
        ratio > 0.5
            ? 'bg-red-500/10'
            : ratio > 0.2
              ? 'bg-orange-500/10'
              : ratio > 0.05
                ? 'bg-yellow-500/10'
                : 'bg-emerald-500/10';
    return (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${bg}`}>
            <span
                className={`h-2 w-2 rounded-full animate-pulse ${color.replace('text-', 'bg-')}`}
            />
            <span className={`text-xs font-bold tracking-widest ${color}`}>
                {level}
            </span>
        </div>
    );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

function StatBox({
    icon: Icon,
    label,
    value,
    color = 'text-foreground',
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    color?: string;
}) {
    const raw = typeof value === 'number' ? value : 0;
    const compact = typeof value === 'number' ? formatCompact(raw) : value;
    const full = typeof value === 'number' ? raw.toLocaleString() : value;
    const needsHint = compact !== full;

    return (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-card/50 px-4 py-3 min-w-[100px]" title={needsHint ? String(full) : undefined}>
            <Icon className={`h-4 w-4 ${color}`} />
            <span className={`text-2xl font-bold tabular-nums ${color}`}>
                {compact}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {label}
            </span>
        </div>
    );
}

function LiveFeed({ events, tz, portalContainer, onVisualize }: { events: SecurityEvent[]; tz: string; portalContainer?: HTMLElement | null; onVisualize?: (ip: string) => void }) {
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
                    <span className="text-xs font-medium uppercase tracking-wider">
                        Live Feed
                    </span>
                </div>
                <button
                    className={`text-[10px] ${autoScroll ? 'text-emerald-500' : 'text-muted-foreground'}`}
                    onClick={() => setAutoScroll(!autoScroll)}
                >
                    {autoScroll ? 'AUTO' : 'PAUSED'}
                </button>
            </div>
            <div
                ref={feedRef}
                className="flex-1 overflow-y-auto space-y-0.5 p-1"
            >
                {events.map((e) => {
                    const threat = isThreat(e);
                    return (
                        <Popover key={e.id}>
                            <PopoverTrigger asChild>
                                <div
                                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-mono transition-colors cursor-pointer hover:bg-muted/40 ${
                                        threat
                                            ? 'bg-red-500/5 border-l-2 border-red-500'
                                            : 'bg-card/30 border-l-2 border-transparent'
                                    }`}
                                >
                                    <span className="text-[10px] text-muted-foreground shrink-0 w-[52px]">
                                        {formatTz(e.timestamp, 'HH:mm:ss', tz)}
                                    </span>
                                    <span
                                        className={`shrink-0 ${threat ? 'text-red-400' : 'text-emerald-400'}`}
                                    >
                                        {e.status === 'failed'
                                            ? '✗'
                                            : e.status === 'suspicious'
                                              ? '⚠'
                                              : '•'}
                                    </span>
                                    <span className="text-muted-foreground shrink-0 w-[110px] truncate">
                                        {e.sourceIp ?? '—'}
                                    </span>
                                    {e.sourceIp && onVisualize && (
                                        <button className="shrink-0 text-muted-foreground hover:text-blue-400" onClick={(ev) => { ev.stopPropagation(); onVisualize(e.sourceIp!); }} title="Visualize">
                                            <Workflow className="h-3 w-3" />
                                        </button>
                                    )}
                                    <span className="truncate flex-1">
                                        {e.event}
                                    </span>
                                    <span className="text-muted-foreground truncate max-w-[80px]">
                                        {e.user ?? ''}
                                    </span>
                                    <span className="text-muted-foreground truncate max-w-[100px] hidden lg:inline">
                                        {e.host ?? ''}
                                    </span>
                                    {(e.riskScore ?? 0) > 0 && (
                                        <Badge
                                            variant="outline"
                                            className={`text-[9px] px-1 py-0 shrink-0 ${
                                                (e.riskScore ?? 0) >= 60
                                                    ? 'border-red-500/50 text-red-400'
                                                    : 'border-yellow-500/50 text-yellow-400'
                                            }`}
                                        >
                                            {e.riskScore}
                                        </Badge>
                                    )}
                                </div>
                            </PopoverTrigger>
                            <PopoverContent
                                side="left"
                                className="w-72 p-3 text-xs space-y-2"
                                container={portalContainer}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold">
                                        {e.event}
                                    </span>
                                    {threat && (
                                        <Badge
                                            variant="destructive"
                                            className="text-[9px]"
                                        >
                                            THREAT
                                        </Badge>
                                    )}
                                </div>
                                <div className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-2 text-muted-foreground">
                                    <span>Time</span>
                                    <span className="text-foreground font-mono">
                                        {formatTz(
                                            e.timestamp,
                                            'yyyy-MM-dd HH:mm:ss',
                                            tz,
                                        )}
                                    </span>
                                    <span>Status</span>
                                    <span className="text-foreground">
                                        {e.status ?? '—'}
                                    </span>
                                    <span>Source IP</span>
                                    <span className="text-foreground font-mono">
                                        {e.sourceIp ?? '—'}
                                    </span>
                                    {e.geoCountry && (
                                        <>
                                            <span>Location</span>
                                            <span className="text-foreground">
                                                {[e.geoCity, e.geoCountry]
                                                    .filter(Boolean)
                                                    .join(', ')}
                                            </span>
                                        </>
                                    )}
                                    <span>Host</span>
                                    <span className="text-foreground font-mono">
                                        {e.host ?? '—'}
                                    </span>
                                    <span>User</span>
                                    <span className="text-foreground">
                                        {e.user ?? '—'}
                                    </span>
                                    <span>Service</span>
                                    <span className="text-foreground">
                                        {e.service ?? '—'}
                                    </span>
                                    <span>Auth</span>
                                    <span className="text-foreground">
                                        {e.authMethod ?? '—'}
                                    </span>
                                    {e.ua && (
                                        <>
                                            <span>UA</span>
                                            <span className="text-foreground truncate">
                                                {e.ua}
                                            </span>
                                        </>
                                    )}
                                    {(e.riskScore ?? 0) > 0 && (
                                        <>
                                            <span>Risk Score</span>
                                            <span className="text-foreground font-mono">
                                                {e.riskScore}/100
                                            </span>
                                        </>
                                    )}
                                </div>
                                {e.sourceIp && onVisualize && (
                                  <button
                                    className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 mt-1"
                                    onClick={() => onVisualize(e.sourceIp!)}
                                  >
                                    <Workflow className="h-3 w-3" />Visualize attack paths
                                  </button>
                                )}
                            </PopoverContent>
                        </Popover>
                    );
                })}
            </div>
        </div>
    );
}

function AttackerBoard({ sources, total, onVisualize }: { sources: RiskSource[]; total: number; onVisualize?: (ip: string) => void }) {
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
                <Crosshair className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-medium uppercase tracking-wider">
                    Top Attackers
                </span>
                <Badge variant="outline" className="text-[9px] ml-auto" title={`${total.toLocaleString()} total unique attacker IPs`}>
                    {formatCompact(total)}
                </Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                {sources.map((s, i) => (
                    <div
                        key={s.sourceIp}
                        className="flex items-center gap-2 rounded px-2 py-1.5 bg-card/30 text-xs"
                    >
                        <span className="text-red-500 font-bold w-4 text-center">
                            {i + 1}
                        </span>
                        <span className="font-mono flex-1 truncate">
                            {s.sourceIp}
                        </span>
                        {onVisualize && (
                            <button className="shrink-0 text-muted-foreground hover:text-blue-400" onClick={() => onVisualize(s.sourceIp)} title="Visualize">
                                <Workflow className="h-3 w-3" />
                            </button>
                        )}
                        <div className="flex items-center gap-1">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-red-500"
                                    style={{
                                        width: `${Math.min(100, (s.count / (sources[0]?.count || 1)) * 100)}%`,
                                    }}
                                />
                            </div>
                            <span className="text-muted-foreground tabular-nums w-12 text-right" title={s.count.toLocaleString()}>
                                {formatCompact(s.count)}
                            </span>
                        </div>
                    </div>
                ))}
                {!sources.length && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                        No attackers detected
                    </p>
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
                <span className="text-xs font-medium uppercase tracking-wider">
                    Activity
                </span>
            </div>
            <div className="flex-1 p-2">
                {data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient
                                    id="ckTotal"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stopColor="hsl(221, 83%, 53%)"
                                        stopOpacity={0.4}
                                    />
                                    <stop
                                        offset="100%"
                                        stopColor="hsl(221, 83%, 53%)"
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                                <linearGradient
                                    id="ckThreats"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stopColor="hsl(0, 72%, 51%)"
                                        stopOpacity={0.4}
                                    />
                                    <stop
                                        offset="100%"
                                        stopColor="hsl(0, 72%, 51%)"
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="hsl(221, 83%, 53%)"
                                strokeWidth={1.5}
                                fill="url(#ckTotal)"
                            />
                            <Area
                                type="monotone"
                                dataKey="threats"
                                stroke="hsl(0, 72%, 51%)"
                                strokeWidth={1.5}
                                fill="url(#ckThreats)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        No data
                    </div>
                )}
            </div>
        </div>
    );
}

function CyberKillerMap({ points }: { points: GeoPoint[] }) {
    const [components, setComponents] = useState<{
        MapContainer: typeof import('react-leaflet').MapContainer;
        TileLayer: typeof import('react-leaflet').TileLayer;
        CircleMarker: typeof import('react-leaflet').CircleMarker;
        Tooltip: typeof import('react-leaflet').Tooltip;
    } | null>(null);

    useEffect(() => {
        // @ts-expect-error -- CSS import
        import('leaflet/dist/leaflet.css');
        import('react-leaflet').then((mod) => {
            setComponents({
                MapContainer: mod.MapContainer,
                TileLayer: mod.TileLayer,
                CircleMarker: mod.CircleMarker,
                Tooltip: mod.Tooltip,
            });
        });
    }, []);

    if (!components) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                Loading map...
            </div>
        );
    }

    const { MapContainer, TileLayer, CircleMarker, Tooltip } = components;
    const maxCount = Math.max(1, ...points.map((p) => p.count));

    return (
        <div className="h-full relative">
            <div className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 bg-background/80 rounded px-2 py-1">
                <Globe className="h-3 w-3 text-red-500" />
                <span className="text-[10px] font-medium uppercase tracking-wider">
                    Threat Map
                </span>
            </div>
            <MapContainer
                center={[20, 0]}
                zoom={2}
                minZoom={2}
                maxZoom={10}
                scrollWheelZoom={true}
                className="h-full w-full z-0"
                style={{ background: 'hsl(222.2 84% 4.9%)' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {points.map((p) => {
                    const hasThreat = p.threats > 0;
                    const r = Math.max(
                        3,
                        Math.min(14, (p.count / maxCount) * 14),
                    );
                    return (
                        <CircleMarker
                            key={`${p.lat}-${p.lon}`}
                            center={[p.lat, p.lon]}
                            radius={r}
                            pathOptions={{
                                color: hasThreat
                                    ? 'hsl(0,72%,51%)'
                                    : 'hsl(221,83%,53%)',
                                fillColor: hasThreat
                                    ? 'hsl(0,72%,51%)'
                                    : 'hsl(221,83%,53%)',
                                fillOpacity: 0.6,
                                weight: 1,
                            }}
                        >
                            <Tooltip>
                                <span className="text-xs">
                                    {p.city
                                        ? `${p.city}, ${p.country}`
                                        : p.country}{' '}
                                    — {p.count} events, {p.threats} threats
                                </span>
                            </Tooltip>
                        </CircleMarker>
                    );
                })}
            </MapContainer>
        </div>
    );
}

// --- Then & Now Comparison Panel ---
function Delta({ now, then, label, icon: Icon }: { now: number; then: number; label: string; icon: React.ElementType }) {
  const diff = now - then;
  const pct = then > 0 ? Math.round((diff / then) * 100) : now > 0 ? 100 : 0;
  const clampedPct = Math.min(Math.max(pct, -999), 9999);
  const pctStr = Math.abs(clampedPct) > 999 ? `${clampedPct > 0 ? "+" : ""}${(clampedPct / 1000).toFixed(1)}k` : `${clampedPct > 0 ? "+" : ""}${clampedPct}`;
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-2 bg-card/50 rounded border border-border/50 overflow-hidden" title={`Now: ${now.toLocaleString()} / Then: ${then.toLocaleString()}`}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-sm font-bold tabular-nums truncate">{formatCompact(now)}</span>
        {diff !== 0 && (
          <span className={`text-[9px] flex items-center gap-0.5 shrink-0 ${diff > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {diff > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {pctStr}%
          </span>
        )}
        {diff === 0 && <Minus className="h-3 w-3 text-muted-foreground shrink-0" />}
      </div>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider truncate">{label}</span>
    </div>
  );
}

function ComparePanel({ hours, onHoursChange, portalContainer }: { hours: string; onHoursChange: (h: string) => void; portalContainer?: HTMLElement | null }) {
  const { data } = useSWR(`/api/events/compare?hours=${hours}`, fetcher, { refreshInterval: 10000 });

  if (!data) return <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading comparison...</div>;

  const { now: n, then: t, timeline, topIps } = data;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <GitCompareArrows className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs font-medium uppercase tracking-wider">Then &amp; Now</span>
        </div>
        <Select value={hours} onValueChange={onHoursChange}>
          <SelectTrigger className="h-6 w-[90px] text-[10px] border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem value="1">1h</SelectItem>
            <SelectItem value="6">6h</SelectItem>
            <SelectItem value="12">12h</SelectItem>
            <SelectItem value="24">24h</SelectItem>
            <SelectItem value="72">3d</SelectItem>
            <SelectItem value="168">7d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Delta stats */}
      <div className="grid grid-cols-3 gap-1.5 px-3 py-2 shrink-0">
        <Delta now={n.total} then={t.total} label="Events" icon={Activity} />
        <Delta now={n.threats} then={t.threats} label="Threats" icon={AlertTriangle} />
        <Delta now={n.unique_ips} then={t.unique_ips} label="IPs" icon={Globe} />
      </div>

      {/* Overlay timeline chart */}
      <div className="flex-1 min-h-0 px-2 pb-1">
        <div className="text-[9px] text-muted-foreground px-1 mb-0.5">Activity overlay — <span className="text-blue-400">Now</span> vs <span className="text-muted-foreground/60">Then</span></div>
        <div className="h-[calc(100%-16px)]">
          {(timeline?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cmpNow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(221,83%,53%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(221,83%,53%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cmpThen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(215,20%,50%)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(215,20%,50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="offset_h" hide />
                <YAxis hide />
                <Area type="monotone" dataKey="then_total" stroke="hsl(215,20%,40%)" strokeWidth={1} strokeDasharray="4 2" fill="url(#cmpThen)" />
                <Area type="monotone" dataKey="now_total" stroke="hsl(221,83%,53%)" strokeWidth={1.5} fill="url(#cmpNow)" />
                <Area type="monotone" dataKey="now_threats" stroke="hsl(0,72%,51%)" strokeWidth={1} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No data</div>
          )}
        </div>
      </div>

      {/* Top attacker comparison */}
      {(topIps?.length ?? 0) > 0 && (
        <div className="shrink-0 border-t border-border/50 px-3 py-2 max-h-[140px] overflow-y-auto">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Top Attackers — Now vs Then</div>
          <div className="space-y-1">
            {topIps.slice(0, 5).map((ip: { source_ip: string; now_count: number; then_count: number }) => {
              const max = Math.max(ip.now_count, ip.then_count, 1);
              return (
                <div key={ip.source_ip} className="text-[10px]">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono truncate">{ip.source_ip}</span>
                    <span className="text-muted-foreground">{ip.now_count} / {ip.then_count}</span>
                  </div>
                  <div className="flex gap-0.5 h-1.5">
                    <div className="bg-blue-500 rounded-sm" style={{ width: `${(ip.now_count / max) * 100}%` }} />
                    <div className="bg-muted-foreground/30 rounded-sm" style={{ width: `${(ip.then_count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CyberKillerView() {
    const router = useRouter();
    const { timezone } = useTimezone();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showCompare, setShowCompare] = useState(false);
    const [compareHours, setCompareHours] = useState("24");
    const [flowIps, setFlowIps] = useState<string[]>([]);
    const openFlow = useCallback((ip: string) => {
        setFlowIps((prev) => prev.includes(ip) ? prev : [...prev, ip]);
    }, []);
    const closeFlow = useCallback((ip: string) => {
        setFlowIps((prev) => prev.filter((i) => i !== ip));
    }, []);
    const containerRef = useRef<HTMLDivElement>(null);

    const [apiUrl] = useState(() => {
        const now = new Date();
        const from = new Date(now.getTime() - 86400000);
        return `/api/events?limit=50&from=${from.toISOString()}&to=${now.toISOString()}`;
    });

    const [statsUrl] = useState(() => {
        const now = new Date();
        const from = new Date(now.getTime() - 86400000);
        return `/api/events/stats?from=${from.toISOString()}&to=${now.toISOString()}`;
    });

    const { data } = useSWR(apiUrl, fetcher, {
        refreshInterval: 3000,
        keepPreviousData: true,
    });
    const { data: sd } = useSWR(statsUrl, fetcher, {
        refreshInterval: 15000,
        keepPreviousData: true,
    });

    const events: SecurityEvent[] = data?.events ?? [];
    const stats: Stats | undefined = sd?.stats;
    const riskSources: RiskSource[] = sd?.riskSources ?? [];
    const riskTotal: number = sd?.riskTotal ?? 0;
    const timeline: TimelinePoint[] = sd?.timeline ?? [];
    const geoPoints: GeoPoint[] = sd?.geoPoints ?? [];

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
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const now = new Date();

    return (
        <div
            ref={containerRef}
            className="h-screen bg-background flex flex-col overflow-hidden"
        >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => router.push('/')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-red-500" />
                        <span className="font-bold text-sm tracking-wider uppercase">
                            CyberKiller
                        </span>
                        <Badge
                            variant="outline"
                            className="text-[9px] border-red-500/50 text-red-400"
                        >
                            SOC
                        </Badge>
                    </div>
                    <ThreatLevel stats={stats} />
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant={showCompare ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => setShowCompare(!showCompare)}
                    >
                        <GitCompareArrows className="h-3 w-3" />
                        Then &amp; Now
                    </Button>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        LIVE · 3s
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                        {formatTz(now.toISOString(), 'HH:mm:ss zzz', timezone)}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={toggleFullscreen}
                    >
                        {isFullscreen ? (
                            <Minimize className="h-4 w-4" />
                        ) : (
                            <Maximize className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto shrink-0">
                <StatBox
                    icon={Activity}
                    label="Total"
                    value={stats?.total ?? 0}
                />
                <StatBox
                    icon={AlertTriangle}
                    label="Threats"
                    value={stats?.threats ?? 0}
                    color="text-red-500"
                />
                <StatBox
                    icon={Zap}
                    label="Last 24h"
                    value={stats?.last24h ?? 0}
                    color="text-blue-500"
                />
                <StatBox
                    icon={Server}
                    label="Hosts"
                    value={stats?.uniqueHosts ?? 0}
                />
                <StatBox
                    icon={Globe}
                    label="IPs"
                    value={stats?.uniqueIps ?? 0}
                />
                <StatBox
                    icon={Users}
                    label="Users"
                    value={stats?.uniqueUsers ?? 0}
                />
                <StatBox
                    icon={Crosshair}
                    label="Attackers"
                    value={riskTotal}
                    color="text-red-500"
                />
            </div>

            {/* Main grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 overflow-hidden">
                {/* Left: live feed + map */}
                <div className="border-r border-border/50 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-hidden">
                        <LiveFeed events={events} tz={timezone} portalContainer={containerRef.current} onVisualize={openFlow} />
                    </div>
                    <div className="h-[250px] shrink-0 border-t border-border/50">
                        <CyberKillerMap points={geoPoints} />
                    </div>
                </div>

                {/* Right: attackers + timeline OR compare panel */}
                <div className="flex flex-col overflow-hidden">
                    {showCompare ? (
                        <ComparePanel hours={compareHours} onHoursChange={setCompareHours} portalContainer={containerRef.current} />
                    ) : (
                        <>
                            <div className="flex-1 overflow-hidden border-b border-border/50">
                                <AttackerBoard sources={riskSources} total={riskTotal} onVisualize={openFlow} />
                            </div>
                            <div className="h-[180px] shrink-0">
                                <MiniTimeline data={timeline} />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Flow visualization windows */}
            {flowIps.map((ip, idx) => (
                <FlowWindow key={ip} ip={ip} index={idx} onClose={() => closeFlow(ip)} />
            ))}
        </div>
    );
}

// ─── Flow Overlay Dialog ─────────────────────────────────────────────────────

// ─── Floating Flow Window (multi-window, draggable) ──────────────────────────

function FlowWindow({ ip, index, onClose }: { ip: string; index: number; onClose: () => void }) {
    const [GraphComp, setGraphComp] = useState<typeof import('@/components/security-graph').SecurityGraph | null>(null);
    const [pos, setPos] = useState({ x: 40 + index * 30, y: 40 + index * 30 });
    const [size, setSize] = useState({ w: Math.min(window.innerWidth - 80, 1100), h: Math.min(window.innerHeight - 80, 700) });
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);
    const dragStart = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });
    const [zBump, setZBump] = useState(index);

    useEffect(() => {
        import('@/components/security-graph').then((m) => setGraphComp(() => m.SecurityGraph));
    }, []);

    const { data, isLoading } = useSWR(
        `/api/events/graph?hours=24&limit=500&topN=20&ip=${encodeURIComponent(ip)}`,
        fetcher,
    );

    const onDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        setZBump(Date.now());
        dragStart.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y, w: size.w, h: size.h };
    }, [pos, size]);

    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setResizing(true);
        setZBump(Date.now());
        dragStart.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y, w: size.w, h: size.h };
    }, [pos, size]);

    useEffect(() => {
        if (!dragging && !resizing) return;
        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStart.current.mx;
            const dy = e.clientY - dragStart.current.my;
            if (dragging) setPos({ x: dragStart.current.x + dx, y: dragStart.current.y + dy });
            if (resizing) setSize({ w: Math.max(400, dragStart.current.w + dx), h: Math.max(300, dragStart.current.h + dy) });
        };
        const onUp = () => { setDragging(false); setResizing(false); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [dragging, resizing]);

    const detail = data?.detail as {
        ip: string; totalEvents: number; threats: number; maxRisk: number;
        firstSeen: string; lastSeen: string; country: string; city: string;
        targetHosts: Record<string, number>; targetUsers: Record<string, number>;
        services: Record<string, number>; eventTypes: Record<string, number>;
    } | null;

    const apiNodes = data?.nodes ?? [];
    const apiEdges = data?.edges ?? [];

    return (
        <div
            className="fixed rounded-lg border border-border bg-background shadow-2xl flex flex-col overflow-hidden"
            style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 100 + zBump % 1000 }}
            onMouseDown={() => setZBump(Date.now())}
        >
            {/* Title bar — draggable */}
            <div
                className="flex items-center justify-between px-3 py-2 border-b bg-card cursor-move shrink-0 select-none"
                onMouseDown={onDragStart}
            >
                <div className="flex items-center gap-2 text-sm min-w-0">
                    <Workflow className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="font-semibold truncate">Attack Paths</span>
                    <span className="font-mono text-blue-400 truncate">{ip}</span>
                    {detail && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{[detail.city, detail.country].filter(Boolean).join(', ')}</span>}
                </div>
                <button onClick={onClose} className="shrink-0 ml-2 rounded p-1 hover:bg-muted transition-colors">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
            </div>

            {/* Content */}
            {isLoading || !GraphComp ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
            ) : apiNodes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No data for this IP in the last 24h</div>
            ) : (
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 relative">
                        <GraphComp apiNodes={apiNodes} apiEdges={apiEdges} minimap={false} />
                    </div>
                    {detail && (
                        <div className="w-[200px] border-l overflow-y-auto p-2.5 space-y-2.5 shrink-0 text-[11px] hidden md:block">
                            <div className="grid grid-cols-2 gap-1 text-center">
                                <div className="rounded border border-border/50 bg-card/50 p-1">
                                    <div className="text-sm font-bold tabular-nums">{detail.totalEvents}</div>
                                    <div className="text-[8px] text-muted-foreground uppercase">Events</div>
                                </div>
                                <div className="rounded border border-red-500/30 bg-red-500/5 p-1">
                                    <div className="text-sm font-bold tabular-nums text-red-400">{detail.threats}</div>
                                    <div className="text-[8px] text-muted-foreground uppercase">Threats</div>
                                </div>
                            </div>
                            <div className="space-y-0.5">
                                <div className="flex justify-between"><span className="text-muted-foreground">Risk</span><span className={detail.maxRisk >= 70 ? 'text-red-400' : ''}>{detail.maxRisk}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">First</span><span>{formatRelative(detail.firstSeen)}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Last</span><span>{formatRelative(detail.lastSeen)}</span></div>
                            </div>
                            <FlowSection title="Hosts" data={detail.targetHosts} />
                            <FlowSection title="Users" data={detail.targetUsers} />
                            <FlowSection title="Events" data={detail.eventTypes} />
                            <FlowSection title="Services" data={detail.services} />
                        </div>
                    )}
                </div>
            )}

            {/* Resize handle */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                onMouseDown={onResizeStart}
            >
                <svg className="w-4 h-4 text-muted-foreground/50" viewBox="0 0 16 16"><path d="M14 14L8 14M14 14L14 8M14 14L6 6" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            </div>
        </div>
    );
}

function FlowSection({ title, data }: { title: string; data: Record<string, number> }) {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    return (
        <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{title}</div>
            {entries.slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex justify-between py-0.5">
                    <span className="font-mono truncate mr-1">{k}</span>
                    <span className="text-muted-foreground shrink-0">{v}</span>
                </div>
            ))}
        </div>
    );
}
