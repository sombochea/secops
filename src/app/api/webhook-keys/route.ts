import { db } from "@/db";
import { webhookKey } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function generateKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = Array.from({ length: 4 }, () =>
    Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
  return `whk_${segments.join("_")}`;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ keys: [] });

  const keys = await db
    .select()
    .from(webhookKey)
    .where(eq(webhookKey.organizationId, orgId))
    .orderBy(desc(webhookKey.createdAt));

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const [key] = await db
    .insert(webhookKey)
    .values({
      organizationId: orgId,
      name,
      key: generateKey(),
      createdBy: session.user.id,
    })
    .returning();

  return NextResponse.json({ key });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const { id } = await req.json();
  await db
    .delete(webhookKey)
    .where(and(eq(webhookKey.id, id), eq(webhookKey.organizationId, orgId)));

  return NextResponse.json({ ok: true });
}
