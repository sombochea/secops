import { db } from "@/db";
import { inviteLink, user, account, member, organization } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const { token, name, email, password } = await req.json();

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Find valid, unused invite link
  const [link] = await db
    .select()
    .from(inviteLink)
    .where(and(eq(inviteLink.token, token), isNull(inviteLink.usedAt)));

  if (!link) {
    return NextResponse.json({ error: "Invalid or already used invite link" }, { status: 400 });
  }

  if (new Date() > link.expiresAt) {
    return NextResponse.json({ error: "Invite link has expired" }, { status: 400 });
  }

  // If email was pinned on the link, enforce it
  if (link.email && email && link.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "This invite is for a different email" }, { status: 400 });
  }

  const targetEmail = (link.email || email || "").toLowerCase().trim();
  if (!targetEmail) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // Check if user is already logged in
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

  let userId: string;

  if (session) {
    // Logged-in user — just add them to the org
    userId = session.user.id;
  } else {
    // Check if account exists
    const [existing] = await db.select().from(user).where(eq(user.email, targetEmail));

    if (existing) {
      // Account exists but not logged in — they need to log in first
      return NextResponse.json({
        error: "Account exists. Please log in first, then use the invite link.",
        needsLogin: true,
      }, { status: 401 });
    }

    // Auto-create account
    if (!name || !password) {
      return NextResponse.json({
        error: "Name and password required for new account",
        needsSignup: true,
        email: link.email || undefined,
      }, { status: 400 });
    }

    // Use Better Auth's signup to create the account properly
    const signupResult = await auth.api.signUpEmail({
      body: { name, email: targetEmail, password },
    });

    if (!signupResult?.user?.id) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    userId = signupResult.user.id;
  }

  // Check if already a member
  const [existingMember] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, link.organizationId), eq(member.userId, userId)));

  if (existingMember) {
    // Mark link as used even if already a member
    await db.update(inviteLink).set({ usedBy: userId, usedAt: new Date() }).where(eq(inviteLink.id, link.id));
    return NextResponse.json({ ok: true, alreadyMember: true });
  }

  // Add as member
  await db.insert(member).values({
    id: randomBytes(16).toString("hex"),
    organizationId: link.organizationId,
    userId,
    role: link.role,
  });

  // Mark link as used
  await db.update(inviteLink).set({ usedBy: userId, usedAt: new Date() }).where(eq(inviteLink.id, link.id));

  // Get org name for response
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, link.organizationId));

  return NextResponse.json({ ok: true, organizationName: org?.name });
}
