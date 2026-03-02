"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardHeader } from "@/components/dashboard-header";
import {
  Search,
  Clock,
  Server,
  User,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ArrowRight,
  Shield,
  Key,
  Terminal,
  Monitor,
  Crosshair,
} from "lucide-react";
import type { SecurityEvent } from "@/lib/types";
import { useTimezone } from "@/lib/timezone-context";
import { formatTz, formatRelative } from "@/lib/format-date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isThreat(e: SecurityEvent) {
  return e.status === "failed" || e.authMethod === "invalid_user" || e.event === "ssh_attempt" || e.status === "suspicious";
}

function StatusDot({ event }: { event: SecurityEvent }) {
  const threat = isThreat(event);
  return (
    <div className={`h-3 w-3 rounded-full shrink-0 ${threat ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "bg-emerald-500"}`} />
  );
}

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  const s = status.toLowerCase();
  if (s === "failed" || s === "error" || s === "denied" || s === "suspicious") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (s === "closed" || s === "success" || s === "accepted") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
}

// Search for events to pick a pivot
function EventSearch({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = useSWR(q.length >= 2 ? `/api/events?q=${encodeURIComponent(q)}&limit=10` : null, fetcher);

  const { timezone } = useTimezone();

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search events by IP, host, user, service..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      {data?.events?.length > 0 && (
        <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
          {data.events.map((e: SecurityEvent) => (
            <button
              key={e.id}
              onClick={() => { onSelect(e.id); setQ(""); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-3 text-sm"
            >
              <StatusDot event={e} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{e.event}</span>
                  {e.status && <Badge variant="outline" className="text-[10px] px-1 py-0">{e.status}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[e.sourceIp, e.host, e.user].filter(Boolean).join(" · ")} · {formatRelative(e.timestamp)}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Correlation badges showing why an event is related
function CorrelationBadges({ event, pivot }: { event: SecurityEvent; pivot: SecurityEvent }) {
  const matches = [];
  if (pivot.sourceIp && event.sourceIp === pivot.sourceIp) matches.push({ label: "IP", icon: Globe });
  if (pivot.host && event.host === pivot.host) matches.push({ label: "Host", icon: Server });
  if (pivot.user && event.user === pivot.user) matches.push({ label: "User", icon: User });
  return (
    <div className="flex gap-1">
      {matches.map((m) => (
        <Badge key={m.label} variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
          <m.icon className="h-2.5 w-2.5" />{m.label}
        </Badge>
      ))}
    </div>
  );
}

// Single timeline event row
function TimelineEvent({ event, pivot, timezone, isPivot }: { event: SecurityEvent; pivot: SecurityEvent; timezone: string; isPivot: boolean }) {
  const threat = isThreat(event);

  return (
    <div className={`relative flex gap-3 ${isPivot ? "py-3" : "py-2"}`}>
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center shrink-0 w-6">
        <div className="flex-1 w-px bg-border" />
        <div className={`shrink-0 rounded-full border-2 ${
          isPivot ? "h-5 w-5 border-red-500 bg-red-500/20" :
          threat ? "h-3 w-3 border-red-500 bg-red-500/30" :
          "h-3 w-3 border-emerald-500 bg-emerald-500/30"
        }`}>
          {isPivot && <Crosshair className="h-3 w-3 text-red-500 m-[1px]" />}
        </div>
        <div className="flex-1 w-px bg-border" />
      </div>

      {/* Content */}
      <Popover>
        <PopoverTrigger asChild>
          <button className={`flex-1 text-left rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors ${
            isPivot ? "border-red-500/50 bg-red-500/5" : "border-border"
          }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <StatusIcon status={event.status} />
                <span className="font-mono text-xs font-medium">{event.event}</span>
                {event.status && <Badge variant={threat ? "destructive" : "secondary"} className="text-[10px] px-1 py-0">{event.status}</Badge>}
                {isPivot && <Badge className="text-[10px] px-1 py-0 bg-red-500">PIVOT</Badge>}
                {(event.riskScore ?? 0) > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-400 border-orange-400/50">
                    Risk {event.riskScore}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatTz(event.timestamp, "HH:mm:ss", timezone)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {event.sourceIp && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{event.sourceIp}</span>}
              {event.host && <span className="flex items-center gap-1"><Server className="h-3 w-3" />{event.host}</span>}
              {event.user && <span className="flex items-center gap-1"><User className="h-3 w-3" />{event.user}</span>}
              {event.service && <span className="flex items-center gap-1"><Terminal className="h-3 w-3" />{event.service}</span>}
            </div>
            <div className="mt-1">
              <CorrelationBadges event={event} pivot={pivot} />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-80 text-xs space-y-2">
          <div className="font-medium text-sm flex items-center gap-2">
            {event.event}
            {threat && <Badge variant="destructive" className="text-[10px]">THREAT</Badge>}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">Time</span>
            <span className="font-mono">{formatTz(event.timestamp, "yyyy-MM-dd HH:mm:ss zzz", timezone)}</span>
            {event.status && <><span className="text-muted-foreground">Status</span><span>{event.status}</span></>}
            {event.sourceIp && <><span className="text-muted-foreground">Source IP</span><span className="font-mono">{event.sourceIp}</span></>}
            {event.host && <><span className="text-muted-foreground">Host</span><span>{event.host}</span></>}
            {event.user && <><span className="text-muted-foreground">User</span><span>{event.user}</span></>}
            {event.ruser && <><span className="text-muted-foreground">Remote User</span><span>{event.ruser}</span></>}
            {event.service && <><span className="text-muted-foreground">Service</span><span>{event.service}</span></>}
            {event.authMethod && <><span className="text-muted-foreground">Auth</span><span>{event.authMethod}</span></>}
            {event.ua && <><span className="text-muted-foreground">UA</span><span className="truncate">{event.ua}</span></>}
            {event.geoCountry && <><span className="text-muted-foreground">Location</span><span>{[event.geoCity, event.geoCountry].filter(Boolean).join(", ")}</span></>}
            {(event.riskScore ?? 0) > 0 && <><span className="text-muted-foreground">Risk Score</span><span className="text-orange-400 font-medium">{event.riskScore}/100</span></>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function IncidentTimeline({ userName }: { userName: string }) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [window, setWindow] = useState("30");
  const { timezone } = useTimezone();

  const { data, isLoading } = useSWR(
    eventId ? `/api/events/timeline?id=${eventId}&window=${window}` : null,
    fetcher,
  );

  const pivot: SecurityEvent | null = data?.pivot ?? null;
  const events: SecurityEvent[] = data?.events ?? [];
  const summary = data?.summary;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => {}} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 space-y-6 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />Incident Timeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Select an event to see the sequence of related events before and after it
          </p>
        </div>

        {/* Search + controls */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <EventSearch onSelect={setEventId} />
            {eventId && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Time window:</span>
                <Select value={window} onValueChange={setWindow}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">± 5 min</SelectItem>
                    <SelectItem value="15">± 15 min</SelectItem>
                    <SelectItem value="30">± 30 min</SelectItem>
                    <SelectItem value="60">± 1 hour</SelectItem>
                    <SelectItem value="360">± 6 hours</SelectItem>
                    <SelectItem value="1440">± 24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary cards */}
        {pivot && summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-3 pb-3">
                <div className="text-2xl font-bold">{events.length}</div>
                <div className="text-xs text-muted-foreground">Related Events</div>
              </CardContent>
            </Card>
            {pivot.sourceIp && (
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-mono">{pivot.sourceIp}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{summary.byIp} events from this IP</div>
                </CardContent>
              </Card>
            )}
            {pivot.host && (
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5">
                    <Server className="h-4 w-4 text-purple-400" />
                    <span className="text-sm truncate">{pivot.host}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{summary.byHost} events on this host</div>
                </CardContent>
              </Card>
            )}
            {pivot.user && (
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-amber-400" />
                    <span className="text-sm">{pivot.user}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{summary.byUser} events by this user</div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Timeline */}
        {isLoading && eventId && (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading timeline...</div>
        )}

        {pivot && events.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Event Sequence — {formatTz(events[events.length - 1].timestamp, "MMM d, HH:mm", timezone)} → {formatTz(events[0].timestamp, "MMM d, HH:mm", timezone)}</span>
                <Badge variant="outline" className="text-xs">{events.length} events</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="relative">
                {events.map((e) => (
                  <TimelineEvent
                    key={e.id}
                    event={e}
                    pivot={pivot}
                    timezone={timezone}
                    isPivot={e.id === pivot.id}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!eventId && !isLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Search for an event above to investigate its incident timeline</p>
          </div>
        )}
      </main>
    </div>
  );
}
