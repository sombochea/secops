"use client";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Clock,
  Server,
  User,
  Globe,
  Terminal,
  Key,
  Monitor,
  Hash,
} from "lucide-react";
import type { SecurityEvent } from "@/lib/types";

interface Props {
  event: SecurityEvent | null;
  onClose: () => void;
}

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  const s = status.toLowerCase();
  if (s === "failed" || s === "error" || s === "denied") return <XCircle className="h-4 w-4 text-red-500" />;
  if (s === "closed" || s === "success" || s === "accepted") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
}

function isThreat(event: SecurityEvent): boolean {
  return event.status === "failed" || event.authMethod === "invalid_user" || event.event === "ssh_attempt";
}

function Field({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-sm break-all ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
      </div>
    </div>
  );
}

export function EventDetailSheet({ event, onClose }: Props) {
  return (
    <Sheet open={!!event} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        {event && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <StatusIcon status={event.status} />
                <SheetTitle className="text-base">{event.event}</SheetTitle>
                {isThreat(event) && (
                  <Badge variant="destructive" className="text-[10px] ml-auto">THREAT</Badge>
                )}
              </div>
              <SheetDescription className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {format(new Date(event.timestamp), "PPpp")}
              </SheetDescription>
            </SheetHeader>

            <Separator />

            <div className="px-6 py-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-3 pb-1">
                Connection Details
              </p>
              <Field icon={Server} label="Host" value={event.host} mono />
              <Separator />
              <Field icon={User} label="User" value={event.user} />
              <Separator />
              <Field icon={User} label="Remote User" value={event.ruser} />
              <Separator />
              <Field icon={Globe} label="Source IP" value={event.sourceIp} mono />

              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-5 pb-1">
                Service Info
              </p>
              <Field icon={Terminal} label="Service" value={event.service} />
              <Separator />
              <Field icon={Monitor} label="TTY" value={event.tty} mono />
              <Separator />
              <Field icon={Key} label="PAM Type" value={event.pamType} />
              <Separator />
              <Field icon={Key} label="Auth Method" value={event.authMethod} />

              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-5 pb-1">
                Status
              </p>
              <div className="flex items-center gap-2 py-3">
                <StatusIcon status={event.status} />
                <span className="text-sm">{event.status || "—"}</span>
              </div>

              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-5 pb-1">
                Identifiers
              </p>
              <Field icon={Hash} label="Event ID" value={event.id} mono />
              <Separator />
              <Field icon={Clock} label="Received At" value={event.receivedAt ? format(new Date(event.receivedAt), "PPpp") : null} />

              {event.metadata != null && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-5 pb-2">
                    Metadata
                  </p>
                  <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </>
              )}
            </div>

            <div className="h-6" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
