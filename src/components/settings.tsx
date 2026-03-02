"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { OrgSwitcher } from "@/components/org-switcher";
import { OrgMembers } from "@/components/org-members";
import { OrgWebhookKeys } from "@/components/org-webhook-keys";
import { WhitelistManager } from "@/components/whitelist-manager";
import { TimezoneSettings } from "@/components/timezone-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Key, ShieldCheck, UserCircle, Globe, Loader2 } from "lucide-react";
import { BUILD_INFO } from "@/lib/build-info";

function GeoBackfill() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ updated: number; remaining: number } | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    const res = await fetch("/api/geo-backfill", { method: "POST" });
    const data = await res.json();
    setResult(data);
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Geo Backfill
        </CardTitle>
        <CardDescription>
          Resolve geolocation for events that were ingested before geo lookup was enabled. Processes 100 events per run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {running ? "Resolving..." : "Run Backfill"}
        </Button>
        {result && (
          <p className="text-sm text-muted-foreground">
            Updated {result.updated} events. {result.remaining > 0 ? `${result.remaining} remaining — run again.` : "All done!"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsPage({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 sm:px-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5">
              <UserCircle className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="organization" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Members
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5">
              <Key className="h-3.5 w-3.5" />
              Webhook Keys
            </TabsTrigger>
            <TabsTrigger value="whitelist" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              IP Whitelist
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <div className="space-y-6">
              <TimezoneSettings />
              <GeoBackfill />
            </div>
          </TabsContent>
          <TabsContent value="organization">
            <OrgSwitcher />
          </TabsContent>
          <TabsContent value="members">
            <OrgMembers />
          </TabsContent>
          <TabsContent value="webhooks">
            <OrgWebhookKeys />
          </TabsContent>
          <TabsContent value="whitelist">
            <WhitelistManager />
          </TabsContent>
        </Tabs>
      </main>
      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground">
          SecOps {BUILD_INFO.versionLabel} · Built by{" "}
          <button className="text-primary hover:underline" onClick={() => setAboutOpen(true)}>
            Sambo Chea
          </button>
        </p>
      </footer>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
