import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const events = Array.isArray(body) ? body : [body];

  const rows = events.map((e: Record<string, unknown>) => ({
    event: e.event as string,
    status: (e.status as string) ?? null,
    host: (e.host as string) ?? null,
    user: (e.user as string) ?? null,
    ruser: (e.ruser as string) ?? null,
    sourceIp: (e.source_ip as string) ?? null,
    service: (e.service as string) ?? null,
    tty: (e.tty as string) ?? null,
    pamType: (e.pam_type as string) ?? null,
    metadata: e.metadata ?? null,
    timestamp: new Date(e.timestamp as string),
  }));

  const inserted = await db.insert(securityEvent).values(rows).returning({ id: securityEvent.id });

  return NextResponse.json({ received: inserted.length });
}
