import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const THREAT = sql.raw(`(e.status = 'failed' OR e.auth_method = 'invalid_user' OR e.event = 'ssh_attempt' OR e.status = 'suspicious')`);

// Returns stats + timeline + top attackers for "now" period and "then" (previous period of same length)
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const hours = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("hours") ?? "24"), 1), 720);
  const orgFilter = sql.raw(`e.organization_id = '${orgId}'`);

  // "now" = last N hours, "then" = the N hours before that
  const [stats, timeline, topIps] = await Promise.all([
    // Aggregate stats for both periods
    db.execute<{
      period: string; total: number; threats: number;
      unique_ips: number; unique_hosts: number; unique_users: number;
    }>(sql`
      SELECT
        CASE WHEN e.timestamp >= now() - ${hours + ' hours'}::interval AND e.timestamp < now() - ${hours * 2 + ' hours'}::interval THEN 'x' ELSE
          CASE WHEN e.timestamp >= now() - ${hours + ' hours'}::interval THEN 'now' ELSE 'then' END
        END as period,
        count(*)::int as total,
        count(*) filter (where ${THREAT})::int as threats,
        count(distinct e.source_ip)::int as unique_ips,
        count(distinct e.host)::int as unique_hosts,
        count(distinct e."user")::int as unique_users
      FROM "security_event" e
      WHERE ${orgFilter} AND e.timestamp >= now() - ${hours * 2 + ' hours'}::interval
      GROUP BY period
    `),
    // Hourly timeline for both periods, normalized to relative offset
    db.execute<{ offset_h: number; now_total: number; now_threats: number; then_total: number; then_threats: number }>(sql`
      WITH buckets AS (
        SELECT
          extract(epoch FROM (e.timestamp - (now() - ${hours + ' hours'}::interval))) / 3600 as rel_h,
          CASE WHEN e.timestamp >= now() - ${hours + ' hours'}::interval THEN 'now' ELSE 'then' END as period,
          ${THREAT} as is_threat
        FROM "security_event" e
        WHERE ${orgFilter} AND e.timestamp >= now() - ${hours * 2 + ' hours'}::interval
      )
      SELECT
        floor(CASE WHEN period = 'then' THEN rel_h + ${hours} ELSE rel_h END)::int as offset_h,
        coalesce(sum(1) filter (where period = 'now'), 0)::int as now_total,
        coalesce(sum(CASE WHEN period = 'now' AND is_threat THEN 1 ELSE 0 END), 0)::int as now_threats,
        coalesce(sum(1) filter (where period = 'then'), 0)::int as then_total,
        coalesce(sum(CASE WHEN period = 'then' AND is_threat THEN 1 ELSE 0 END), 0)::int as then_threats
      FROM buckets
      GROUP BY offset_h
      ORDER BY offset_h
    `),
    // Top attacker IPs for both periods
    db.execute<{ source_ip: string; now_count: number; then_count: number }>(sql`
      SELECT
        e.source_ip,
        coalesce(sum(1) filter (where e.timestamp >= now() - ${hours + ' hours'}::interval), 0)::int as now_count,
        coalesce(sum(1) filter (where e.timestamp < now() - ${hours + ' hours'}::interval), 0)::int as then_count
      FROM "security_event" e
      WHERE ${orgFilter}
        AND e.timestamp >= now() - ${hours * 2 + ' hours'}::interval
        AND ${THREAT}
        AND e.source_ip IS NOT NULL
      GROUP BY e.source_ip
      ORDER BY (coalesce(sum(1) filter (where e.timestamp >= now() - ${hours + ' hours'}::interval), 0)) DESC
      LIMIT 10
    `),
  ]);

  const nowStats = (stats as any[])?.find((r: any) => r.period === "now") ?? { total: 0, threats: 0, unique_ips: 0, unique_hosts: 0, unique_users: 0 };
  const thenStats = (stats as any[])?.find((r: any) => r.period === "then") ?? { total: 0, threats: 0, unique_ips: 0, unique_hosts: 0, unique_users: 0 };

  return NextResponse.json({
    hours,
    now: nowStats,
    then: thenStats,
    timeline: timeline ?? [],
    topIps: topIps ?? [],
  });
}
