"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Trash2, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WhitelistItem {
  id: string;
  ip: string;
  note: string | null;
  createdAt: string;
}

export function WhitelistManager() {
  const { data, mutate } = useSWR("/api/whitelist", fetcher);
  const [ip, setIp] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const items: WhitelistItem[] = data?.items ?? [];

  const handleAdd = async () => {
    if (!ip.trim()) return;
    setAdding(true);
    await fetch("/api/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: ip.trim(), note: note.trim() || null }),
    });
    setIp("");
    setNote("");
    setAdding(false);
    mutate();
  };

  const handleRemove = async (targetIp: string) => {
    await fetch("/api/whitelist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: targetIp }),
    });
    mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          IP Whitelist
        </CardTitle>
        <CardDescription>
          Whitelisted IPs are excluded from the Highest Risk Sources panel. They still appear in the events table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="IP address (e.g. 192.168.1.1)"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="max-w-[200px]"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="max-w-[200px]"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={!ip.trim() || adding} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No whitelisted IPs yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-medium">{item.ip}</span>
                    {item.note && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{item.note}</Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Added {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleRemove(item.ip)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
