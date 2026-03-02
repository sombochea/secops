import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { desc, sql, eq, and, gte, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl;
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const search = url.searchParams.get("q") ?? "";
  const eventType = url.searchParams.get("event") ?? "";
  const since = url.searchParams.get("since") ?? "";

  const conditions = [];
  if (search) {
    conditions.push(
      sql`(${ilike(securityEvent.host, `%${search}%`)} OR ${ilike(securityEvent.user, `%${search}%`)} OR ${ilike(securityEvent.sourceIp, `%${search}%`)})`
    );
  }
  if (eventType) conditions.push(eq(securityEvent.event, eventType));
  if (since) conditions.push(gte(securityEvent.timestamp, new Date(since)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [events, countResult, eventTypes, stats] = await Promise.all([
    db
      .select()
      .from(securityEvent)
      .where(where)
      .orderBy(desc(securityEvent.timestamp))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityEvent)
      .where(where),
    db
      .selectDistinct({ event: securityEvent.event })
      .from(securityEvent)
      .orderBy(securityEvent.event),
    db
      .select({
        total: sql<number>`count(*)::int`,
        uniqueHosts: sql<number>`count(distinct ${securityEvent.host})::int`,
        uniqueIps: sql<number>`count(distinct ${securityEvent.sourceIp})::int`,
        last24h: sql<number>`count(*) filter (where ${securityEvent.timestamp} > now() - interval '24 hours')::int`,
      })
      .from(securityEvent),
  ]);

  return NextResponse.json({
    events,
    total: countResult[0].count,
    page,
    limit,
    eventTypes: eventTypes.map((e) => e.event),
    stats: stats[0],
  });
}
