"use client";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, LogOut, Info, LayoutDashboard, BookOpen, Settings } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardHeader({ userName, onAboutClick }: { userName: string; onAboutClick: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-semibold hidden sm:inline">SecOps</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 hidden sm:inline-flex border-yellow-500/50 text-yellow-500">
              Alpha
            </Badge>
          </Link>
          <nav className="flex items-center">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-3 text-sm transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: user menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm hidden sm:inline">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAboutClick}>
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
  );
}
