import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNow } from "date-fns";

export function formatTz(date: string | Date, fmt: string, tz: string): string {
  const d = typeof date === "string" ? new Date(date.endsWith("Z") || date.includes("+") ? date : date + "Z") : date;
  return formatInTimeZone(d, tz, fmt);
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(typeof date === "string" ? new Date(date) : date, { addSuffix: true });
}
