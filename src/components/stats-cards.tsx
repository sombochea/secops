import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Globe, Monitor, Clock } from "lucide-react";

interface Stats {
  total: number;
  uniqueHosts: number;
  uniqueIps: number;
  last24h: number;
}

export function StatsCards({ stats, loading }: { stats?: Stats; loading: boolean }) {
  const cards = [
    { title: "Total Events", value: stats?.total ?? 0, icon: Activity, color: "text-blue-500" },
    { title: "Last 24h", value: stats?.last24h ?? 0, icon: Clock, color: "text-green-500" },
    { title: "Unique Hosts", value: stats?.uniqueHosts ?? 0, icon: Monitor, color: "text-orange-500" },
    { title: "Unique IPs", value: stats?.uniqueIps ?? 0, icon: Globe, color: "text-purple-500" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "—" : c.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
