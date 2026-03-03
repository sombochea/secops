import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedOrg } from "@/lib/verify-org";

export async function GET(req: NextRequest) {
  const { session, orgId } = await getVerifiedOrg();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const hours = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("hours") ?? "24")), 168);
  const limitParam = Math.min(Math.max(50, parseInt(req.nextUrl.searchParams.get("limit") ?? "500")), 2000);
  const topN = Math.min(Math.max(5, parseInt(req.nextUrl.searchParams.get("topN") ?? "30")), 100);
  const ipFilter = req.nextUrl.searchParams.get("ip") ?? "";
  const since = new Date(Date.now() - hours * 3600_000);

  const conditions = [eq(securityEvent.organizationId, orgId), gte(securityEvent.timestamp, since)];
  if (ipFilter) conditions.push(eq(securityEvent.sourceIp, ipFilter));

  const rows = await db
    .select({
      id: securityEvent.id,
      event: securityEvent.event,
      status: securityEvent.status,
      authMethod: securityEvent.authMethod,
      sourceIp: securityEvent.sourceIp,
      host: securityEvent.host,
      user: securityEvent.user,
      service: securityEvent.service,
      riskScore: securityEvent.riskScore,
      geoCountry: securityEvent.geoCountry,
      geoCity: securityEvent.geoCity,
      timestamp: securityEvent.timestamp,
    })
    .from(securityEvent)
    .where(and(...conditions))
    .orderBy(desc(securityEvent.timestamp))
    .limit(limitParam);

  // Build graph
  type NodeData = { id: string; type: "ip" | "host" | "user" | "service"; label: string; count: number; threats: number; riskMax: number; country?: string };
  type EdgeData = { id: string; source: string; target: string; count: number; threats: number };

  const nodeMap = new Map<string, NodeData>();
  const edgeMap = new Map<string, EdgeData>();

  const ensureNode = (id: string, type: NodeData["type"], label: string, country?: string) => {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, type, label, count: 0, threats: 0, riskMax: 0, country });
    return nodeMap.get(id)!;
  };
  const ensureEdge = (src: string, tgt: string) => {
    const id = `${src}->${tgt}`;
    if (!edgeMap.has(id)) edgeMap.set(id, { id, source: src, target: tgt, count: 0, threats: 0 });
    return edgeMap.get(id)!;
  };

  // IP detail stats (only when filtering by IP)
  let detail: {
    ip: string; totalEvents: number; threats: number; maxRisk: number;
    firstSeen: string; lastSeen: string; country: string; city: string;
    targetHosts: Record<string, number>; targetUsers: Record<string, number>;
    services: Record<string, number>; eventTypes: Record<string, number>;
    authMethods: Record<string, number>;
  } | null = null;

  if (ipFilter && rows.length > 0) {
    const targetHosts: Record<string, number> = {};
    const targetUsers: Record<string, number> = {};
    const services: Record<string, number> = {};
    const eventTypes: Record<string, number> = {};
    const authMethods: Record<string, number> = {};
    let threats = 0, maxRisk = 0;

    for (const r of rows) {
      const isThreat = r.status === "failed" || r.status === "suspicious" || r.event === "ssh_attempt";
      if (isThreat) threats++;
      maxRisk = Math.max(maxRisk, r.riskScore ?? 0);
      if (r.host) targetHosts[r.host] = (targetHosts[r.host] ?? 0) + 1;
      if (r.user) targetUsers[r.user] = (targetUsers[r.user] ?? 0) + 1;
      if (r.service) services[r.service] = (services[r.service] ?? 0) + 1;
      if (r.event) eventTypes[r.event] = (eventTypes[r.event] ?? 0) + 1;
      if (r.authMethod) authMethods[r.authMethod] = (authMethods[r.authMethod] ?? 0) + 1;
    }

    detail = {
      ip: ipFilter,
      totalEvents: rows.length,
      threats,
      maxRisk,
      firstSeen: rows[rows.length - 1].timestamp.toISOString(),
      lastSeen: rows[0].timestamp.toISOString(),
      country: rows.find((r) => r.geoCountry)?.geoCountry ?? "Unknown",
      city: rows.find((r) => r.geoCity)?.geoCity ?? "",
      targetHosts,
      targetUsers,
      services,
      eventTypes,
      authMethods,
    };
  }

  for (const r of rows) {
    const isThreat = r.status === "failed" || r.status === "suspicious" || r.event === "ssh_attempt";
    const risk = r.riskScore ?? 0;
    const entities: string[] = [];

    if (r.sourceIp) {
      const nid = `ip:${r.sourceIp}`;
      const n = ensureNode(nid, "ip", r.sourceIp, r.geoCountry ?? undefined);
      n.count++; if (isThreat) n.threats++; n.riskMax = Math.max(n.riskMax, risk);
      entities.push(nid);
    }
    if (r.host) {
      const nid = `host:${r.host}`;
      const n = ensureNode(nid, "host", r.host);
      n.count++; if (isThreat) n.threats++; n.riskMax = Math.max(n.riskMax, risk);
      entities.push(nid);
    }
    if (r.user) {
      const nid = `user:${r.user}`;
      const n = ensureNode(nid, "user", r.user);
      n.count++; if (isThreat) n.threats++; n.riskMax = Math.max(n.riskMax, risk);
      entities.push(nid);
    }
    if (r.service) {
      const nid = `svc:${r.service}`;
      const n = ensureNode(nid, "service", r.service);
      n.count++; if (isThreat) n.threats++; n.riskMax = Math.max(n.riskMax, risk);
      entities.push(nid);
    }

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e = ensureEdge(entities[i], entities[j]);
        e.count++; if (isThreat) e.threats++;
      }
    }
  }

  // Cap nodes: keep top N per type (by threats desc, count desc)
  const allNodes = Array.from(nodeMap.values());
  const byType: Record<string, typeof allNodes> = {};
  for (const n of allNodes) (byType[n.type] ??= []).push(n);
  const keptIds = new Set<string>();
  for (const group of Object.values(byType)) {
    group.sort((a, b) => b.threats - a.threats || b.count - a.count);
    for (const n of group.slice(0, topN)) keptIds.add(n.id);
  }
  const nodes = allNodes.filter((n) => keptIds.has(n.id));
  const edges = Array.from(edgeMap.values()).filter((e) => keptIds.has(e.source) && keptIds.has(e.target));

  return NextResponse.json({
    nodes,
    edges,
    totalEvents: rows.length,
    totalNodes: allNodes.length,
    hours,
    topN,
    detail,
  });
}
