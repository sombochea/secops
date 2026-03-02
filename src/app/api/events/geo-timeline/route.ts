import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const THREAT = sql.raw(`(e.status = 'failed' OR e.auth_method = 'invalid_user' OR e.event = 'ssh_attempt' OR e.status = 'suspicious')`);

// Returns geo points grouped by time bucket for map timeline animation
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const hours = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("hours") ?? "24"), 1), 720);
  const buckets = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("buckets") ?? "12"), 4), 48);
  const intervalMin = Math.round((hours * 60) / buckets);
  const orgFilter = sql.raw(`e.organization_id = '${orgId}'`);

  const rows = await db.execute<{
    bucket: string;
    lat: number;
    lon: number;
    country: string;
    city: string;
    count: number;
    threats: number;
  }>(sql`
    SELECT
      to_char(
        date_trunc('minute', e.timestamp) - (extract(minute from e.timestamp)::int % ${intervalMin} || ' minutes')::interval,
        'YYYY-MM-DD"T"HH24:MI:SS'
      ) as bucket,
      e.geo_lat as lat,
      e.geo_lon as lon,
      e.geo_country as country,
      coalesce(e.geo_city, '') as city,
      count(*)::int as count,
      count(*) filter (where ${THREAT})::int as threats
    FROM "security_event" e
    WHERE ${orgFilter}
      AND e.geo_lat IS NOT NULL
      AND e.timestamp >= now() - ${hours + ' hours'}::interval
    GROUP BY bucket, e.geo_lat, e.geo_lon, e.geo_country, e.geo_city
    ORDER BY bucket
  `);

  // Group by bucket
  const frames: Record<string, { lat: number; lon: number; country: string; city: string; count: number; threats: number }[]> = {};
  for (const r of (rows ?? []) as any[]) {
    (frames[r.bucket] ??= []).push({ lat: r.lat, lon: r.lon, country: r.country, city: r.city, count: r.count, threats: r.threats });
  }

  // Return ordered array of frames
  const sorted = Object.keys(frames).sort();
  return NextResponse.json({
    hours,
    buckets: sorted.length,
    frames: sorted.map((k) => ({ time: k, points: frames[k] })),
  });
}
