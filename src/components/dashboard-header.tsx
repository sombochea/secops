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
import { Shield, LogOut, Info, BookOpen } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export function DashboardHeader({ userName, onAboutClick }: { userName: string; onAboutClick: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold leading-none">SecOps Center</h1>
              <p className="text-xs text-muted-foreground mt-1">Security Operations Dashboard</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1 ml-2">
            <Link href="/">
              <Button variant={pathname === "/" ? "secondary" : "ghost"} size="sm" className="text-xs h-8">
                Dashboard
              </Button>
            </Link>
            <Link href="/playbook">
              <Button variant={pathname === "/playbook" ? "secondary" : "ghost"} size="sm" className="text-xs h-8 gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Playbook
              </Button>
            </Link>
          </nav>
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
