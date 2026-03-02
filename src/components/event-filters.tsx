import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  eventType: string;
  onEventTypeChange: (v: string) => void;
  eventTypes: string[];
}

export function EventFilters({ search, onSearchChange, eventType, onEventTypeChange, eventTypes }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search host, user, or IP..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={eventType} onValueChange={(v) => onEventTypeChange(v === "all" ? "" : v)}>
        <SelectTrigger className="w-full sm:w-[220px]">
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
  );
}
