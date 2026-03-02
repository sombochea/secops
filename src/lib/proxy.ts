import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const hasOrg = !!session.session.activeOrganizationId;

  return { ...session, hasOrg };
}
