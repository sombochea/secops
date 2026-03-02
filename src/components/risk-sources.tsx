"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShieldAlert, Copy, Check, Ban, Terminal, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { RiskSource } from "@/lib/types";

interface Props {
  sources?: RiskSource[];
  loading: boolean;
  total?: number;
  onSourceClick: (ip: string) => void;
  onWhitelist: (ip: string) => void;
  whitelistedIps?: string[];
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

function IconBtn({ icon: Icon, label, onClick, disabled, active }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const [done, setDone] = useState(false);
  const handleClick = (e: React.MouseEvent) => {
    onClick(e);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={disabled} onClick={handleClick}>
            {done ? <Check className="h-3 w-3 text-emerald-500" /> : <Icon className={`h-3 w-3 ${active ? "text-emerald-500" : ""}`} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top"><p className="text-xs">{done ? "Done!" : label}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const PAGE_SIZE = 5;

export function RiskSources({ sources, loading, total = 0, onSourceClick, onWhitelist, whitelistedIps = [] }: Props) {
  const [page, setPage] = useState(0);
  const [copiedAll, setCopiedAll] = useState<"f2b" | "ipt" | null>(null);
  const whitelistSet = new Set(whitelistedIps);

  const all = sources ?? [];
  const totalSources = total || all.length;
  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  const visible = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCopyAll = async (type: "f2b" | "ipt") => {
    if (!all.length) return;
    const text = type === "f2b"
      ? all.map((s) => `sudo fail2ban-client set sshd banip ${s.sourceIp}`).join("\n")
      : all.map((s) => `sudo iptables -A INPUT -s ${s.sourceIp} -j DROP`).join("\n");
    await copyToClipboard(text);
    setCopiedAll(type);
    setTimeout(() => setCopiedAll(null), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            Risk Sources
            {totalSources > 0 && (
              <Badge variant="secondary" className="text-[10px] font-normal">{totalSources}</Badge>
            )}
          </CardTitle>
          {!!all.length && (
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px] px-2" onClick={() => handleCopyAll("f2b")}>
                      {copiedAll === "f2b" ? <Check className="h-3 w-3 text-emerald-500" /> : <Ban className="h-3 w-3" />}
                      f2b
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Copy all fail2ban commands</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px] px-2" onClick={() => handleCopyAll("ipt")}>
                      {copiedAll === "ipt" ? <Check className="h-3 w-3 text-emerald-500" /> : <Terminal className="h-3 w-3" />}
                      ipt
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Copy all iptables commands</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading && !all.length ? (
          <div className="flex h-[160px] items-center justify-center text-muted-foreground text-sm">Loading...</div>
        ) : !all.length ? (
          <div className="flex h-[160px] items-center justify-center text-muted-foreground text-sm">No threats detected</div>
        ) : (
          <>
            {visible.map((s, i) => (
              <div
                key={s.sourceIp}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 hover:bg-muted/50 transition-colors text-xs"
              >
                <span className="w-5 text-center text-[10px] font-bold text-red-500">
                  {page * PAGE_SIZE + i + 1}
                </span>
                <button
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  onClick={() => onSourceClick(s.sourceIp)}
                >
                  <span className="font-mono font-medium truncate">{s.sourceIp}</span>
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0">
                    {s.count}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                    {formatDistanceToNow(new Date(s.lastSeen), { addSuffix: true })}
                  </span>
                </button>
                <div className="flex items-center gap-0 shrink-0">
                  <IconBtn
                    icon={Copy}
                    label="Copy fail2ban command"
                    onClick={async (e) => { e.stopPropagation(); await copyToClipboard(`sudo fail2ban-client set sshd banip ${s.sourceIp}`); }}
                  />
                  <IconBtn
                    icon={ShieldCheck}
                    label={whitelistSet.has(s.sourceIp) ? "Already whitelisted" : "Whitelist IP"}
                    disabled={whitelistSet.has(s.sourceIp)}
                    active={whitelistSet.has(s.sourceIp)}
                    onClick={(e) => { e.stopPropagation(); onWhitelist(s.sourceIp); }}
                  />
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, all.length)} of {all.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
