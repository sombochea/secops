import { db } from "@/db";
import { securityEvent, webhookKey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { scoreEvent, isSuspicious } from "@/lib/anomaly";
import { geoBatchLookup } from "@/lib/geoip";

const WORKER_URL = process.env.WEBHOOK_WORKER_URL; // e.g. http://worker:4000

export async function POST(req: NextRequest) {
  // If worker is configured, proxy the request for high-performance ingestion
  if (WORKER_URL) {
    return proxyToWorker(req);
  }

  // Fallback: direct DB insert (original behavior)
  return directInsert(req);
}

/** Proxy to Go worker — fast path */
async function proxyToWorker(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret) {
    return NextResponse.json({ error: "Missing x-webhook-secret header" }, { status: 401 });
  }

  try {
    const body = await req.text();
    const resp = await fetch(`${WORKER_URL}/api/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": secret,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("[webhook] worker proxy failed, falling back to direct insert:", err);
    // Re-parse and fall through to direct insert
    // We can't re-read the body, so return error
    return NextResponse.json({ error: "Worker unavailable" }, { status: 502 });
  }
}

/** Direct DB insert — fallback when worker is not configured */
async function directInsert(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret) {
    return NextResponse.json({ error: "Missing x-webhook-secret header" }, { status: 401 });
  }

  const [wk] = await db.select().from(webhookKey).where(eq(webhookKey.key, secret)).limit(1);
  if (!wk) {
    return NextResponse.json({ error: "Invalid webhook secret. Create a webhook key in Settings → Webhook Keys." }, { status: 401 });
  }

  const body = await req.json();
  const events = Array.isArray(body) ? body : [body];

  const ips = [...new Set(events.map((e: Record<string, unknown>) => e.source_ip as string).filter(Boolean))];
  const geoMap = await geoBatchLookup(ips);

  const rows = [];
  for (const e of events) {
    const ts = new Date(e.timestamp as string);
    if (isNaN(ts.getTime())) {
      console.warn("[webhook] skipping event with invalid timestamp:", e.timestamp);
      continue;
    }
    const parsed = {
      organizationId: wk.organizationId,
      event: (e.event as string) || "unknown",
      status: (e.status as string) ?? null,
      authMethod: (e.auth_method as string) ?? null,
      host: (e.host as string) ?? null,
      user: (e.user as string) ?? null,
      ruser: (e.ruser as string) ?? null,
      sourceIp: (e.source_ip as string) ?? null,
      service: (e.service as string) ?? null,
      tty: (e.tty as string) ?? null,
      pamType: (e.pam_type as string) ?? null,
      ua: (e.ua as string) ?? null,
      metadata: e.metadata ?? null,
      timestamp: ts,
    };

    const geo = parsed.sourceIp ? geoMap.get(parsed.sourceIp) : undefined;
    const riskScore = await scoreEvent(parsed);

    rows.push({
      ...parsed,
      geoCountry: geo?.country ?? null,
      geoCity: geo?.city ?? null,
      geoLat: geo?.lat ?? null,
      geoLon: geo?.lon ?? null,
      riskScore,
      status: parsed.status === "failed" ? "failed" : isSuspicious(riskScore) ? "suspicious" : parsed.status,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ received: 0, organizationId: wk.organizationId });
  }

  const inserted = await db.insert(securityEvent).values(rows).returning({ id: securityEvent.id });
  return NextResponse.json({ received: inserted.length, organizationId: wk.organizationId });
}
