import { db } from "@/db";
import { securityEvent, whitelistedIp } from "@/db/schema";
import { auth } from "@/lib/auth";
import { desc, sql, eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";

const THREAT_FILTER = sql`(${securityEvent.status} = 'failed' OR ${securityEvent.authMethod} = 'invalid_user' OR ${securityEvent.event} = 'ssh_attempt' OR ${securityEvent.status} = 'suspicious')`;

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const orgCondition = eq(securityEvent.organizationId, orgId);
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";

  const [whitelistedIps, eventTypes, stats, aggregations, geoPoints, timeline, riskData] =
    await Promise.all([
      cached(`org:${orgId}:whitelist`, 60, async () => {
        const rows = await db.select({ ip: whitelistedIp.ip }).from(whitelistedIp).where(eq(whitelistedIp.organizationId, orgId));
        return rows.map((r) => r.ip);
      }),
      cached(`org:${orgId}:eventTypes`, 30, () =>
        db.selectDistinct({ event: securityEvent.event }).from(securityEvent).where(orgCondition).orderBy(securityEvent.event).then((r) => r.map((e) => e.event)),
      ),
      cached(`org:${orgId}:stats`, 15, () =>
        db.select({
          total: sql<number>`count(*)::int`,
          uniqueHosts: sql<number>`count(distinct ${securityEvent.host})::int`,
          uniqueIps: sql<number>`count(distinct ${securityEvent.sourceIp})::int`,
          uniqueUsers: sql<number>`count(distinct ${securityEvent.user})::int`,
          last24h: sql<number>`count(*) filter (where ${securityEvent.timestamp} > now() - interval '24 hours')::int`,
          last7d: sql<number>`count(*) filter (where ${securityEvent.timestamp} > now() - interval '7 days')::int`,
          threats: sql<number>`count(*) filter (where ${THREAT_FILTER})::int`,
        }).from(securityEvent).where(orgCondition).then((r) => r[0]),
      ),
      cached(`org:${orgId}:agg`, 15, async () => {
        const [byType, byHost, byIp, byService, byUser, byAuthMethod, byUa, byCountry] = await Promise.all([
          db.select({ name: securityEvent.event, count: sql<number>`count(*)::int` }).from(securityEvent).where(orgCondition).groupBy(securityEvent.event).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.host, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.host} is not null`)).groupBy(securityEvent.host).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.sourceIp, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.sourceIp} is not null`)).groupBy(securityEvent.sourceIp).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.service, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.service} is not null`)).groupBy(securityEvent.service).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.user, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.user} is not null`)).groupBy(securityEvent.user).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.authMethod, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.authMethod} is not null`)).groupBy(securityEvent.authMethod).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.ua, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.ua} is not null`)).groupBy(securityEvent.ua).orderBy(desc(sql`count(*)`)).limit(10),
          db.select({ name: securityEvent.geoCountry, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.geoCountry} is not null`)).groupBy(securityEvent.geoCountry).orderBy(desc(sql`count(*)`)).limit(10),
        ]);
        return { byType, byHost, byIp, byService, byUser, byAuthMethod, byUa, byCountry };
      }),
      cached(`org:${orgId}:geo`, 30, () =>
        db.execute<{ lat: number; lon: number; country: string; city: string; count: number; threats: number }>(sql`
          SELECT ${securityEvent.geoLat} as lat, ${securityEvent.geoLon} as lon,
            ${securityEvent.geoCountry} as country, coalesce(${securityEvent.geoCity}, '') as city,
            count(*)::int as count, count(*) filter (where ${THREAT_FILTER})::int as threats
          FROM ${securityEvent}
          WHERE ${securityEvent.geoLat} is not null AND ${orgCondition}
          GROUP BY ${securityEvent.geoLat}, ${securityEvent.geoLon}, ${securityEvent.geoCountry}, ${securityEvent.geoCity}
          ORDER BY count(*) DESC LIMIT 50
        `),
      ),
      cached(`org:${orgId}:timeline:${from || "24h"}:${to || "now"}`, 15, () =>
        buildTimeline(orgId, from, to),
      ),
      cached(`org:${orgId}:risk`, 15, async () => {
        const wl = await db.select({ ip: whitelistedIp.ip }).from(whitelistedIp).where(eq(whitelistedIp.organizationId, orgId));
        const wlSet = new Set(wl.map((r) => r.ip));
        const whitelistExcl = wlSet.size > 0
          ? sql` AND ${securityEvent.sourceIp} NOT IN (${sql.join([...wlSet].map(ip => sql`${ip}`), sql`, `)})`
          : sql``;
        const [sources, total] = await Promise.all([
          db.execute<{ source_ip: string; count: number; last_seen: string; events: string }>(sql`
            SELECT ${securityEvent.sourceIp} as source_ip, count(*)::int as count,
              max(${securityEvent.timestamp})::text as last_seen,
              string_agg(distinct ${securityEvent.event}, ', ') as events
            FROM ${securityEvent}
            WHERE ${THREAT_FILTER} AND ${securityEvent.sourceIp} is not null AND ${orgCondition}${whitelistExcl}
            GROUP BY ${securityEvent.sourceIp} ORDER BY count(*) DESC LIMIT 10
          `),
          db.execute<{ total: number }>(sql`
            SELECT count(distinct ${securityEvent.sourceIp})::int as total
            FROM ${securityEvent}
            WHERE ${THREAT_FILTER} AND ${securityEvent.sourceIp} is not null AND ${orgCondition}${whitelistExcl}
          `),
        ]);
        return {
          sources: (sources ?? []).map((r: Record<string, unknown>) => ({
            sourceIp: r.source_ip, count: r.count, lastSeen: r.last_seen,
            events: (r.events as string)?.split(", ") ?? [],
          })),
          total: (total as { total: number }[])?.[0]?.total ?? 0,
        };
      }),
    ]);

  return NextResponse.json({
    stats,
    aggregations,
    geoPoints: geoPoints ?? [],
    timeline,
    riskSources: riskData.sources,
    riskTotal: riskData.total,
    eventTypes,
    whitelistedIps,
  });
}

async function buildTimeline(orgId: string, from: string, to: string) {
  const THREAT_RAW = sql.raw(`(status = 'failed' OR auth_method = 'invalid_user' OR event = 'ssh_attempt' OR status = 'suspicious')`);

  const fromDate = from ? new Date(from) : new Date(Date.now() - 86400_000);
  const toDate = to ? new Date(to) : new Date();
  const diffMs = toDate.getTime() - fromDate.getTime();
  const hourly = diffMs <= 2 * 86400_000;

  // Pre-aggregate into buckets — no generate_series JOIN, no temp files
  const rows = hourly
    ? await db.execute<{ bucket: string; total: number; threats: number }>(sql`
        SELECT to_char(date_trunc('hour', timestamp), 'YYYY-MM-DD"T"HH24:00:00') AS bucket,
          count(*)::int AS total,
          count(*) FILTER (WHERE ${THREAT_RAW})::int AS threats
        FROM security_event
        WHERE organization_id = ${orgId}
          AND timestamp >= ${fromDate.toISOString()}::timestamptz
          AND timestamp <= ${toDate.toISOString()}::timestamptz
        GROUP BY 1 ORDER BY 1
      `)
    : await db.execute<{ bucket: string; total: number; threats: number }>(sql`
        SELECT to_char(timestamp::date, 'YYYY-MM-DD') AS bucket,
          count(*)::int AS total,
          count(*) FILTER (WHERE ${THREAT_RAW})::int AS threats
        FROM security_event
        WHERE organization_id = ${orgId}
          AND timestamp >= ${fromDate.toISOString()}::timestamptz
          AND timestamp <= ${toDate.toISOString()}::timestamptz
        GROUP BY 1 ORDER BY 1
      `);

  // Fill gaps in JS (cheap — just iterating time slots)
  const bucketMap = new Map((rows as unknown as { bucket: string; total: number; threats: number }[]).map(r => [r.bucket, r]));
  const result: { date: string; total: number; threats: number }[] = [];

  if (hourly) {
    const cursor = new Date(fromDate);
    cursor.setMinutes(0, 0, 0);
    while (cursor <= toDate) {
      const key = cursor.toISOString().replace(/:\d{2}\.\d{3}Z$/, ':00:00').replace('T', 'T').slice(0, 16) + ':00';
      // Format as YYYY-MM-DDTHH:00:00
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cursor.getUTCDate()).padStart(2, '0');
      const h = String(cursor.getUTCHours()).padStart(2, '0');
      const formatted = `${y}-${m}-${d}T${h}:00:00`;
      const hit = bucketMap.get(formatted);
      result.push({ date: formatted, total: hit?.total ?? 0, threats: hit?.threats ?? 0 });
      cursor.setTime(cursor.getTime() + 3600_000);
    }
  } else {
    const cursor = new Date(fromDate);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor <= toDate) {
      const formatted = cursor.toISOString().slice(0, 10);
      const hit = bucketMap.get(formatted);
      result.push({ date: formatted, total: hit?.total ?? 0, threats: hit?.threats ?? 0 });
      cursor.setTime(cursor.getTime() + 86400_000);
    }
  }

  return result;
}
