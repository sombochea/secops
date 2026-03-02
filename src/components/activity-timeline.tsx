"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays, subHours, startOfDay, endOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { TimelinePoint } from "@/lib/types";
import type { DateRange as CalendarDateRange } from "react-day-picker";
import { useTimezone } from "@/lib/timezone-context";
import { formatTz } from "@/lib/format-date";

export type TimelineRange = "24h" | "7d" | "14d" | "30d" | "custom";

export interface TimelineRangeValue {
  key: TimelineRange;
  from?: string;
  to?: string;
}

interface Props {
  data?: TimelinePoint[];
  loading: boolean;
  range: TimelineRangeValue;
  onRangeChange: (r: TimelineRangeValue) => void;
}

const PRESETS: { key: TimelineRange; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "14d", label: "14d" },
  { key: "30d", label: "30d" },
];

export function rangeToParams(r: TimelineRangeValue): { from?: string; to?: string } {
  if (r.key === "custom" && r.from && r.to) return { from: r.from, to: r.to };
  const now = new Date();
  const map: Record<string, () => Date> = {
    "24h": () => subHours(now, 24),
    "7d": () => subDays(now, 7),
    "14d": () => subDays(now, 14),
    "30d": () => subDays(now, 30),
  };
  const fn = map[r.key];
  if (!fn) return {};
  return { from: fn().toISOString(), to: now.toISOString() };
}

function formatTick(v: string, range: TimelineRange, tz: string) {
  if (range === "24h") return formatTz(v, "HH:mm", tz);
  return formatTz(v, "MMM d", tz);
}

function formatTooltipLabel(v: string, range: TimelineRange, tz: string) {
  if (range === "24h") return formatTz(v, "MMM d, HH:mm", tz);
  return formatTz(v, "MMM d, yyyy", tz);
}

function CustomTooltip({ active, payload, label, range, tz }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string; range: TimelineRange; tz: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 text-sm shadow-md space-y-1">
      <p className="font-medium">{formatTooltipLabel(label, range, tz)}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground capitalize">{p.dataKey}:</span>
          <span className="font-medium tabular-nums">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityTimeline({ data, loading, range, onRangeChange }: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const [calRange, setCalRange] = useState<CalendarDateRange | undefined>();
  const { timezone } = useTimezone();

  const applyCustomRange = () => {
    if (calRange?.from && calRange?.to) {
      onRangeChange({
        key: "custom",
        from: startOfDay(calRange.from).toISOString(),
        to: endOfDay(calRange.to).toISOString(),
      });
      setCalOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Event Activity
          </CardTitle>
          <div className="flex items-center gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                variant={range.key === p.key ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => onRangeChange({ key: p.key })}
              >
                {p.label}
              </Button>
            ))}
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={range.key === "custom" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {range.key === "custom" && range.from && range.to
                    ? `${format(new Date(range.from), "MMM d")} – ${format(new Date(range.to), "MMM d")}`
                    : "Custom"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={calRange}
                  onSelect={setCalRange}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                />
                <div className="flex justify-end gap-2 p-3 pt-0">
                  <Button variant="ghost" size="sm" onClick={() => setCalOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={!calRange?.from || !calRange?.to} onClick={applyCustomRange}>
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data?.length ? (
          <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : !data?.length ? (
          <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">
            No activity data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradThreats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: string) => formatTick(v, range.key, timezone)}
              />
              <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip range={range.key} tz={timezone} />} />
              <Area type="monotone" dataKey="total" stroke="hsl(221, 83%, 53%)" strokeWidth={2} fill="url(#gradTotal)" />
              <Area type="monotone" dataKey="threats" stroke="hsl(0, 72%, 51%)" strokeWidth={2} fill="url(#gradThreats)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center justify-center gap-6 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Total Events
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Threats
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
