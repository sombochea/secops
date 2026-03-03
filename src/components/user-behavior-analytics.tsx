"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  User, Search, AlertTriangle, Activity, Globe, Server,
  ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  X, ArrowUpDown, Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format-date";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RISK_COLORS = {
  critical: "text-red-500 bg-red-500/15 border-red-500/30",
  high: "text-orange-500 bg-orange-500/15 border-orange-500/30",
  medium: "text-yellow-500 bg-yellow-500/15 border-yellow-500/30",
  normal: "text-emerald-500 bg-emerald-500/15 border-emerald-500/30",
} as const;

type SortKey = "anomalyScore" | "totalEvents" | "failures" | "uniqueIps" | "uniqueCountries";

type UserRow = {
  user: string; totalEvents: number; uniqueIps: number; uniqueHosts: number;
  uniqueServices: number; failures: number; threats: number; maxRisk: number;
  uniqueCountries: number; firstSeen: string; lastSeen: string;
  failRate: number; anomalyScore: number; anomalies: string[]; riskLevel: string;
};

type Detail = {
  user: string; hourlyActivity: number[];
  sourceIps: Record<string, { count: number; threats: number; country: string }>;
  hosts: Record<string, number>; eventTypes: Record<string, number>;
  recentEvents: { event: string; status: string; sourceIp: string; host: string; riskScore: number; timestamp: string }[];
};

