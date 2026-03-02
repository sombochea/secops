"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { OrgSwitcher } from "@/components/org-switcher";
import { OrgMembers } from "@/components/org-members";
import { OrgWebhookKeys } from "@/components/org-webhook-keys";
import { WhitelistManager } from "@/components/whitelist-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Key, ShieldCheck } from "lucide-react";

export function SettingsPage({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 sm:px-6">
        <Tabs defaultValue="organization" className="space-y-6">
          <TabsList>
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
          Built by{" "}
          <button className="text-primary hover:underline" onClick={() => setAboutOpen(true)}>
            Sambo Chea
          </button>
        </p>
      </footer>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
