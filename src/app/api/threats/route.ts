import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedOrg } from "@/lib/verify-org";
import { cached } from "@/lib/redis";

const THREAT_COND = sql`(status = 'failed' OR auth_method = 'invalid_user' OR event = 'ssh_attempt' OR status = 'suspicious')`;

export async function GET(req: NextRequest) {
  const { session, orgId } = await getVerifiedOrg();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const hours = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("hours") ?? "72")), 720);
  const data = await cached(`org:${orgId}:threats:${hours}`, 15, () => fetchThreats(orgId, hours));
  return NextResponse.json(data);
}

async function fetchThreats(orgId: string, hours: number) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const sinceDate = new Date(since);
  const orgCond = eq(securityEvent.organizationId, orgId);
  const timeCond = gte(securityEvent.timestamp, sinceDate);

  const [summaryRows, iocRows, techniqueRows, countryRows, timelineRows, recentThreats, targetRows] =
    await Promise.all([
      db.execute(sql`
        SELECT count(*)::int as total,
          count(*) filter (where ${THREAT_COND})::int as threats,
          count(distinct source_ip) filter (where ${THREAT_COND})::int as unique_ips,
          count(distinct geo_country) filter (where ${THREAT_COND} and geo_country is not null)::int as unique_countries
        FROM security_event WHERE organization_id = ${orgId} AND timestamp >= ${since}
      `),
      db.execute(sql`
        SELECT source_ip, count(*)::int as count,
          count(*) filter (where ${THREAT_COND})::int as threats,
          string_agg(distinct geo_country, ', ') filter (where geo_country is not null) as countries,
          count(distinct host)::int as hosts, count(distinct "user")::int as users,
          min(timestamp)::text as first_seen, max(timestamp)::text as last_seen,
          coalesce(max(risk_score), 0)::int as max_risk,
          string_agg(distinct auth_method, ', ') filter (where auth_method is not null) as auth_methods,
          string_agg(distinct event, ', ') as events
        FROM security_event
        WHERE organization_id = ${orgId} AND timestamp >= ${since} AND source_ip IS NOT NULL AND ${THREAT_COND}
        GROUP BY source_ip ORDER BY threats DESC, max_risk DESC LIMIT 50
      `),
      db.execute(sql`
        SELECT event, auth_method, status, count(*)::int as count
        FROM security_event WHERE organization_id = ${orgId} AND timestamp >= ${since} AND ${THREAT_COND}
        GROUP BY event, auth_method, status ORDER BY count DESC LIMIT 30
      `),
      db.execute(sql`
        SELECT coalesce(geo_country, 'Unknown') as country, count(*)::int as count,
          count(distinct source_ip)::int as unique_ips
        FROM security_event
        WHERE organization_id = ${orgId} AND timestamp >= ${since} AND ${THREAT_COND} AND source_ip IS NOT NULL
        GROUP BY geo_country ORDER BY count DESC LIMIT 30
      `),
      hours <= 48
        ? db.execute(sql`
            SELECT to_char(date_trunc('hour', timestamp), 'YYYY-MM-DD"T"HH24:00') as bucket,
              count(*) filter (where ${THREAT_COND})::int as threats, count(*)::int as total
            FROM security_event WHERE organization_id = ${orgId} AND timestamp >= ${since}
            GROUP BY 1 ORDER BY 1
          `)
        : db.execute(sql`
            SELECT to_char(date_trunc('day', timestamp), 'YYYY-MM-DD') as bucket,
              count(*) filter (where ${THREAT_COND})::int as threats, count(*)::int as total
            FROM security_event WHERE organization_id = ${orgId} AND timestamp >= ${since}
            GROUP BY 1 ORDER BY 1
          `),
      db.select({
        id: securityEvent.id, event: securityEvent.event, status: securityEvent.status,
        authMethod: securityEvent.authMethod, sourceIp: securityEvent.sourceIp,
        host: securityEvent.host, user: securityEvent.user, service: securityEvent.service,
        geoCountry: securityEvent.geoCountry, riskScore: securityEvent.riskScore,
        timestamp: securityEvent.timestamp,
      }).from(securityEvent)
        .where(and(orgCond, timeCond,
          sql`(${securityEvent.status} = 'failed' OR ${securityEvent.authMethod} = 'invalid_user' OR ${securityEvent.event} = 'ssh_attempt' OR ${securityEvent.status} = 'suspicious')`,
        ))
        .orderBy(desc(securityEvent.timestamp)).limit(20),
      db.execute(sql`
        SELECT coalesce(host, 'unknown') as host, coalesce("user", 'unknown') as "user", count(*)::int as count
        FROM security_event WHERE organization_id = ${orgId} AND timestamp >= ${since} AND ${THREAT_COND}
        GROUP BY host, "user" ORDER BY count DESC LIMIT 20
      `),
    ]);

  const techniques = (techniqueRows as unknown as Record<string, unknown>[]).map((r) => {
    const ev = r.event as string, am = r.auth_method as string, st = r.status as string;
    return { event: ev, authMethod: am, status: st, count: r.count as number, ...mapTechnique(ev, am, st) };
  });

  return {
    summary: (summaryRows as unknown as Record<string, unknown>[])[0] ?? { total: 0, threats: 0, unique_ips: 0, unique_countries: 0 },
    iocs: (iocRows as unknown as Record<string, unknown>[]).map((r) => ({
      ip: r.source_ip, count: r.count, threats: r.threats,
      countries: r.countries ?? "Unknown", hosts: r.hosts, users: r.users,
      firstSeen: r.first_seen, lastSeen: r.last_seen, maxRisk: r.max_risk,
      authMethods: r.auth_methods ?? "", events: r.events ?? "",
    })),
    techniques,
    geography: (countryRows as unknown as Record<string, unknown>[]).map((r) => ({
      country: r.country, count: r.count, uniqueIps: r.unique_ips,
    })),
    timeline: (timelineRows as unknown as Record<string, unknown>[]).map((r) => ({
      bucket: r.bucket, threats: r.threats, total: r.total,
    })),
    recentThreats: (recentThreats as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id, event: r.event, status: r.status, authMethod: r.authMethod,
      sourceIp: r.sourceIp, host: r.host, user: r.user, service: r.service,
      geoCountry: r.geoCountry, riskScore: r.riskScore, timestamp: r.timestamp,
    })),
    targets: (targetRows as unknown as Record<string, unknown>[]).map((r) => ({
      host: r.host, user: r.user, count: r.count,
    })),
    hours,
  };
}

function mapTechnique(event: string, authMethod: string | null, status: string | null) {
  const e = event?.toLowerCase() ?? "", a = authMethod?.toLowerCase() ?? "", s = status?.toLowerCase() ?? "";
  if (a === "invalid_user" || (e.includes("ssh") && s === "failed"))
    return { technique: "T1110 — Brute Force", tactic: "Credential Access", severity: "high" as const };
  if (e === "ssh_attempt" && a === "publickey")
    return { technique: "T1021.004 — Remote Services: SSH", tactic: "Lateral Movement", severity: "medium" as const };
  if (e === "ssh_attempt")
    return { technique: "T1078 — Valid Accounts", tactic: "Initial Access", severity: "high" as const };
  if (s === "suspicious")
    return { technique: "T1071 — Application Layer Protocol", tactic: "Command & Control", severity: "critical" as const };
  if (s === "failed")
    return { technique: "T1110.001 — Password Guessing", tactic: "Credential Access", severity: "medium" as const };
  return { technique: "T1190 — Exploit Public-Facing Application", tactic: "Initial Access", severity: "low" as const };
}
