"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Plus, Check } from "lucide-react";

export function OrgSwitcher() {
  const { data: orgs, isPending: loadingOrgs } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    setCreating(true);
    await authClient.organization.create({ name, slug });
    setName("");
    setSlug("");
    setCreating(false);
  };

  const handleSwitch = async (orgId: string) => {
    await authClient.organization.setActive({ organizationId: orgId });
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Create Organization</CardTitle>
          <CardDescription>Create a new organization to collaborate with your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Organization name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
              }}
              required
            />
            <Input
              placeholder="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="sm:w-[200px] font-mono text-xs"
              required
            />
            <Button type="submit" disabled={creating} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              {creating ? "Creating..." : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your Organizations</CardTitle>
          <CardDescription>Switch between organizations to view their events.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOrgs ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : !orgs?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No organizations yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {orgs.map((org) => {
                const isActive = activeOrg?.id === org.id;
                return (
                  <div
                    key={org.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{org.slug}</p>
                      </div>
                    </div>
                    {isActive ? (
                      <Badge className="gap-1">
                        <Check className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleSwitch(org.id)}>
                        Switch
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
