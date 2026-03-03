import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedOrg } from "@/lib/verify-org";

const THREAT_FILTER = sql`(${securityEvent.status} = 'failed' OR ${securityEvent.authMethod} = 'invalid_user' OR ${securityEvent.event} = 'ssh_attempt' OR ${securityEvent.status} = 'suspicious')`;

export async function GET(req: NextRequest) {
  const { session, orgId } = await getVerifiedOrg();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const hours = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("hours") ?? "24")), 168);
  const limitParam = Math.min(Math.max(50, parseInt(req.nextUrl.searchParams.get("limit") ?? "500")), 2000);
  const since = new Date(Date.now() - hours * 3600_000);

  const rows = await db
    .select({
      id: securityEvent.id,
      event: securityEvent.event,
      status: securityEvent.status,
      sourceIp: securityEvent.sourceIp,
      host: securityEvent.host,
      user: securityEvent.user,
      service: securityEvent.service,
      riskScore: securityEvent.riskScore,
      geoCountry: securityEvent.geoCountry,
      timestamp: securityEvent.timestamp,
    })
    .from(securityEvent)
    .where(and(eq(securityEvent.organizationId, orgId), gte(securityEvent.timestamp, since)))
    .orderBy(desc(securityEvent.timestamp))
    .limit(limitParam);

  // Build graph: nodes = unique entities, edges = co-occurrence in events
  type NodeData = { id: string; type: "ip" | "host" | "user" | "event" | "service"; label: string; count: number; threats: number; riskMax: number; country?: string };
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

    // Connect entities that co-occur in the same event
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e = ensureEdge(entities[i], entities[j]);
        e.count++; if (isThreat) e.threats++;
      }
    }
  }

  return NextResponse.json({
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    totalEvents: rows.length,
    hours,
  });
}
