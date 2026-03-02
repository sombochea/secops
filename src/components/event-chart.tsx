"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

interface Event {
  event: string;
  timestamp: string;
}

export function EventChart({ events, loading }: { events?: Event[]; loading: boolean }) {
  const chartData = useMemo(() => {
    if (!events?.length) return [];
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.event] = (counts[e.event] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Events by Type (current page)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !chartData.length ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
            {loading ? "Loading..." : "No events"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
