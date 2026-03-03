import { db } from "@/db";
import { securityEvent, webhookKey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { scoreEvent, isSuspicious } from "@/lib/anomaly";
import { geoBatchLookup } from "@/lib/geoip";

export async function POST(req: NextRequest) {
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

  // Batch geo lookup for all unique IPs
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
