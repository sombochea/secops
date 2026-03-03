import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { eq, and, gte, desc, sql, count, countDistinct } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedOrg } from "@/lib/verify-org";

export async function GET(req: NextRequest) {
  const { session, orgId } = await getVerifiedOrg();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const hours = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("hours") ?? "168")), 720);
  const userFilter = req.nextUrl.searchParams.get("user") ?? "";
  const since = new Date(Date.now() - hours * 3600_000);
  const orgCond = eq(securityEvent.organizationId, orgId);
  const timeCond = gte(securityEvent.timestamp, since);

  // Per-user aggregated stats
  const userStats = await db
    .select({
      user: securityEvent.user,
      totalEvents: count(),
      uniqueIps: countDistinct(securityEvent.sourceIp),
      uniqueHosts: countDistinct(securityEvent.host),
      uniqueServices: countDistinct(securityEvent.service),
      failures: sql<number>`count(*) filter (where ${securityEvent.status} = 'failed')`.as("failures"),
      threats: sql<number>`count(*) filter (where ${securityEvent.status} = 'failed' or ${securityEvent.authMethod} = 'invalid_user' or ${securityEvent.event} = 'ssh_attempt' or ${securityEvent.status} = 'suspicious')`.as("threats"),
      maxRisk: sql<number>`coalesce(max(${securityEvent.riskScore}), 0)`.as("max_risk"),
      uniqueCountries: sql<number>`count(distinct ${securityEvent.geoCountry})`.as("unique_countries"),
      firstSeen: sql<string>`min(${securityEvent.timestamp})`.as("first_seen"),
      lastSeen: sql<string>`max(${securityEvent.timestamp})`.as("last_seen"),
    })
    .from(securityEvent)
    .where(and(orgCond, timeCond, sql`${securityEvent.user} is not null`))
    .groupBy(securityEvent.user)
    .orderBy(desc(sql`threats`), desc(sql`count(*)`));

  // Compute baselines (median-based) for anomaly scoring
  const totals = userStats.map((u) => u.totalEvents);
  const ipCounts = userStats.map((u) => u.uniqueIps);
  const failRates = userStats.map((u) => u.totalEvents > 0 ? u.failures / u.totalEvents : 0);
  const countryCounts = userStats.map((u) => u.uniqueCountries);

  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const mad = (arr: number[], med: number) => median(arr.map((v) => Math.abs(v - med)));

  const medTotal = median(totals);
  const madTotal = mad(totals, medTotal) || 1;
  const medIps = median(ipCounts);
  const madIps = mad(ipCounts, medIps) || 1;
  const medFail = median(failRates);
  const madFail = mad(failRates, medFail) || 0.01;
  const medCountries = median(countryCounts);
  const madCountries = mad(countryCounts, medCountries) || 1;

  // Score each user
  const scored = userStats.map((u) => {
    const failRate = u.totalEvents > 0 ? u.failures / u.totalEvents : 0;
    const anomalies: string[] = [];
    let score = 0;

    const zTotal = Math.abs(u.totalEvents - medTotal) / madTotal;
    const zIps = Math.abs(u.uniqueIps - medIps) / madIps;
    const zFail = Math.abs(failRate - medFail) / madFail;
    const zCountries = Math.abs(u.uniqueCountries - medCountries) / madCountries;

    if (zTotal > 3) { anomalies.push("Unusual event volume"); score += 20; }
    if (zIps > 3) { anomalies.push("Many source IPs"); score += 25; }
    if (zFail > 3 && failRate > medFail) { anomalies.push("High failure rate"); score += 25; }
    if (zCountries > 2 && u.uniqueCountries >= 3) { anomalies.push("Multi-country access"); score += 20; }
    if (u.maxRisk >= 70) { anomalies.push("High risk events"); score += 15; }
    if (u.threats > 0 && u.threats / u.totalEvents > 0.5) { anomalies.push("Majority threat events"); score += 15; }

    score = Math.min(score, 100);
    const riskLevel = score >= 60 ? "critical" : score >= 30 ? "high" : score > 0 ? "medium" : "normal";

    return { ...u, failRate: Math.round(failRate * 100), anomalyScore: score, anomalies, riskLevel };
  });

  // Detail for a specific user
  let detail = null;
  if (userFilter) {
    const events = await db
      .select({
        event: securityEvent.event,
        status: securityEvent.status,
        sourceIp: securityEvent.sourceIp,
        host: securityEvent.host,
        service: securityEvent.service,
        geoCountry: securityEvent.geoCountry,
        riskScore: securityEvent.riskScore,
        timestamp: securityEvent.timestamp,
      })
      .from(securityEvent)
      .where(and(orgCond, timeCond, eq(securityEvent.user, userFilter)))
      .orderBy(desc(securityEvent.timestamp))
      .limit(200);

    // Hourly activity pattern
    const hourBuckets = new Array(24).fill(0);
    const ipSet = new Map<string, { count: number; threats: number; country: string }>();
    const hostSet = new Map<string, number>();
    const eventTypes = new Map<string, number>();

    for (const e of events) {
      const h = new Date(e.timestamp).getUTCHours();
      hourBuckets[h]++;
      if (e.sourceIp) {
        const prev = ipSet.get(e.sourceIp) ?? { count: 0, threats: 0, country: e.geoCountry ?? "" };
        prev.count++;
        if (e.status === "failed" || e.status === "suspicious") prev.threats++;
        ipSet.set(e.sourceIp, prev);
      }
      if (e.host) hostSet.set(e.host, (hostSet.get(e.host) ?? 0) + 1);
      if (e.event) eventTypes.set(e.event, (eventTypes.get(e.event) ?? 0) + 1);
    }

    detail = {
      user: userFilter,
      hourlyActivity: hourBuckets,
      sourceIps: Object.fromEntries([...ipSet.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20)),
      hosts: Object.fromEntries([...hostSet.entries()].sort((a, b) => b[1] - a[1])),
      eventTypes: Object.fromEntries([...eventTypes.entries()].sort((a, b) => b[1] - a[1])),
      recentEvents: events.slice(0, 20).map((e) => ({
        event: e.event,
        status: e.status,
        sourceIp: e.sourceIp,
        host: e.host,
        riskScore: e.riskScore,
        timestamp: e.timestamp,
      })),
    };
  }

  return NextResponse.json({
    users: scored,
    baselines: { medianEvents: medTotal, medianIps: medIps, medianFailRate: Math.round(medFail * 100), medianCountries: medCountries },
    hours,
    detail,
  });
}
