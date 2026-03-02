import { db } from "@/db";
import { whitelistedIp } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSessionOrg() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;
  return { userId: session.user.id, orgId };
}

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await db
    .select()
    .from(whitelistedIp)
    .where(eq(whitelistedIp.organizationId, ctx.orgId))
    .orderBy(whitelistedIp.createdAt);

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ip, note } = await req.json();
  if (!ip || typeof ip !== "string") {
    return NextResponse.json({ error: "IP required" }, { status: 400 });
  }

  const [item] = await db
    .insert(whitelistedIp)
    .values({ organizationId: ctx.orgId, ip: ip.trim(), note: note || null, createdBy: ctx.userId })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ip } = await req.json();
  if (!ip) return NextResponse.json({ error: "IP required" }, { status: 400 });

  await db
    .delete(whitelistedIp)
    .where(and(eq(whitelistedIp.organizationId, ctx.orgId), eq(whitelistedIp.ip, ip)));

  return NextResponse.json({ ok: true });
}
