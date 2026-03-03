import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

/** Returns verified orgId or null. Use in API routes. */
export async function getVerifiedOrg(): Promise<{ session: Awaited<ReturnType<typeof auth.api.getSession>>; orgId: string | null }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, orgId: null };

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return { session, orgId: null };

  // Verify membership
  const [valid] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, orgId)))
    .limit(1);

  return { session, orgId: valid ? orgId : null };
}
