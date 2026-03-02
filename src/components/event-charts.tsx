"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Aggregations, AggregationItem } from "@/lib/types";

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(160, 60%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(350, 65%, 55%)",
  "hsl(190, 70%, 50%)",
  "hsl(45, 85%, 55%)",
  "hsl(260, 55%, 50%)",
  "hsl(15, 75%, 55%)",
  "hsl(140, 50%, 45%)",
];

interface Props {
  aggregations?: Aggregations;
  loading: boolean;
  onSegmentClick: (filterKey: string, value: string) => void;
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-muted-foreground text-sm">
      {loading ? "Loading..." : "No data"}
    </div>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { name: string; count: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground">{d.count.toLocaleString()} events</p>
    </div>
  );
}

function MiniBarChart({
  title,
  data,
  filterKey,
  onSegmentClick,
}: {
  title: string;
  data: AggregationItem[];
  filterKey: string;
  onSegmentClick: (key: string, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data.length ? (
          <EmptyState loading={false} />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={120}
                tickFormatter={(v: string) => (v?.length > 18 ? v.slice(0, 18) + "…" : v ?? "—")}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: AggregationItem) => d.name && onSegmentClick(filterKey, d.name)}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function MiniPieChart({
  title,
  data,
  filterKey,
  onSegmentClick,
}: {
  title: string;
  data: AggregationItem[];
  filterKey: string;
  onSegmentClick: (key: string, value: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data.length ? (
          <EmptyState loading={false} />
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  cursor="pointer"
                  onClick={(d: AggregationItem) => d.name && onSegmentClick(filterKey, d.name)}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5 overflow-hidden">
              {data.slice(0, 6).map((d, i) => (
                <button
                  key={d.name}
                  className="flex w-full items-center gap-2 text-left text-xs hover:bg-muted/50 rounded px-1.5 py-0.5 transition-colors"
                  onClick={() => d.name && onSegmentClick(filterKey, d.name)}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate flex-1">{d.name ?? "—"}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {total ? Math.round((d.count / total) * 100) : 0}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EventCharts({ aggregations, loading, onSegmentClick }: Props) {
  if (loading && !aggregations) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            </CardHeader>
            <CardContent>
              <EmptyState loading />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { byType = [], byHost = [], byIp = [], byService = [], byUser = [], byAuthMethod = [] } = aggregations ?? {};

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <MiniPieChart title="Events by Type" data={byType} filterKey="event" onSegmentClick={onSegmentClick} />
      <MiniBarChart title="Top Hosts" data={byHost} filterKey="host" onSegmentClick={onSegmentClick} />
      <MiniBarChart title="Top Users" data={byUser} filterKey="user" onSegmentClick={onSegmentClick} />
      <MiniPieChart title="Auth Methods" data={byAuthMethod} filterKey="auth_method" onSegmentClick={onSegmentClick} />
      <MiniPieChart title="Top Source IPs" data={byIp} filterKey="source_ip" onSegmentClick={onSegmentClick} />
      <MiniBarChart title="Top Services" data={byService} filterKey="service" onSegmentClick={onSegmentClick} />
    </div>
  );
}
