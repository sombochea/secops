"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
} from "lucide-react";
import type { SecurityEvent } from "@/lib/types";

interface Props {
  events: SecurityEvent[];
  loading: boolean;
  page: number;
  total: number;
  totalPages: number;
  limit: number;
  onPageChange: (p: number) => void;
  onLimitChange: (l: number) => void;
  onEventClick: (e: SecurityEvent) => void;
}

function eventBadgeVariant(event: string): "default" | "secondary" | "destructive" | "outline" {
  if (event.includes("fail") || event.includes("invalid") || event.includes("attempt")) return "destructive";
  if (event.includes("close") || event.includes("disconnect")) return "secondary";
  if (event.includes("open") || event.includes("accept") || event.includes("success")) return "default";
  return "outline";
}

function StatusIcon({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  let icon: React.ReactNode;
  let color: string;
  if (s === "failed" || s === "error" || s === "denied") {
    icon = <XCircle className="h-4 w-4" />;
    color = "text-red-500";
  } else if (s === "closed" || s === "success" || s === "accepted") {
    icon = <CheckCircle2 className="h-4 w-4" />;
    color = "text-emerald-500";
  } else if (s) {
    icon = <AlertTriangle className="h-4 w-4" />;
    color = "text-yellow-500";
  } else {
    icon = <MinusCircle className="h-4 w-4" />;
    color = "text-muted-foreground";
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex ${color}`}>{icon}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{status || "Unknown"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EventsTable({
  events,
  loading,
  page,
  total,
  totalPages,
  limit,
  onPageChange,
  onLimitChange,
  onEventClick,
}: Props) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Security Events
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
          <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead>Event</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !events.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading events...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No events found
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => onEventClick(e)}
                  >
                    <TableCell className="pr-0">
                      <StatusIcon status={e.status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={eventBadgeVariant(e.event)} className="font-mono text-xs">
                        {e.event}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[180px] truncate">
                      {e.host ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{e.user ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.sourceIp ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.service ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2 px-4">
          {loading && !events.length ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Loading events...</p>
          ) : events.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">No events found</p>
          ) : (
            events.map((e) => (
              <button
                key={e.id}
                className="w-full text-left rounded-lg border p-3 space-y-2 hover:bg-muted/50 transition-colors"
                onClick={() => onEventClick(e)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={e.status} />
                    <Badge variant={eventBadgeVariant(e.event)} className="font-mono text-xs">
                      {e.event}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Host</span>
                  <span className="font-mono truncate">{e.host ?? "—"}</span>
                  <span className="text-muted-foreground">User</span>
                  <span className="truncate">{e.user ?? "—"}</span>
                  <span className="text-muted-foreground">Source IP</span>
                  <span className="font-mono">{e.sourceIp ?? "—"}</span>
                  <span className="text-muted-foreground">Service</span>
                  <span>{e.service ?? "—"}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 px-4 sm:px-0">
          <span className="text-xs text-muted-foreground">
            {total > 0 ? `Showing ${from}–${to} of ${total.toLocaleString()}` : "No results"}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(1)} disabled={page <= 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-xs tabular-nums text-muted-foreground">
              {page} / {totalPages || 1}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
