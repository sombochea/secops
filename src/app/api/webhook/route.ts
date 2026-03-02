import { db } from "@/db";
import { securityEvent, webhookKey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { scoreEvent, isSuspicious } from "@/lib/anomaly";

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

  const rows = [];
  for (const e of events) {
    const parsed = {
      organizationId: wk.organizationId,
      event: e.event as string,
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
      timestamp: new Date(e.timestamp as string),
    };

    const riskScore = await scoreEvent(parsed);

    rows.push({
      ...parsed,
      riskScore,
      // Mark as suspicious if score exceeds threshold and not already failed
      status: parsed.status === "failed" ? "failed" : isSuspicious(riskScore) ? "suspicious" : parsed.status,
    });
  }

  const inserted = await db.insert(securityEvent).values(rows).returning({ id: securityEvent.id });

  return NextResponse.json({ received: inserted.length, organizationId: wk.organizationId });
}
