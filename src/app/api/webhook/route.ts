import { db } from "@/db";
import { securityEvent, webhookKey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { scoreEvent, isSuspicious } from "@/lib/anomaly";
import { geoBatchLookup } from "@/lib/geoip";
import { invalidate } from "@/lib/redis";

const WORKER_URL = process.env.WEBHOOK_WORKER_URL; // e.g. http://worker:4000

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret) {
    return NextResponse.json({ error: "Missing x-webhook-secret header" }, { status: 401 });
  }

  // Read body once — reusable for proxy and fallback
  const body = await req.text();

  if (WORKER_URL) {
    try {
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
    }
  }

  // Fallback: direct DB insert
  console.warn("[webhook] no worker URL configured or worker proxy failed, processing webhook directly in API route");
  return directInsert(secret, body);
}

async function directInsert(secret: string, body: string) {
  const [wk] = await db.select().from(webhookKey).where(eq(webhookKey.key, secret)).limit(1);
  if (!wk) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const parsed = JSON.parse(body);
  const events = Array.isArray(parsed) ? parsed : [parsed];

  const ips = [...new Set(events.map((e: Record<string, unknown>) => e.source_ip as string).filter(Boolean))];
  const geoMap = await geoBatchLookup(ips);

  const rows = [];
  for (const e of events) {
    const ts = new Date(e.timestamp as string);
    if (isNaN(ts.getTime())) continue;

    const ev = {
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

    const geo = ev.sourceIp ? geoMap.get(ev.sourceIp) : undefined;
    const riskScore = await scoreEvent(ev);

    rows.push({
      ...ev,
      geoCountry: geo?.country ?? null,
      geoCity: geo?.city ?? null,
      geoLat: geo?.lat ?? null,
      geoLon: geo?.lon ?? null,
      riskScore,
      status: ev.status === "failed" ? "failed" : isSuspicious(riskScore) ? "suspicious" : ev.status,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ received: 0, organizationId: wk.organizationId });
  }

  const inserted = await db.insert(securityEvent).values(rows).returning({ id: securityEvent.id });

  // Invalidate Redis cache for this org (non-blocking)
  invalidate(`org:${wk.organizationId}:*`).catch(() => {});

  return NextResponse.json({ received: inserted.length, organizationId: wk.organizationId });
}
