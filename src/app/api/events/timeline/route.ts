import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, or, gte, lte, desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const url = req.nextUrl;
  const eventId = url.searchParams.get("id");
  const windowMin = Math.min(Math.max(parseInt(url.searchParams.get("window") ?? "30"), 5), 1440);

  if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  // Fetch the pivot event
  const [pivot] = await db
    .select()
    .from(securityEvent)
    .where(and(eq(securityEvent.id, eventId), eq(securityEvent.organizationId, orgId)));

  if (!pivot) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Build time window around the pivot
  const pivotTime = new Date(pivot.timestamp!);
  const from = new Date(pivotTime.getTime() - windowMin * 60 * 1000);
  const to = new Date(pivotTime.getTime() + windowMin * 60 * 1000);

  // Find related events: same source_ip, host, or user within the window
  const correlations = [];
  if (pivot.sourceIp) correlations.push(eq(securityEvent.sourceIp, pivot.sourceIp));
  if (pivot.host) correlations.push(eq(securityEvent.host, pivot.host));
  if (pivot.user) correlations.push(eq(securityEvent.user, pivot.user));

  if (correlations.length === 0) {
    return NextResponse.json({ pivot, events: [pivot], window: windowMin });
  }

  const events = await db
    .select()
    .from(securityEvent)
    .where(
      and(
        eq(securityEvent.organizationId, orgId),
        gte(securityEvent.timestamp, from),
        lte(securityEvent.timestamp, to),
        or(...correlations),
      ),
    )
    .orderBy(desc(securityEvent.timestamp))
    .limit(200);

  // Summary: count by correlation dimension
  const summary = {
    byIp: pivot.sourceIp
      ? events.filter((e) => e.sourceIp === pivot.sourceIp).length
      : 0,
    byHost: pivot.host
      ? events.filter((e) => e.host === pivot.host).length
      : 0,
    byUser: pivot.user
      ? events.filter((e) => e.user === pivot.user).length
      : 0,
  };

  return NextResponse.json({ pivot, events, summary, window: windowMin });
}