export function UserBehaviorAnalytics({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hours, setHours] = useState("168");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("anomalyScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ hours });
    if (selectedUser) p.set("user", selectedUser);
    return `/api/uba?${p}`;
  }, [hours, selectedUser]);

  const { data, isLoading } = useSWR(apiUrl, fetcher, { refreshInterval: 60000, keepPreviousData: true });

  const filtered = useMemo(() => {
    if (!data?.users) return [];
    let list = data.users as UserRow[];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.user?.toLowerCase().includes(q));
    }
    list.sort((a, b) => sortDir === "desc" ? (b[sortBy] ?? 0) - (a[sortBy] ?? 0) : (a[sortBy] ?? 0) - (b[sortBy] ?? 0));
    return list;
  }, [data, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * limit, safePage * limit);
  const from = filtered.length > 0 ? (safePage - 1) * limit + 1 : 0;
  const to = Math.min(safePage * limit, filtered.length);

  const summary = useMemo(() => {
    if (!filtered.length) return { total: 0, critical: 0, high: 0, anomalous: 0 };
    return {
      total: filtered.length,
      critical: filtered.filter((u) => u.riskLevel === "critical").length,
      high: filtered.filter((u) => u.riskLevel === "high").length,
      anomalous: filtered.filter((u) => u.anomalyScore > 0).length,
    };
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
    setPage(1);
  };

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleLimit = (v: number) => { setLimit(v); setPage(1); };

  const SortHeader = ({ label, field, className }: { label: string; field: SortKey; className?: string }) => (
    <TableHead className={cn("cursor-pointer select-none", className)} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1 text-xs">
        {label}
        {sortBy === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  const detail = data?.detail as Detail | null;

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />User Behavior Analytics
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search users..." value={search} onChange={(e) => handleSearch(e.target.value)} className="h-8 w-[160px] sm:w-[180px] pl-8 text-xs" />
              </div>
              <Select value={hours} onValueChange={(v) => { setHours(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["24", "24 hours"], ["72", "3 days"], ["168", "7 days"], ["336", "14 days"], ["720", "30 days"]].map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Users", value: summary.total, color: "" },
              { label: "Critical Risk", value: summary.critical, color: "text-red-500" },
              { label: "High Risk", value: summary.high, color: "text-orange-500" },
              { label: "Anomalous", value: summary.anomalous, color: "text-yellow-500" },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className={cn("text-2xl font-bold tabular-nums", c.color)}>{c.value}</div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Baselines */}
          {data?.baselines && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground px-1">
              <span>Baselines ({hours}h):</span>
              <span>Median events: <span className="text-foreground">{data.baselines.medianEvents}</span></span>
              <span>Median IPs: <span className="text-foreground">{data.baselines.medianIps}</span></span>
              <span>Median fail rate: <span className="text-foreground">{data.baselines.medianFailRate}%</span></span>
              <span>Median countries: <span className="text-foreground">{data.baselines.medianCountries}</span></span>
            </div>
          )}

          <div className={cn("grid gap-4", selectedUser && detail ? "lg:grid-cols-[1fr_340px]" : "")}>
            {/* User table card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">User Risk Assessment</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                    <Select value={String(limit)} onValueChange={(v) => handleLimit(Number(v))}>
                      <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 sm:px-6">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">User</TableHead>
                        <SortHeader label="Risk" field="anomalyScore" />
                        <SortHeader label="Events" field="totalEvents" />
                        <SortHeader label="Failures" field="failures" />
                        <SortHeader label="IPs" field="uniqueIps" />
                        <SortHeader label="Countries" field="uniqueCountries" />
                        <TableHead className="text-xs">Anomalies</TableHead>
                        <TableHead className="text-xs w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading && !paged.length ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">Loading...</TableCell></TableRow>
                      ) : !paged.length ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No user data found</TableCell></TableRow>
                      ) : paged.map((u) => (
                        <TableRow
                          key={u.user}
                          className={cn("cursor-pointer transition-colors", selectedUser === u.user ? "bg-muted/50" : "hover:bg-muted/30")}
                          onClick={() => setSelectedUser(selectedUser === u.user ? "" : u.user)}
                        >
                          <TableCell className="font-medium text-sm">{u.user}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", RISK_COLORS[u.riskLevel as keyof typeof RISK_COLORS])}>
                              {u.anomalyScore}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">{u.totalEvents.toLocaleString()}</TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {u.failures > 0 ? <span className="text-red-400">{u.failures} ({u.failRate}%)</span> : "0"}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">{u.uniqueIps}</TableCell>
                          <TableCell className="text-xs tabular-nums">{u.uniqueCountries}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.anomalies.map((a) => (
                                <Badge key={a} variant="secondary" className="text-[9px] px-1 py-0">{a}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden space-y-2 px-4">
                  {isLoading && !paged.length ? (
                    <p className="text-center py-12 text-muted-foreground text-sm">Loading...</p>
                  ) : !paged.length ? (
                    <p className="text-center py-12 text-muted-foreground text-sm">No user data found</p>
                  ) : paged.map((u) => (
                    <button
                      key={u.user}
                      className={cn(
                        "w-full text-left rounded-lg border p-3 space-y-2 transition-colors",
                        selectedUser === u.user ? "bg-muted/50 border-primary/30" : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedUser(selectedUser === u.user ? "" : u.user)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{u.user}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", RISK_COLORS[u.riskLevel as keyof typeof RISK_COLORS])}>
                          Score: {u.anomalyScore}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Events</span>
                        <span className="tabular-nums">{u.totalEvents.toLocaleString()}</span>
                        <span className="text-muted-foreground">Failures</span>
                        <span className="tabular-nums">{u.failures > 0 ? <span className="text-red-400">{u.failures} ({u.failRate}%)</span> : "0"}</span>
                        <span className="text-muted-foreground">Source IPs</span>
                        <span className="tabular-nums">{u.uniqueIps}</span>
                        <span className="text-muted-foreground">Countries</span>
                        <span className="tabular-nums">{u.uniqueCountries}</span>
                      </div>
                      {u.anomalies.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {u.anomalies.map((a) => (
                            <Badge key={a} variant="secondary" className="text-[9px] px-1 py-0">{a}</Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Pagination */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 px-4 sm:px-0">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length > 0 ? `Showing ${from}–${to} of ${filtered.length}` : "No results"}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={safePage <= 1}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-3 text-xs tabular-nums text-muted-foreground">
                      {safePage} / {totalPages}
                    </span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detail panel */}
            {selectedUser && detail && <DetailPanel detail={detail} onClose={() => setSelectedUser("")} />}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <Card className="lg:sticky lg:top-4 self-start">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-purple-500" />{detail.user}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Hourly activity heatmap */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Hourly Activity (UTC)</p>
          <div className="flex gap-px">
            {detail.hourlyActivity.map((v, i) => {
              const max = Math.max(...detail.hourlyActivity, 1);
              const intensity = v / max;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${i}:00 — ${v} events`}>
                  <div
                    className="w-full h-5 rounded-sm border border-border/50"
                    style={{ background: v > 0 ? `rgba(168,85,247,${0.15 + intensity * 0.75})` : "transparent" }}
                  />
                  {i % 6 === 0 && <span className="text-[8px] text-muted-foreground">{i}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Source IPs */}
        <DetailSection title="Source IPs">
          {Object.entries(detail.sourceIps).slice(0, 8).map(([ip, info]) => (
            <div key={ip} className="flex items-center justify-between text-xs py-0.5">
              <Link href={`/flowmap?ip=${encodeURIComponent(ip)}`} className="font-mono hover:text-blue-400 truncate mr-2 inline-flex items-center gap-1">
                {ip}<Workflow className="h-3 w-3 text-muted-foreground shrink-0" />
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                {info.country && <span className="text-[10px] text-muted-foreground">{info.country}</span>}
                {info.threats > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0">{info.threats}</Badge>}
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{info.count}</Badge>
              </div>
            </div>
          ))}
        </DetailSection>

        {/* Hosts */}
        <DetailSection title="Target Hosts">
          {Object.entries(detail.hosts).slice(0, 6).map(([h, c]) => (
            <div key={h} className="flex justify-between text-xs py-0.5">
              <span className="font-mono truncate mr-2">{h}</span>
              <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">{c}</Badge>
            </div>
          ))}
        </DetailSection>

        {/* Event types */}
        <DetailSection title="Event Types">
          {Object.entries(detail.eventTypes).map(([t, c]) => (
            <div key={t} className="flex justify-between text-xs py-0.5">
              <span className="font-mono truncate mr-2">{t}</span>
              <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">{c}</Badge>
            </div>
          ))}
        </DetailSection>

        {/* Recent events */}
        <DetailSection title="Recent Events">
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {detail.recentEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", e.status === "failed" ? "bg-red-500" : "bg-emerald-500")} />
                <span className="font-mono truncate">{e.event}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{formatRelative(e.timestamp)}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      </CardContent>
    </Card>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      {children}
    </div>
  );
}
