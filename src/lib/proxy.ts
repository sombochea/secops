import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member, session as sessionTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let activeOrgId = session.session.activeOrganizationId;

  // ALWAYS verify the user is a member of the active org
  if (activeOrgId) {
    const [valid] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrgId)))
      .limit(1);

    if (!valid) {
      // User is NOT a member of this org — clear it
      activeOrgId = null;
      await db
        .update(sessionTable)
        .set({ activeOrganizationId: null })
        .where(eq(sessionTable.id, session.session.id));
    }
  }

  // If no valid active org, auto-activate first membership
  if (!activeOrgId) {
    const [membership] = await db
      .select({ orgId: member.organizationId })
      .from(member)
      .where(eq(member.userId, session.user.id))
      .limit(1);

    if (membership) {
      activeOrgId = membership.orgId;
      await db
        .update(sessionTable)
        .set({ activeOrganizationId: activeOrgId })
        .where(eq(sessionTable.id, session.session.id));
    }
  }

  session.session.activeOrganizationId = activeOrgId;
  const hasOrg = !!activeOrgId;
  return { ...session, hasOrg };
}
