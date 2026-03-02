"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";
import { useTimezone } from "@/lib/timezone-context";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Phnom_Penh",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function formatTzLabel(tz: string): string {
  try {
    const offset = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${tz.replace(/_/g, " ")} (${offset})`;
  } catch {
    return tz;
  }
}

export function TimezoneSettings() {
  const { timezone, setTimezone } = useTimezone();
  const detected = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  // Ensure current tz and detected tz are in the list
  const allTz = [...new Set([detected, timezone, ...COMMON_TIMEZONES])].sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Timezone
        </CardTitle>
        <CardDescription>
          All timestamps in the dashboard will be displayed in your selected timezone. Auto-detected: {detected}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allTz.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {formatTzLabel(tz)}
                {tz === detected ? " • detected" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
