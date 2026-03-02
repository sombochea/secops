import { db } from "@/db";
import { inviteLink, organization } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

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

  const links = await db
    .select()
    .from(inviteLink)
    .where(eq(inviteLink.organizationId, ctx.orgId))
    .orderBy(desc(inviteLink.createdAt));

  return NextResponse.json({ links });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role = "member", email } = await req.json().catch(() => ({}));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [link] = await db
    .insert(inviteLink)
    .values({
      organizationId: ctx.orgId,
      token,
      role,
      email: email || null,
      expiresAt,
      createdBy: ctx.userId,
    })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await db
    .delete(inviteLink)
    .where(and(eq(inviteLink.id, id), eq(inviteLink.organizationId, ctx.orgId)));

  return NextResponse.json({ ok: true });
}
