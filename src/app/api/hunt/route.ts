import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, gte, lte, ilike, sql, desc, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Advanced threat hunting query endpoint
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const body = await req.json();
  const {
    iocs = [],        // array of strings: IPs, users, hosts, UAs to search
    conditions = [],   // array of {field, op, value}
    from,
    to,
    minRisk = 0,
    onlyThreats = false,
    limit: rawLimit = 100,
    page: rawPage = 1,
  } = body;

  const limit = Math.min(Math.max(1, rawLimit), 500);
  const page = Math.max(1, rawPage);
  const where = [eq(securityEvent.organizationId, orgId)];

  // IOC search: match any IOC across IP, host, user, UA, service
  if (iocs.length > 0) {
    const iocConditions = iocs.flatMap((ioc: string) => [
      ilike(securityEvent.sourceIp, `%${ioc}%`),
      ilike(securityEvent.host, `%${ioc}%`),
      ilike(securityEvent.user, `%${ioc}%`),
      ilike(securityEvent.ua, `%${ioc}%`),
      ilike(securityEvent.service, `%${ioc}%`),
      ilike(securityEvent.event, `%${ioc}%`),
    ]);
    where.push(or(...iocConditions)!);
  }

  // Custom field conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldMap: Record<string, any> = {
    source_ip: securityEvent.sourceIp,
    host: securityEvent.host,
    user: securityEvent.user,
    event: securityEvent.event,
    status: securityEvent.status,
    service: securityEvent.service,
    auth_method: securityEvent.authMethod,
    ua: securityEvent.ua,
    geo_country: securityEvent.geoCountry,
    geo_city: securityEvent.geoCity,
  };

  for (const c of conditions) {
    const col = fieldMap[c.field];
    if (!col || !c.value) continue;
    switch (c.op) {
      case "eq": where.push(eq(col, c.value)); break;
      case "neq": where.push(sql`${col} != ${c.value}`); break;
      case "contains": where.push(ilike(col, `%${c.value}%`)); break;
      case "starts": where.push(ilike(col, `${c.value}%`)); break;
      case "ends": where.push(ilike(col, `%${c.value}`)); break;
    }
  }

  if (from) where.push(gte(securityEvent.timestamp, new Date(from)));
  if (to) where.push(lte(securityEvent.timestamp, new Date(to)));
  if (minRisk > 0) where.push(gte(securityEvent.riskScore, minRisk));
  if (onlyThreats) {
    where.push(sql`(${securityEvent.status} = 'failed' OR ${securityEvent.authMethod} = 'invalid_user' OR ${securityEvent.event} = 'ssh_attempt' OR ${securityEvent.status} = 'suspicious')`);
  }

  const whereClause = and(...where);

  const [events, countResult, facets] = await Promise.all([
    db.select().from(securityEvent).where(whereClause).orderBy(desc(securityEvent.timestamp)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)::int` }).from(securityEvent).where(whereClause),
    db.select({
      uniqueIps: sql<number>`count(distinct ${securityEvent.sourceIp})::int`,
      uniqueHosts: sql<number>`count(distinct ${securityEvent.host})::int`,
      uniqueUsers: sql<number>`count(distinct ${securityEvent.user})::int`,
      avgRisk: sql<number>`coalesce(avg(${securityEvent.riskScore}) filter (where ${securityEvent.riskScore} > 0), 0)::int`,
      maxRisk: sql<number>`coalesce(max(${securityEvent.riskScore}), 0)::int`,
    }).from(securityEvent).where(whereClause),
  ]);

  return NextResponse.json({
    events,
    total: countResult[0].count,
    page,
    limit,
    totalPages: Math.ceil(countResult[0].count / limit),
    facets: facets[0],
  });
}
