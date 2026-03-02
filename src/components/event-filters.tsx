"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";

export interface Filters {
  q?: string;
  event?: string;
  host?: string;
  source_ip?: string;
  user?: string;
  service?: string;
}

const FILTER_LABELS: Record<string, string> = {
  q: "Search",
  event: "Event",
  host: "Host",
  source_ip: "Source IP",
  user: "User",
  service: "Service",
};

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  eventTypes: string[];
}

export function EventFilters({ filters, onChange, eventTypes }: Props) {
  const activeFilters = Object.entries(filters).filter(([, v]) => v);

  const removeFilter = (key: string) => {
    const next = { ...filters };
    delete next[key as keyof Filters];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events, hosts, users, IPs..."
            value={filters.q ?? ""}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            className="pl-9"
          />
        </div>
        <Select
          value={filters.event ?? "all"}
          onValueChange={(v) => onChange({ ...filters, event: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {eventTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {activeFilters.map(([key, value]) => (
            <Badge key={key} variant="secondary" className="gap-1 pr-1 text-xs">
              <span className="text-muted-foreground">{FILTER_LABELS[key] ?? key}:</span>
              <span className="max-w-[120px] truncate">{value}</span>
              <button
                onClick={() => removeFilter(key)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                aria-label={`Remove ${key} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onChange({})}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
