"use client";

import { useState } from "react";
import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserPlus, Trash2, Mail, Shield, Crown, Link2, Copy, Check, Clock } from "lucide-react";
import { formatRelative } from "@/lib/format-date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ROLE_ICONS: Record<string, typeof Shield> = { owner: Crown, admin: Shield, member: Shield };
const ROLE_COLORS: Record<string, string> = { owner: "text-yellow-500", admin: "text-blue-500", member: "text-muted-foreground" };

export function OrgMembers() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: linksData, mutate: mutateLinks } = useSWR(activeOrg ? "/api/invite-links" : null, fetcher);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!activeOrg) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Select an organization first to manage members.
        </CardContent>
      </Card>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setInviting(true);
    setError("");
    const { error } = await authClient.organization.inviteMember({
      email,
      role: role as "admin" | "member",
    });
    if (error) {
      setError(error.message ?? "Failed to invite");
    } else {
      setEmail("");
    }
    setInviting(false);
  };

  const handleCreateLink = async () => {
    setInviting(true);
    setError("");
    const res = await fetch("/api/invite-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, email: email || undefined }),
    });
    if (res.ok) {
      setEmail("");
      mutateLinks();
    } else {
      setError("Failed to create invite link");
    }
    setInviting(false);
  };

  const handleDeleteLink = async (id: string) => {
    await fetch("/api/invite-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    mutateLinks();
  };

  const copyLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/invite?token=${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRemove = async (memberId: string) => {
    await authClient.organization.removeMember({ memberIdOrEmail: memberId });
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    await authClient.organization.updateMemberRole({ memberId, role: newRole as "admin" | "member" });
  };

  const members = activeOrg.members ?? [];
  const invitations = activeOrg.invitations ?? [];
  const inviteLinks = (linksData?.links ?? []) as Array<{
    id: string; token: string; role: string; email: string | null;
    usedAt: string | null; usedBy: string | null; expiresAt: string; createdAt: string;
  }>;

  return (
    <div className="space-y-6">
      {/* Invite */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invite Member</CardTitle>
          <CardDescription>
            Invite by email or generate a one-time invite link to share directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="Email (optional for link)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleInvite} disabled={inviting || !email} className="gap-1.5" variant="outline">
              <Mail className="h-3.5 w-3.5" />
              Send Email Invite
            </Button>
            <Button onClick={handleCreateLink} disabled={inviting} className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Generate Invite Link
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Invite Links */}
      {inviteLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invite Links ({inviteLinks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inviteLinks.map((link) => {
                const used = !!link.usedAt;
                const expired = new Date(link.expiresAt) < new Date();
                return (
                  <div key={link.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono truncate max-w-[180px]">{link.token.slice(0, 16)}…</code>
                          <Badge variant="outline" className="text-[10px] capitalize">{link.role}</Badge>
                          {used && <Badge variant="secondary" className="text-[10px]">Used</Badge>}
                          {expired && !used && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                          {!used && !expired && <Badge className="text-[10px] bg-emerald-500/15 text-emerald-500">Active</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {link.email ? `For ${link.email} · ` : ""}
                          Created {formatRelative(link.createdAt)}
                          {!used && !expired && ` · Expires ${formatRelative(link.expiresAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!used && !expired && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(link.token, link.id)}>
                                {copiedId === link.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Copy invite link</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteLink(link.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {!members.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const RoleIcon = ROLE_ICONS[m.role] ?? Shield;
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{m.user.name}</p>
                        <p className="text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.role === "owner" ? (
                        <Badge variant="outline" className="gap-1">
                          <RoleIcon className={`h-3 w-3 ${ROLE_COLORS[m.role]}`} />
                          Owner
                        </Badge>
                      ) : (
                        <>
                          <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                            <SelectTrigger className="h-8 w-[110px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemove(m.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Email Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Email Invitations ({invitations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{inv.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{inv.role} · {inv.status}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => authClient.organization.cancelInvitation({ invitationId: inv.id })}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
