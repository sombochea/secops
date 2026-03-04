import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Globe, Monitor, Clock, Users, CalendarDays, ShieldAlert } from "lucide-react";
import type { Stats } from "@/lib/types";

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

export function StatsCards({ stats, loading }: { stats?: Stats; loading: boolean }) {
  const cards = [
    { title: "Total Events", value: stats?.total, icon: Activity, color: "text-blue-500" },
    { title: "Threats", value: stats?.threats, icon: ShieldAlert, color: "text-red-500" },
    { title: "Last 24h", value: stats?.last24h, icon: Clock, color: "text-emerald-500" },
    { title: "Last 7 Days", value: stats?.last7d, icon: CalendarDays, color: "text-cyan-500" },
    { title: "Unique Hosts", value: stats?.uniqueHosts, icon: Monitor, color: "text-orange-500" },
    { title: "Unique IPs", value: stats?.uniqueIps, icon: Globe, color: "text-purple-500" },
    { title: "Unique Users", value: stats?.uniqueUsers, icon: Users, color: "text-pink-500" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map((c) => {
          const raw = c.value ?? 0;
          const compact = formatCompact(raw);
          const full = raw.toLocaleString();
          const needsHint = compact !== full;

          return (
            <Card key={c.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">{c.title}</CardTitle>
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-xl font-bold tabular-nums">—</div>
                ) : needsHint ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xl font-bold tabular-nums cursor-default">{compact}</div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="tabular-nums">{full}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="text-xl font-bold tabular-nums">{compact}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
