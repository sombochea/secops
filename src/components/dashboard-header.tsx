"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Shield, LogOut, Info, LayoutDashboard, BookOpen, Settings,
  Building2, Check, ChevronsUpDown, Crosshair, Clock, Search, Menu, Workflow, Activity, GraduationCap,
} from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BUILD_INFO } from "@/lib/build-info";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/hunt", label: "Hunt", icon: Search },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/flowmap", label: "FlowMap", icon: Workflow },
  { href: "/uba", label: "UBA", icon: Activity },
  { href: "/cyberkiller", label: "CyberKiller", icon: Crosshair },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/training", label: "Training", icon: GraduationCap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardHeader({ userName, onAboutClick }: { userName: string; onAboutClick: () => void }) {
  const pathname = usePathname();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: orgs } = authClient.useListOrganizations();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  const handleSwitchOrg = async (orgId: string) => {
    await authClient.organization.setActive({ organizationId: orgId });
    window.location.reload();
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Left: hamburger (mobile) + logo + nav (desktop) */}
        <div className="flex items-center gap-3 md:gap-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4" />SecOps Center
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col py-2">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              {/* Mobile org switcher */}
              {orgs && orgs.length > 0 && currentUserId && (
                <div className="border-t px-4 py-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Organization</p>
                  <div className="space-y-1">
                    {orgs.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => { handleSwitchOrg(org.id); setMobileOpen(false); }}
                        className={cn(
                          "flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs transition-colors",
                          org.id === activeOrg?.id ? "bg-muted font-medium" : "hover:bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {org.id === activeOrg?.id ? <Check className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                        <span className="truncate">{org.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Mobile user actions */}
              <div className="border-t px-4 py-3 mt-auto">
                <button onClick={() => { onAboutClick(); setMobileOpen(false); }} className="flex items-center gap-3 w-full py-2 text-sm text-muted-foreground hover:text-foreground">
                  <Info className="h-4 w-4" />About
                </button>
                <button onClick={() => { setSignOutOpen(true); setMobileOpen(false); }} className="flex items-center gap-3 w-full py-2 text-sm text-muted-foreground hover:text-foreground">
                  <LogOut className="h-4 w-4" />Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-semibold hidden sm:inline">SecOps</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 hidden lg:inline-flex border-yellow-500/50 text-yellow-500">
              {BUILD_INFO.versionLabel}
            </Badge>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-3 text-sm transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{item.label}</span>
                  {active && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: org switcher (desktop) + user menu */}
        <div className="flex items-center gap-2">
          {orgs && orgs.length > 0 && currentUserId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 max-w-[160px] hidden sm:flex">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-xs">{activeOrg?.name ?? "Select org"}</span>
                  <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                {orgs.map((org) => (
                  <DropdownMenuItem key={org.id} onClick={() => handleSwitchOrg(org.id)} className="gap-2">
                    {org.id === activeOrg?.id ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5" />}
                    <span className="truncate text-xs">{org.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{userName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline">{userName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAboutClick}><Info className="mr-2 h-4 w-4" />About</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSignOutOpen(true)}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>You will be signed out of your current session. Any unsaved changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
