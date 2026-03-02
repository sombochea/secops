"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Terminal, Copy, Check, Play, Info } from "lucide-react";

interface Command {
  label: string;
  command: string;
  description: string;
}

interface Props {
  commands: Command[];
  tipTitle: string;
}

function CommandBlock({ cmd }: { cmd: Command }) {
  const [copied, setCopied] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cmd.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{cmd.label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowOutput(!showOutput)}>
                  <Info className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Toggle description</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="px-3 py-2.5 bg-background">
        <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed text-foreground">
          <span className="text-emerald-500 select-none">$ </span>{cmd.command}
        </pre>
      </div>
      {showOutput && (
        <div className="px-3 py-2 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground leading-relaxed">{cmd.description}</p>
        </div>
      )}
    </div>
  );
}

export function CommandPlayground({ commands, tipTitle }: Props) {
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = async () => {
    const text = commands.map((c) => `# ${c.label}\n${c.command}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Play className="h-4 w-4 text-emerald-500" />
            Interactive Playground
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{commands.length} commands</Badge>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopyAll}>
              {copiedAll ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              Copy all
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Commands related to: {tipTitle}. Copy and run on your server to apply or verify.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ Review each command before running. Some commands modify system configuration and require root access.
          </p>
        </div>
        {commands.map((cmd, i) => (
          <CommandBlock key={i} cmd={cmd} />
        ))}
      </CardContent>
    </Card>
  );
}
