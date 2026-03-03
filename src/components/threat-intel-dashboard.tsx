"use client";

import { useState } from "react";
import useSWR from "swr";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShieldAlert,
  Globe,
  Crosshair,
  Activity,
  Workflow,
  AlertTriangle,
  Clock,
  Target,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimezone } from "@/lib/timezone-context";
import { formatTz } from "@/lib/format-date";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

export function ThreatIntelDashboard({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hours, setHours] = useState("72");
  const { timezone: tz } = useTimezone();

  const { data, isLoading } = useSWR(`/api/threats?hours=${hours}`, fetcher, {
    refreshInterval: 30_000,
  });

  const summary = data?.summary ?? { total: 0, threats: 0, unique_ips: 0, unique_countries: 0 };
  const iocs: IOC[] = data?.iocs ?? [];
  const techniques: Technique[] = data?.techniques ?? [];
  const geography: Geo[] = data?.geography ?? [];
  const timeline: TimelinePt[] = data?.timeline ?? [];
  const recentThreats: RecentThreat[] = data?.recentThreats ?? [];
  const targets: TargetEntry[] = data?.targets ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 sm:px-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6" /> Threat Intelligence
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              IOCs, attack techniques, and emerging threat patterns
            </p>
          </div>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">Last 24h</SelectItem>
              <SelectItem value="72">Last 3 days</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
              <SelectItem value="720">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Events", value: summary.total, icon: Activity },
                { label: "Threat Events", value: summary.threats, icon: AlertTriangle },
                { label: "Threat IPs", value: summary.unique_ips, icon: Crosshair },
                { label: "Countries", value: summary.unique_countries, icon: Globe },
              ].map((s) => (
                <Card key={s.label}>
                  <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <s.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{(s.value ?? 0).toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Threat timeline */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Threat Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline}>
                      <XAxis
                        dataKey="bucket"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => {
                          const d = new Date(v);
                          return parseInt(hours) <= 48
                            ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : d.toLocaleDateString([], { month: "short", day: "numeric" });
                        }}
                        interval="preserveStartEnd"
                      />
                      <YAxis tick={{ fontSize: 10 }} width={40} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(v) => new Date(v).toLocaleString()}
                      />
                      <Area type="monotone" dataKey="total" stroke="hsl(221,83%,53%)" fill="hsl(221,83%,53%)" fillOpacity={0.1} name="Total" />
                      <Area type="monotone" dataKey="threats" stroke="hsl(350,65%,55%)" fill="hsl(350,65%,55%)" fillOpacity={0.2} name="Threats" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* IOCs table */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Crosshair className="h-4 w-4" /> Indicators of Compromise — Top Threat IPs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-auto scrollbar-thin max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IP Address</TableHead>
                          <TableHead className="text-right">Threats</TableHead>
                          <TableHead className="text-right">Risk</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead className="text-right">Hosts</TableHead>
                          <TableHead className="text-right">Users</TableHead>
                          <TableHead>Techniques</TableHead>
                          <TableHead>Last Seen</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {iocs.slice(0, 20).map((ioc) => (
                          <TableRow key={ioc.ip}>
                            <TableCell className="font-mono text-xs">{ioc.ip}</TableCell>
                            <TableCell className="text-right font-bold text-red-400">{ioc.threats}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className={cn("text-xs", ioc.maxRisk >= 80 ? SEV_COLORS.critical : ioc.maxRisk >= 50 ? SEV_COLORS.high : SEV_COLORS.medium)}>
                                {ioc.maxRisk}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{ioc.countries}</TableCell>
                            <TableCell className="text-right text-xs">{ioc.hosts}</TableCell>
                            <TableCell className="text-right text-xs">{ioc.users}</TableCell>
                            <TableCell className="text-xs max-w-[150px] truncate">{ioc.authMethods}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTz(ioc.lastSeen, "MM/dd HH:mm", tz)}</TableCell>
                            <TableCell>
                              <Link href={`/flowmap?ip=${ioc.ip}`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <Workflow className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {iocs.slice(0, 10).map((ioc) => (
                      <div key={ioc.ip} className="rounded-lg border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs">{ioc.ip}</span>
                          <Badge variant="outline" className={cn("text-xs", ioc.maxRisk >= 80 ? SEV_COLORS.critical : ioc.maxRisk >= 50 ? SEV_COLORS.high : SEV_COLORS.medium)}>
                            Risk {ioc.maxRisk}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{ioc.threats} threats · {ioc.countries}</span>
                          <Link href={`/flowmap?ip=${ioc.ip}`}>
                            <Workflow className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                  {iocs.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No threat IOCs in this time range.</p>}
                </CardContent>
              </Card>

              {/* Attack techniques */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" /> Attack Techniques (MITRE ATT&CK)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[350px] overflow-auto scrollbar-thin">
                    {techniques.map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-xs truncate">{t.technique}</p>
                          <p className="text-xs text-muted-foreground">{t.tactic}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={cn("text-xs", SEV_COLORS[t.severity])}>
                            {t.severity}
                          </Badge>
                          <span className="text-xs font-mono w-10 text-right">{t.count}</span>
                        </div>
                      </div>
                    ))}
                    {techniques.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">No techniques detected.</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Threat geography */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4" /> Threat Geography
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={geography.slice(0, 10)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="country" tick={{ fontSize: 10 }} width={60} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="count" fill="hsl(350,65%,55%)" radius={[0, 4, 4, 0]} name="Threats" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1 max-h-[120px] overflow-auto scrollbar-thin">
                    {geography.map((g) => (
                      <div key={g.country} className="flex items-center justify-between text-xs px-1">
                        <span>{g.country}</span>
                        <span className="text-muted-foreground">{g.count} events · {g.uniqueIps} IPs</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Most targeted */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Most Targeted
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-[350px] overflow-auto scrollbar-thin">
                    {targets.map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg border p-2.5">
                        <div className="min-w-0">
                          <span className="font-mono">{t.user}</span>
                          <span className="text-muted-foreground"> @ </span>
                          <span className="font-mono">{t.host}</span>
                        </div>
                        <span className="font-bold shrink-0">{t.count}</span>
                      </div>
                    ))}
                    {targets.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">No targets found.</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Recent threat events */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Recent Threat Events
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-[350px] overflow-auto scrollbar-thin">
                    {recentThreats.map((e) => (
                      <div key={e.id} className="rounded-lg border p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Badge variant="outline" className={cn("text-[10px] shrink-0", e.status === "suspicious" ? SEV_COLORS.critical : SEV_COLORS.high)}>
                              {e.status}
                            </Badge>
                            <span className="truncate">{e.event}</span>
                          </div>
                          <span className="text-muted-foreground shrink-0">{formatTz(e.timestamp, "MM/dd HH:mm", tz)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                          {e.sourceIp && <span className="font-mono">{e.sourceIp}</span>}
                          {e.user && <span>→ {e.user}</span>}
                          {e.host && <span>@ {e.host}</span>}
                          {e.geoCountry && <span>({e.geoCountry})</span>}
                        </div>
                      </div>
                    ))}
                    {recentThreats.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">No recent threats.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface IOC {
  ip: string; count: number; threats: number; countries: string;
  hosts: number; users: number; firstSeen: string; lastSeen: string;
  maxRisk: number; authMethods: string; events: string;
}
interface Technique {
  event: string; authMethod: string; status: string; count: number;
  technique: string; tactic: string; severity: string;
}
interface Geo { country: string; count: number; uniqueIps: number; }
interface TimelinePt { bucket: string; threats: number; total: number; }
interface RecentThreat {
  id: string; event: string; status: string; authMethod: string;
  sourceIp: string; host: string; user: string; service: string;
  geoCountry: string; riskScore: number; timestamp: string;
}
interface TargetEntry { host: string; user: string; count: number; }
