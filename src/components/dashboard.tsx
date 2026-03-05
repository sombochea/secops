"use client";

import useSWR, { mutate } from "swr";
import { useCallback, useMemo, useState } from "react";
import { StatsCards } from "@/components/stats-cards";
import { EventsTable } from "@/components/events-table";
import { EventFilters, type Filters } from "@/components/event-filters";
import { DashboardHeader } from "@/components/dashboard-header";
import { EventCharts } from "@/components/event-charts";
import { EventDetailSheet } from "@/components/event-detail-sheet";
import { ActivityTimeline, rangeToParams, type TimelineRangeValue } from "@/components/activity-timeline";
import { RiskSources } from "@/components/risk-sources";
import { ThreatMap } from "@/components/threat-map";
import { AboutDialog } from "@/components/about-dialog";
import { BUILD_INFO } from "@/lib/build-info";
import type { SecurityEvent } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Dashboard({ userName }: { userName: string }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [timelineRange, setTimelineRange] = useState<TimelineRangeValue>({ key: "24h" });
  const [dateParams, setDateParams] = useState(() => rangeToParams({ key: "24h" }));

  const handleRangeChange = useCallback((r: TimelineRangeValue) => {
    setTimelineRange(r);
    setDateParams(rangeToParams(r));
  }, []);

  // Events list params (filters + pagination)
  const eventsParams = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.q) eventsParams.set("q", filters.q);
  if (filters.event) eventsParams.set("event", filters.event);
  if (filters.host) eventsParams.set("host", filters.host);
  if (filters.source_ip) eventsParams.set("source_ip", filters.source_ip);
  if (filters.user) eventsParams.set("user", filters.user);
  if (filters.service) eventsParams.set("service", filters.service);
  if (filters.ua) eventsParams.set("ua", filters.ua);
  if (dateParams.from) eventsParams.set("from", dateParams.from);
  if (dateParams.to) eventsParams.set("to", dateParams.to);

  const eventsUrl = useMemo(() => `/api/events?${eventsParams}`, [eventsParams.toString()]);

  // Stats params (only needs from/to for timeline)
  const statsParams = new URLSearchParams();
  if (dateParams.from) statsParams.set("from", dateParams.from);
  if (dateParams.to) statsParams.set("to", dateParams.to);
  const statsUrl = useMemo(() => `/api/events/stats?${statsParams}`, [statsParams.toString()]);

  // Parallel fetches: events (live) + stats (cached, fast)
  const { data: eventsData, isLoading: eventsLoading } = useSWR(eventsUrl, fetcher, {
    refreshInterval: 10000,
    keepPreviousData: true,
  });
  const { data: statsData, isLoading: statsLoading } = useSWR(statsUrl, fetcher, {
    refreshInterval: 15000,
    keepPreviousData: true,
  });

  const isLoading = eventsLoading && !eventsData;

  const handleFilterChange = useCallback((f: Filters) => {
    setFilters(f);
    setPage(1);
  }, []);

  const handleChartClick = useCallback(
    (key: string, value: string) => {
      handleFilterChange({ ...filters, [key]: value });
    },
    [filters, handleFilterChange]
  );

  const handleWhitelist = useCallback(async (ip: string) => {
    await fetch("/api/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });
    mutate(eventsUrl);
    mutate(statsUrl);
  }, [eventsUrl, statsUrl]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 space-y-6 sm:px-6">
        <StatsCards stats={statsData?.stats} loading={statsLoading && !statsData} />
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <ActivityTimeline
            data={statsData?.timeline}
            loading={statsLoading && !statsData}
            range={timelineRange}
            onRangeChange={handleRangeChange}
          />
          <RiskSources
            sources={statsData?.riskSources}
            loading={statsLoading && !statsData}
            total={statsData?.riskTotal}
            onSourceClick={(ip) => handleFilterChange({ ...filters, source_ip: ip })}
            onWhitelist={handleWhitelist}
            whitelistedIps={statsData?.whitelistedIps}
          />
        </div>
        <EventCharts aggregations={statsData?.aggregations} loading={statsLoading && !statsData} onSegmentClick={handleChartClick} />
        <ThreatMap points={statsData?.geoPoints ?? []} loading={statsLoading && !statsData} />
        <EventFilters filters={filters} onChange={handleFilterChange} eventTypes={statsData?.eventTypes ?? []} />
        <EventsTable
          events={eventsData?.events ?? []}
          loading={isLoading}
          page={page}
          total={eventsData?.total ?? 0}
          totalPages={eventsData?.totalPages ?? 0}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
          onEventClick={setSelectedEvent}
        />
      </main>
      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground">
          SecOps {BUILD_INFO.versionLabel} · Built by{" "}
          <button className="text-primary hover:underline" onClick={() => setAboutOpen(true)}>
            Sambo Chea
          </button>
        </p>
      </footer>
      <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
