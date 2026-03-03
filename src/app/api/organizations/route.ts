import { db } from "@/db";
import { organization, member } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

// List organizations the current user is a member of
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await db
    .select({ orgId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id));

  if (memberships.length === 0) {
    return NextResponse.json({ organizations: [] });
  }

  const orgs = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(inArray(organization.id, memberships.map((m) => m.orgId)));

  return NextResponse.json({ organizations: orgs });
}
