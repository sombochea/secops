"use client";

import { useCallback, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Search, Plus, X, Play, Save, FolderOpen, Globe, Server, User,
  AlertTriangle, Shield, ChevronDown, ChevronRight, Clock, Crosshair,
  CheckCircle2, XCircle, MinusCircle, Trash2, Copy, CalendarIcon,
} from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import type { SecurityEvent } from "@/lib/types";
import { useTimezone } from "@/lib/timezone-context";
import { formatTz, formatRelative } from "@/lib/format-date";
import { BUILD_INFO } from "@/lib/build-info";

interface Condition { field: string; op: string; value: string }
interface HuntQuery { iocs: string[]; conditions: Condition[]; from: string; to: string; minRisk: number; onlyThreats: boolean }
interface SavedQuery { name: string; query: HuntQuery }

const FIELDS = [
  { value: "source_ip", label: "Source IP" },
  { value: "host", label: "Host" },
  { value: "user", label: "User" },
  { value: "event", label: "Event" },
  { value: "status", label: "Status" },
  { value: "service", label: "Service" },
  { value: "auth_method", label: "Auth Method" },
  { value: "ua", label: "User Agent" },
  { value: "geo_country", label: "Country" },
  { value: "geo_city", label: "City" },
];

const OPS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "starts", label: "starts with" },
  { value: "ends", label: "ends with" },
];

const PRESETS: SavedQuery[] = [
  { name: "Brute Force IPs", query: { iocs: [], conditions: [{ field: "auth_method", op: "eq", value: "invalid_user" }], from: "", to: "", minRisk: 0, onlyThreats: true } },
  { name: "High Risk (≥70)", query: { iocs: [], conditions: [], from: "", to: "", minRisk: 70, onlyThreats: false } },
  { name: "SSH Attempts", query: { iocs: [], conditions: [{ field: "event", op: "eq", value: "ssh_attempt" }], from: "", to: "", minRisk: 0, onlyThreats: false } },
  { name: "Failed DB Auth", query: { iocs: [], conditions: [{ field: "event", op: "contains", value: "_auth" }, { field: "status", op: "eq", value: "failed" }], from: "", to: "", minRisk: 0, onlyThreats: false } },
];

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  const s = status.toLowerCase();
  if (s === "failed" || s === "suspicious") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (s === "success" || s === "closed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
}

function isThreat(e: SecurityEvent) {
  return e.status === "failed" || e.authMethod === "invalid_user" || e.event === "ssh_attempt" || e.status === "suspicious";
}

