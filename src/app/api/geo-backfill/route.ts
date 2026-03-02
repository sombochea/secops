import { db } from "@/db";
import { securityEvent } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { geoBatchLookup } from "@/lib/geoip";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  // Find events with source_ip but no geo data (batch of 100)
  const missing = await db
    .select({ id: securityEvent.id, sourceIp: securityEvent.sourceIp })
    .from(securityEvent)
    .where(
      and(
        eq(securityEvent.organizationId, orgId),
        isNotNull(securityEvent.sourceIp),
        isNull(securityEvent.geoCountry)
      )
    )
    .limit(100);

  if (!missing.length) {
    return NextResponse.json({ updated: 0, remaining: 0 });
  }

  const ips = [...new Set(missing.map((e) => e.sourceIp!))];
  const geoMap = await geoBatchLookup(ips);

  let updated = 0;
  for (const event of missing) {
    const geo = geoMap.get(event.sourceIp!);
    if (geo?.country) {
      await db
        .update(securityEvent)
        .set({
          geoCountry: geo.country,
          geoCity: geo.city,
          geoLat: geo.lat,
          geoLon: geo.lon,
        })
        .where(eq(securityEvent.id, event.id));
      updated++;
    }
  }

  // Count remaining
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(securityEvent)
    .where(
      and(
        eq(securityEvent.organizationId, orgId),
        isNotNull(securityEvent.sourceIp),
        isNull(securityEvent.geoCountry)
      )
    );

  return NextResponse.json({ updated, remaining: count });
}
