import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNow } from "date-fns";

export function formatTz(date: string | Date, fmt: string, tz: string): string {
  return formatInTimeZone(typeof date === "string" ? new Date(date) : date, tz, fmt);
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(typeof date === "string" ? new Date(date) : date, { addSuffix: true });
}
