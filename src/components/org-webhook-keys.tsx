"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { WebhookKeyInfo } from "@/lib/types";
import { AppConfig } from "@/lib/config";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function KeyRow({ wk, onDelete }: { wk: WebhookKeyInfo; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(wk.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{wk.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-muted-foreground truncate">
            {visible ? wk.key : `${wk.key.slice(0, 8)}${"•".repeat(24)}`}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(wk.createdAt), { addSuffix: true })}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setVisible(!visible)}>
                {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{visible ? "Hide" : "Reveal"} key</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{copied ? "Copied!" : "Copy key"}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function OrgWebhookKeys() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data, isLoading } = useSWR(activeOrg ? "/api/webhook-keys" : null, fetcher);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  if (!activeOrg) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Select an organization first to manage webhook keys.
        </CardContent>
      </Card>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setCreating(true);
    await fetch("/api/webhook-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    setCreating(false);
    mutate("/api/webhook-keys");
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/webhook-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    mutate("/api/webhook-keys");
  };

  const keys: WebhookKeyInfo[] = data?.keys ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Create Webhook Key</CardTitle>
          <CardDescription>
            Each key generates a unique endpoint for <span className="font-medium">{activeOrg.name}</span>.
            Use the key as the <code className="text-xs bg-muted px-1 py-0.5 rounded">x-webhook-secret</code> header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Key name (e.g., prod-server-01)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={creating} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              {creating ? "Creating..." : "Generate Key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Webhook Keys</CardTitle>
            <Badge variant="secondary" className="text-xs">{keys.length} keys</Badge>
          </div>
          <CardDescription>
            Send events to <code className="text-xs bg-muted px-1 py-0.5 rounded">POST /api/webhook</code> with the key in the header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : !keys.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No webhook keys yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((wk) => (
                <KeyRow key={wk.id} wk={wk} onDelete={() => handleDelete(wk.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Usage Example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto leading-relaxed">
{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : AppConfig.url}/api/webhook \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: YOUR_WEBHOOK_KEY" \\
  -d '{
    "event": "ssh_attempt",
    "status": "failed",
    "auth_method": "invalid_user",
    "host": "prod-server-01",
    "user": "root",
    "source_ip": "203.0.113.42",
    "service": "sshd",
    "timestamp": "${new Date().toISOString()}"
  }'`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
