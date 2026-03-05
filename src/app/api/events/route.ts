import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { desc, sql, eq, and, gte, lte, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

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

  const conditions = [eq(securityEvent.organizationId, orgId)];
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
  });
}
