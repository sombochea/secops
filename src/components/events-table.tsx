import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SecurityEvent {
  id: string;
  event: string;
  status: string | null;
  host: string | null;
  user: string | null;
  sourceIp: string | null;
  service: string | null;
  pamType: string | null;
  timestamp: string;
}

interface Props {
  events: SecurityEvent[];
  loading: boolean;
  page: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
}

function eventBadgeVariant(event: string): "default" | "secondary" | "destructive" | "outline" {
  if (event.includes("fail") || event.includes("invalid")) return "destructive";
  if (event.includes("close") || event.includes("disconnect")) return "secondary";
  if (event.includes("open") || event.includes("accept")) return "default";
  return "outline";
}

export function EventsTable({ events, loading, page, total, limit, onPageChange }: Props) {
  const totalPages = Math.ceil(total / limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Security Events
        </CardTitle>
        <span className="text-xs text-muted-foreground">{total} total</span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No events found
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge variant={eventBadgeVariant(e.event)} className="font-mono text-xs">
                        {e.event}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.host ?? "—"}</TableCell>
                    <TableCell>{e.user ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.sourceIp ?? "—"}</TableCell>
                    <TableCell>{e.service ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {e.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
