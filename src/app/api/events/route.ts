import { db } from "@/db";
import { securityEvent, whitelistedIp } from "@/db/schema";
import { auth } from "@/lib/auth";
import { desc, sql, eq, and, gte, lte, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";

const THREAT_FILTER = sql`(${securityEvent.status} = 'failed' OR ${securityEvent.authMethod} = 'invalid_user' OR ${securityEvent.event} = 'ssh_attempt' OR ${securityEvent.status} = 'suspicious')`;
const THREAT_FILTER_ALIAS = sql.raw(`(e.status = 'failed' OR e.auth_method = 'invalid_user' OR e.event = 'ssh_attempt' OR e.status = 'suspicious')`);

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const orgCondition = eq(securityEvent.organizationId, orgId);
  const url = req.nextUrl;

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")), 100);
  const search = url.searchParams.get("q") ?? "";
  const eventType = url.searchParams.get("event") ?? "";
  const host = url.searchParams.get("host") ?? "";
  const sourceIp = url.searchParams.get("source_ip") ?? "";
  const userFilter = url.searchParams.get("user") ?? "";
  const service = url.searchParams.get("service") ?? "";
  const ua = url.searchParams.get("ua") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const conditions = [orgCondition];
  if (search) {
    conditions.push(
      sql`(${ilike(securityEvent.host, `%${search}%`)} OR ${ilike(securityEvent.user, `%${search}%`)} OR ${ilike(securityEvent.sourceIp, `%${search}%`)} OR ${ilike(securityEvent.service, `%${search}%`)} OR ${ilike(securityEvent.event, `%${search}%`)} OR ${ilike(securityEvent.ua, `%${search}%`)})`
    );
  }
  if (eventType) conditions.push(eq(securityEvent.event, eventType));
  if (host) conditions.push(ilike(securityEvent.host, `%${host}%`));
  if (sourceIp) conditions.push(ilike(securityEvent.sourceIp, `%${sourceIp}%`));
  if (userFilter) conditions.push(ilike(securityEvent.user, `%${userFilter}%`));
  if (service) conditions.push(eq(securityEvent.service, service));
  if (ua) conditions.push(ilike(securityEvent.ua, `%${ua}%`));
  if (from) conditions.push(gte(securityEvent.timestamp, new Date(from)));
  if (to) conditions.push(lte(securityEvent.timestamp, new Date(to)));

  const where = and(...conditions);
  const orgFilter = sql.raw(`e.organization_id = '${orgId}'`);

  // ── Cached: expensive aggregations (TTL 15s, invalidated on new events) ──
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
        buildTimelineQuery(orgId, from, to, orgFilter),
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

  // ── Live: paginated events + count (must be real-time) ──
  const [events, countResult] = await Promise.all([
    db.select().from(securityEvent).where(where).orderBy(desc(securityEvent.timestamp)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)::int` }).from(securityEvent).where(where),
  ]);

  const total = countResult[0].count;

  return NextResponse.json({
    events,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    eventTypes,
    stats,
    aggregations,
    geoPoints: geoPoints ?? [],
    timeline,
    riskSources: riskData.sources,
    riskTotal: riskData.total,
    whitelistedIps,
  });
}

// ─── Timeline ────────────────────────────────────────────────────────────────

async function buildTimelineQuery(orgId: string, from: string, to: string, orgFilter: ReturnType<typeof sql.raw>) {
  const timelineFrom = from || "";
  const timelineTo = to || "";

  if (timelineFrom && timelineTo) {
    const diffDays = Math.ceil((new Date(timelineTo).getTime() - new Date(timelineFrom).getTime()) / 86400_000);
    if (diffDays <= 2) {
      return db.execute<{ date: string; total: number; threats: number }>(sql`
        SELECT to_char(d, 'YYYY-MM-DD"T"HH24:00:00') as date,
          coalesce(count(e.id), 0)::int as total,
          coalesce(count(e.id) filter (where ${THREAT_FILTER_ALIAS}), 0)::int as threats
        FROM generate_series(${timelineFrom}::timestamptz, ${timelineTo}::timestamptz, '1 hour') d
        LEFT JOIN "security_event" e ON date_trunc('hour', e.timestamp) = date_trunc('hour', d) AND ${orgFilter}
        GROUP BY d ORDER BY d
      `);
    }
    return db.execute<{ date: string; total: number; threats: number }>(sql`
      SELECT d::date::text as date,
        coalesce(count(e.id), 0)::int as total,
        coalesce(count(e.id) filter (where ${THREAT_FILTER_ALIAS}), 0)::int as threats
      FROM generate_series(${timelineFrom}::date, ${timelineTo}::date, '1 day') d
      LEFT JOIN "security_event" e ON e.timestamp::date = d::date AND ${orgFilter}
      GROUP BY d::date ORDER BY d::date
    `);
  }

  return db.execute<{ date: string; total: number; threats: number }>(sql`
    SELECT to_char(d, 'YYYY-MM-DD"T"HH24:00:00') as date,
      coalesce(count(e.id), 0)::int as total,
      coalesce(count(e.id) filter (where ${THREAT_FILTER_ALIAS}), 0)::int as threats
    FROM generate_series(now() - interval '23 hours', now(), '1 hour') d
    LEFT JOIN "security_event" e ON date_trunc('hour', e.timestamp) = date_trunc('hour', d) AND ${orgFilter}
    GROUP BY d ORDER BY d
  `);
}
