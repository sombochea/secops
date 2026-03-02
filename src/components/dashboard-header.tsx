"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, LogOut, Info, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

export function DashboardHeader({ userName }: { userName: string }) {
  const router = useRouter();
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none">SecOps Center</h1>
              <p className="text-xs text-muted-foreground mt-1">Security Operations Dashboard</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">
                    {userName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline">{userName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAboutOpen(true)}>
                <Info className="mr-2 h-4 w-4" />
                About
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              SecOps Center
            </DialogTitle>
            <DialogDescription>
              Security Operations Center Dashboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              A real-time security operations dashboard for monitoring, tracking, and responding to
              security events across your infrastructure. Built for security admins and ops teams
              who need fast visibility and quick mitigation tools.
            </p>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Built by</span>
                <a
                  href="https://github.com/sombochea"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Sambo Chea <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Source</span>
                <a
                  href="https://github.com/sombochea/secops"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  sombochea/secops <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Stack</span>
                <span>Next.js · Drizzle · ShadCN · Better Auth</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">License</span>
                <span>MIT — Free to use &amp; customize</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              © {new Date().getFullYear()} Sambo Chea. All rights reserved.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
