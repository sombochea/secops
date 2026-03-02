"use client";

import useSWR from "swr";
import { useState } from "react";
import { StatsCards } from "@/components/stats-cards";
import { EventsTable } from "@/components/events-table";
import { EventFilters } from "@/components/event-filters";
import { DashboardHeader } from "@/components/dashboard-header";
import { EventChart } from "@/components/event-chart";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Dashboard({ userName }: { userName: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) params.set("q", search);
  if (eventType) params.set("event", eventType);

  const { data, isLoading } = useSWR(`/api/events?${params}`, fetcher, {
    refreshInterval: 10000,
  });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={userName} />
      <main className="mx-auto max-w-7xl p-6 space-y-6">
        <StatsCards stats={data?.stats} loading={isLoading} />
        <EventChart events={data?.events} loading={isLoading} />
        <EventFilters
          search={search}
          onSearchChange={setSearch}
          eventType={eventType}
          onEventTypeChange={setEventType}
          eventTypes={data?.eventTypes ?? []}
        />
        <EventsTable
          events={data?.events ?? []}
          loading={isLoading}
          page={page}
          total={data?.total ?? 0}
          limit={20}
          onPageChange={setPage}
        />
      </main>
    </div>
  );
}