export function ThreatHunting({ userName }: { userName: string }) {
  const { timezone } = useTimezone();
  const [iocInput, setIocInput] = useState("");
  const [iocs, setIocs] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minRisk, setMinRisk] = useState(0);
  const [onlyThreats, setOnlyThreats] = useState(false);
  const [results, setResults] = useState<SecurityEvent[] | null>(null);
  const [facets, setFacets] = useState<{ uniqueIps: number; uniqueHosts: number; uniqueUsers: number; avgRisk: number; maxRisk: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedQuery[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("secops-hunts") ?? "[]"); } catch { return []; }
  });

  const addIoc = () => {
    const v = iocInput.trim();
    if (v && !iocs.includes(v)) setIocs([...iocs, v]);
    setIocInput("");
  };

  const addCondition = () => setConditions([...conditions, { field: "source_ip", op: "contains", value: "" }]);

  const updateCondition = (i: number, patch: Partial<Condition>) => {
    const next = [...conditions];
    next[i] = { ...next[i], ...patch };
    setConditions(next);
  };

  const hunt = useCallback(async (p = 1) => {
    setLoading(true);
    setPage(p);
    const res = await fetch("/api/hunt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iocs, conditions: conditions.filter((c) => c.value), from, to, minRisk, onlyThreats, page: p, limit: 50 }),
    });
    const data = await res.json();
    setResults(data.events ?? []);
    setTotal(data.total ?? 0);
    setTotalPages(data.totalPages ?? 0);
    setFacets(data.facets ?? null);
    setLoading(false);
  }, [iocs, conditions, from, to, minRisk, onlyThreats]);

  const loadQuery = (q: HuntQuery) => {
    setIocs(q.iocs); setConditions(q.conditions); setFrom(q.from); setTo(q.to);
    setMinRisk(q.minRisk); setOnlyThreats(q.onlyThreats); setResults(null);
  };

  const saveQuery = () => {
    const name = prompt("Query name:");
    if (!name) return;
    const q: SavedQuery = { name, query: { iocs, conditions, from, to, minRisk, onlyThreats } };
    const next = [...saved, q];
    setSaved(next);
    localStorage.setItem("secops-hunts", JSON.stringify(next));
  };

  const deleteQuery = (i: number) => {
    const next = saved.filter((_, j) => j !== i);
    setSaved(next);
    localStorage.setItem("secops-hunts", JSON.stringify(next));
  };

  const copyIoc = (v: string) => { navigator.clipboard.writeText(v); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => {}} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 space-y-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2"><Crosshair className="h-5 w-5" />Threat Hunting</h1>
          <p className="text-sm text-muted-foreground">Search for IOCs, build custom queries, and investigate potential threats</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Query builder */}
          <div className="space-y-4">
            {/* IOC search */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4" />IOC Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="IP, hostname, username, user agent..."
                    value={iocInput}
                    onChange={(e) => setIocInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIoc())}
                    className="flex-1"
                  />
                  <Button size="sm" variant="secondary" onClick={addIoc} disabled={!iocInput.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {iocs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {iocs.map((ioc) => (
                      <Badge key={ioc} variant="secondary" className="gap-1 text-xs pr-1">
                        {ioc}
                        <button onClick={() => setIocs(iocs.filter((i) => i !== ioc))} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conditions */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Conditions</CardTitle>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={addCondition}><Plus className="h-3 w-3" />Add</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={c.field} onValueChange={(v) => updateCondition(i, { field: v })}>
                      <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={c.op} onValueChange={(v) => updateCondition(i, { op: v })}>
                      <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="flex-1 h-8 text-xs" placeholder="Value" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions — click Add to filter by specific fields</p>}

                {/* Filters row */}
                <div className="flex items-center gap-4 pt-2 flex-wrap">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {from ? format(new Date(from), "MMM d, yyyy") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={from ? new Date(from) : undefined} onSelect={(d) => setFrom(d ? startOfDay(d).toISOString() : "")} disabled={{ after: new Date() }} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {to ? format(new Date(to), "MMM d, yyyy") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={to ? new Date(to) : undefined} onSelect={(d) => setTo(d ? endOfDay(d).toISOString() : "")} disabled={{ after: new Date() }} />
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Risk ≥ {minRisk}</span>
                    <Slider value={[minRisk]} min={0} max={100} step={5} onValueChange={([v]) => setMinRisk(v)} className="w-[100px]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={onlyThreats} onCheckedChange={setOnlyThreats} id="threats-only" />
                    <label htmlFor="threats-only" className="text-xs text-muted-foreground cursor-pointer">Threats only</label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button onClick={() => hunt(1)} disabled={loading} className="gap-1.5">
                <Play className="h-4 w-4" />{loading ? "Hunting..." : "Hunt"}
              </Button>
              <Button variant="outline" size="sm" onClick={saveQuery} disabled={iocs.length === 0 && conditions.length === 0}>
                <Save className="h-3.5 w-3.5 mr-1" />Save Query
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setIocs([]); setConditions([]); setFrom(""); setTo(""); setMinRisk(0); setOnlyThreats(false); setResults(null); }}>
                Clear
              </Button>
            </div>

            {/* Facets */}
            {facets && results && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { label: "Matches", value: total, icon: Search },
                  { label: "Unique IPs", value: facets.uniqueIps, icon: Globe },
                  { label: "Hosts", value: facets.uniqueHosts, icon: Server },
                  { label: "Users", value: facets.uniqueUsers, icon: User },
                  { label: "Max Risk", value: facets.maxRisk, icon: AlertTriangle, color: facets.maxRisk >= 60 ? "text-red-500" : "" },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="pt-3 pb-3 flex items-center gap-2">
                      <s.icon className={`h-4 w-4 text-muted-foreground ${s.color ?? ""}`} />
                      <div>
                        <div className={`text-lg font-bold ${s.color ?? ""}`}>{s.value}</div>
                        <div className="text-[10px] text-muted-foreground">{s.label}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Results */}
            {results && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{total} results</CardTitle>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={page <= 1} onClick={() => hunt(page - 1)}>Prev</Button>
                        <span className="text-xs text-muted-foreground">{page}/{totalPages}</span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => hunt(page + 1)}>Next</Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No events match your hunt criteria</p>
                  ) : (
                    <div className="space-y-1">
                      {results.map((e) => (
                        <div key={e.id}>
                          <button
                            className={`w-full text-left rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors text-sm ${isThreat(e) ? "border-red-500/30" : "border-border"}`}
                            onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <StatusIcon status={e.status} />
                                <span className="font-mono text-xs">{e.event}</span>
                                {e.status && <Badge variant={isThreat(e) ? "destructive" : "secondary"} className="text-[10px] px-1 py-0">{e.status}</Badge>}
                                {(e.riskScore ?? 0) > 0 && <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-400 border-orange-400/50">Risk {e.riskScore}</Badge>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground font-mono">{formatTz(e.timestamp, "MMM d HH:mm:ss", timezone)}</span>
                                {expanded === e.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              {e.sourceIp && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{e.sourceIp}</span>}
                              {e.host && <span className="flex items-center gap-1"><Server className="h-3 w-3" />{e.host}</span>}
                              {e.user && <span className="flex items-center gap-1"><User className="h-3 w-3" />{e.user}</span>}
                              {e.geoCountry && <span>{e.geoCity ? `${e.geoCity}, ${e.geoCountry}` : e.geoCountry}</span>}
                            </div>
                          </button>
                          {expanded === e.id && (
                            <div className="ml-6 mt-1 mb-2 rounded border bg-muted/30 p-3 text-xs">
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                                <span className="text-muted-foreground">Time</span><span className="font-mono">{formatTz(e.timestamp, "yyyy-MM-dd HH:mm:ss zzz", timezone)}</span>
                                {e.sourceIp && <><span className="text-muted-foreground">Source IP</span><span className="font-mono flex items-center gap-1">{e.sourceIp}<button onClick={() => copyIoc(e.sourceIp!)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button></span></>}
                                {e.host && <><span className="text-muted-foreground">Host</span><span>{e.host}</span></>}
                                {e.user && <><span className="text-muted-foreground">User</span><span>{e.user}</span></>}
                                {e.ruser && <><span className="text-muted-foreground">Remote User</span><span>{e.ruser}</span></>}
                                {e.service && <><span className="text-muted-foreground">Service</span><span>{e.service}</span></>}
                                {e.authMethod && <><span className="text-muted-foreground">Auth Method</span><span>{e.authMethod}</span></>}
                                {e.ua && <><span className="text-muted-foreground">User Agent</span><span className="break-all">{e.ua}</span></>}
                                {e.geoCountry && <><span className="text-muted-foreground">Location</span><span>{[e.geoCity, e.geoCountry].filter(Boolean).join(", ")}</span></>}
                                {(e.riskScore ?? 0) > 0 && <><span className="text-muted-foreground">Risk Score</span><span className="text-orange-400 font-medium">{e.riskScore}/100</span></>}
                                {!!e.metadata && <><span className="text-muted-foreground">Metadata</span><pre className="font-mono text-[10px] bg-muted rounded p-1 overflow-x-auto">{String(JSON.stringify(e.metadata, null, 2))}</pre></>}
                              </div>
                              <div className="flex gap-1 mt-2">
                                {e.sourceIp && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setIocs([...new Set([...iocs, e.sourceIp!])]); }}>Hunt this IP</Button>}
                                {e.user && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setIocs([...new Set([...iocs, e.user!])]); }}>Hunt this user</Button>}
                                {e.host && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setIocs([...new Set([...iocs, e.host!])]); }}>Hunt this host</Button>}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar: saved queries + presets */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FolderOpen className="h-4 w-4" />Quick Hunts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {PRESETS.map((p) => (
                  <button key={p.name} onClick={() => loadQuery(p.query)} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 transition-colors flex items-center gap-2">
                    <Crosshair className="h-3 w-3 text-muted-foreground shrink-0" />{p.name}
                  </button>
                ))}
              </CardContent>
            </Card>

            {saved.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Save className="h-4 w-4" />Saved Queries</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {saved.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <button onClick={() => loadQuery(s.query)} className="flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 transition-colors truncate">
                        {s.name}
                      </button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => deleteQuery(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Hunt tips */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hunt Tips</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1.5">
                <p>• Enter IPs, usernames, or hostnames as IOCs to search across all fields</p>
                <p>• Add conditions to filter by specific fields with operators</p>
                <p>• Use risk threshold to find anomalous events</p>
                <p>• Click &quot;Hunt this IP/user/host&quot; in results to pivot</p>
                <p>• Save queries for recurring hunts</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
