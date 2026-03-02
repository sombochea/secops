"use client";

import { useState } from "react";
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
import { UserPlus, Trash2, Mail, Shield, Crown } from "lucide-react";

const ROLE_ICONS: Record<string, typeof Shield> = {
  owner: Crown,
  admin: Shield,
  member: Shield,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "text-yellow-500",
  admin: "text-blue-500",
  member: "text-muted-foreground",
};

export function OrgMembers() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

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

  const handleRemove = async (memberId: string) => {
    await authClient.organization.removeMember({ memberIdOrEmail: memberId });
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    await authClient.organization.updateMemberRole({
      memberId,
      role: newRole as "admin" | "member",
    });
  };

  const members = activeOrg.members ?? [];
  const invitations = activeOrg.invitations ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invite Member</CardTitle>
          <CardDescription>
            Invite a team member to <span className="font-medium">{activeOrg.name}</span> by email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
            <Button type="submit" disabled={inviting} className="gap-1.5 shrink-0">
              <UserPlus className="h-3.5 w-3.5" />
              {inviting ? "Inviting..." : "Invite"}
            </Button>
          </form>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

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
                          <Select
                            value={m.role}
                            onValueChange={(v) => handleRoleChange(m.id, v)}
                          >
                            <SelectTrigger className="h-8 w-[110px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleRemove(m.id)}
                          >
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

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Invitations ({invitations.length})</CardTitle>
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
