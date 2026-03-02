import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Globe, Monitor, Clock, Users, CalendarDays, ShieldAlert } from "lucide-react";
import type { Stats } from "@/lib/types";

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
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">{c.title}</CardTitle>
            <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums">
              {loading ? "—" : (c.value ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
