import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { desc, sql, eq, and, gte, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const THREAT_FILTER = sql`(${securityEvent.status} = 'failed' OR ${securityEvent.authMethod} = 'invalid_user' OR ${securityEvent.event} = 'ssh_attempt')`;
const THREAT_FILTER_ALIAS = sql.raw(`(e.status = 'failed' OR e.auth_method = 'invalid_user' OR e.event = 'ssh_attempt')`);

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

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
  const since = url.searchParams.get("since") ?? "";

  const conditions = [orgCondition];
  if (search) {
    conditions.push(
      sql`(${ilike(securityEvent.host, `%${search}%`)} OR ${ilike(securityEvent.user, `%${search}%`)} OR ${ilike(securityEvent.sourceIp, `%${search}%`)} OR ${ilike(securityEvent.service, `%${search}%`)} OR ${ilike(securityEvent.event, `%${search}%`)})`
    );
  }
  if (eventType) conditions.push(eq(securityEvent.event, eventType));
  if (host) conditions.push(ilike(securityEvent.host, `%${host}%`));
  if (sourceIp) conditions.push(ilike(securityEvent.sourceIp, `%${sourceIp}%`));
  if (userFilter) conditions.push(ilike(securityEvent.user, `%${userFilter}%`));
  if (service) conditions.push(eq(securityEvent.service, service));
  if (since) conditions.push(gte(securityEvent.timestamp, new Date(since)));

  const where = and(...conditions);
  const orgFilter = sql.raw(`e.organization_id = '${orgId}'`);

  const [events, countResult, eventTypes, stats, byType, byHost, byIp, byService, timeline, riskSources] =
    await Promise.all([
      db.select().from(securityEvent).where(where).orderBy(desc(securityEvent.timestamp)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(securityEvent).where(where),
      db.selectDistinct({ event: securityEvent.event }).from(securityEvent).where(orgCondition).orderBy(securityEvent.event),
      db
        .select({
          total: sql<number>`count(*)::int`,
          uniqueHosts: sql<number>`count(distinct ${securityEvent.host})::int`,
          uniqueIps: sql<number>`count(distinct ${securityEvent.sourceIp})::int`,
          uniqueUsers: sql<number>`count(distinct ${securityEvent.user})::int`,
          last24h: sql<number>`count(*) filter (where ${securityEvent.timestamp} > now() - interval '24 hours')::int`,
          last7d: sql<number>`count(*) filter (where ${securityEvent.timestamp} > now() - interval '7 days')::int`,
          threats: sql<number>`count(*) filter (where ${THREAT_FILTER})::int`,
        })
        .from(securityEvent)
        .where(orgCondition),
      db.select({ name: securityEvent.event, count: sql<number>`count(*)::int` }).from(securityEvent).where(orgCondition).groupBy(securityEvent.event).orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ name: securityEvent.host, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.host} is not null`)).groupBy(securityEvent.host).orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ name: securityEvent.sourceIp, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.sourceIp} is not null`)).groupBy(securityEvent.sourceIp).orderBy(desc(sql`count(*)`)).limit(10),
      db.select({ name: securityEvent.service, count: sql<number>`count(*)::int` }).from(securityEvent).where(and(orgCondition, sql`${securityEvent.service} is not null`)).groupBy(securityEvent.service).orderBy(desc(sql`count(*)`)).limit(10),
      db.execute<{ date: string; total: number; threats: number }>(sql`
        SELECT
          d::date::text as date,
          coalesce(count(e.id), 0)::int as total,
          coalesce(count(e.id) filter (where ${THREAT_FILTER_ALIAS}), 0)::int as threats
        FROM generate_series(
          (now() - interval '13 days')::date,
          now()::date,
          '1 day'
        ) d
        LEFT JOIN "security_event" e ON e.timestamp::date = d::date AND ${orgFilter}
        GROUP BY d::date
        ORDER BY d::date
      `),
      db.execute<{ source_ip: string; count: number; last_seen: string; events: string }>(sql`
        SELECT
          ${securityEvent.sourceIp} as source_ip,
          count(*)::int as count,
          max(${securityEvent.timestamp})::text as last_seen,
          string_agg(distinct ${securityEvent.event}, ', ') as events
        FROM ${securityEvent}
        WHERE ${THREAT_FILTER} AND ${securityEvent.sourceIp} is not null AND ${orgCondition}
        GROUP BY ${securityEvent.sourceIp}
        ORDER BY count(*) DESC
        LIMIT 5
      `),
    ]);

  const total = countResult[0].count;

  return NextResponse.json({
    events,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    eventTypes: eventTypes.map((e) => e.event),
    stats: stats[0],
    aggregations: { byType, byHost, byIp, byService },
    timeline,
    riskSources: (riskSources ?? []).map((r: { source_ip: string; count: number; last_seen: string; events: string }) => ({
      sourceIp: r.source_ip,
      count: r.count,
      lastSeen: r.last_seen,
      events: r.events?.split(", ") ?? [],
    })),
  });
}
