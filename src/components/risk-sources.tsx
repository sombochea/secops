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
import { ShieldAlert, Copy, Check, Ban, Terminal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { RiskSource } from "@/lib/types";

interface Props {
  sources?: RiskSource[];
  loading: boolean;
  onSourceClick: (ip: string) => void;
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{copied ? "Copied!" : label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function generateFail2banCommands(sources: RiskSource[]): string {
  return sources
    .map((s) => `sudo fail2ban-client set sshd banip ${s.sourceIp}`)
    .join("\n");
}

function generateIptablesCommands(sources: RiskSource[]): string {
  return sources
    .map((s) => `sudo iptables -A INPUT -s ${s.sourceIp} -j DROP`)
    .join("\n");
}

export function RiskSources({ sources, loading, onSourceClick }: Props) {
  const [copiedAll, setCopiedAll] = useState<"f2b" | "ipt" | null>(null);

  const handleCopyAll = async (type: "f2b" | "ipt") => {
    if (!sources?.length) return;
    const text = type === "f2b" ? generateFail2banCommands(sources) : generateIptablesCommands(sources);
    await copyToClipboard(text);
    setCopiedAll(type);
    setTimeout(() => setCopiedAll(null), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            Highest Risk Sources
          </CardTitle>
          {!!sources?.length && (
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => handleCopyAll("f2b")}
                    >
                      {copiedAll === "f2b" ? <Check className="h-3 w-3 text-emerald-500" /> : <Ban className="h-3 w-3" />}
                      fail2ban
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Copy all fail2ban ban commands</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => handleCopyAll("ipt")}
                    >
                      {copiedAll === "ipt" ? <Check className="h-3 w-3 text-emerald-500" /> : <Terminal className="h-3 w-3" />}
                      iptables
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Copy all iptables drop commands</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && !sources?.length ? (
          <div className="flex h-[180px] items-center justify-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : !sources?.length ? (
          <div className="flex h-[180px] items-center justify-center text-muted-foreground text-sm">
            No threats detected
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((s, i) => (
              <div
                key={s.sourceIp}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500 text-xs font-bold">
                  {i + 1}
                </div>
                <button
                  className="flex-1 min-w-0 space-y-1.5 text-left"
                  onClick={() => onSourceClick(s.sourceIp)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{s.sourceIp}</span>
                    <Badge variant="destructive" className="text-xs shrink-0">
                      {s.count} {s.count === 1 ? "hit" : "hits"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.events.map((e) => (
                      <Badge key={e} variant="outline" className="text-[10px] px-1.5 py-0">
                        {e}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last seen {formatDistanceToNow(new Date(s.lastSeen), { addSuffix: true })}
                  </p>
                </button>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <CopyButton
                    text={`sudo fail2ban-client set sshd banip ${s.sourceIp}`}
                    label="Copy fail2ban ban command"
                  />
                  <CopyButton
                    text={`sudo iptables -A INPUT -s ${s.sourceIp} -j DROP`}
                    label="Copy iptables drop command"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
