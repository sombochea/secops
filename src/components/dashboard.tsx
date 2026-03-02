"use client";

import useSWR from "swr";
import { useCallback, useState } from "react";
import { StatsCards } from "@/components/stats-cards";
import { EventsTable } from "@/components/events-table";
import { EventFilters, type Filters } from "@/components/event-filters";
import { DashboardHeader } from "@/components/dashboard-header";
import { EventCharts } from "@/components/event-charts";
import { EventDetailSheet } from "@/components/event-detail-sheet";
import { ActivityTimeline } from "@/components/activity-timeline";
import { RiskSources } from "@/components/risk-sources";
import { AboutDialog } from "@/components/about-dialog";
import type { SecurityEvent } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Dashboard({ userName }: { userName: string }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.q) params.set("q", filters.q);
  if (filters.event) params.set("event", filters.event);
  if (filters.host) params.set("host", filters.host);
  if (filters.source_ip) params.set("source_ip", filters.source_ip);
  if (filters.user) params.set("user", filters.user);
  if (filters.service) params.set("service", filters.service);

  const { data, isLoading } = useSWR(`/api/events?${params}`, fetcher, {
    refreshInterval: 10000,
    keepPreviousData: true,
  });

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 space-y-6 sm:px-6">
        <StatsCards stats={data?.stats} loading={isLoading} />
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <ActivityTimeline data={data?.timeline} loading={isLoading} />
          <RiskSources
            sources={data?.riskSources}
            loading={isLoading}
            onSourceClick={(ip) => handleFilterChange({ ...filters, source_ip: ip })}
          />
        </div>
        <EventCharts aggregations={data?.aggregations} loading={isLoading} onSegmentClick={handleChartClick} />
        <EventFilters
          filters={filters}
          onChange={handleFilterChange}
          eventTypes={data?.eventTypes ?? []}
        />
        <EventsTable
          events={data?.events ?? []}
          loading={isLoading}
          page={page}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 0}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
          onEventClick={setSelectedEvent}
        />
      </main>
      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground">
          Built by{" "}
          <button
            className="text-primary hover:underline"
            onClick={() => setAboutOpen(true)}
          >
            Sambo Chea
          </button>
        </p>
      </footer>
      <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
