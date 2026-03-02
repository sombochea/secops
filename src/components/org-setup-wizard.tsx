"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, Key, ArrowRight, Check, Copy, Loader2 } from "lucide-react";

type Step = "org" | "webhook" | "done";

export function OrgSetupWizard({ userName }: { userName: string }) {
  const [step, setStep] = useState<Step>("org");
  const [orgName, setOrgName] = useState("");
  const [keyName, setKeyName] = useState("default");
  const [webhookKey, setWebhookKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check if user already has orgs they can activate
  const { data: orgs } = authClient.useListOrganizations();

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    setError("");
    const autoSlug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await authClient.organization.create({ name: orgName.trim(), slug: autoSlug });
    if (error) {
      setError(error.message ?? "Failed to create organization");
      setLoading(false);
      return;
    }
    setStep("webhook");
    setLoading(false);
  };

  const handleSelectOrg = async (orgId: string) => {
    setLoading(true);
    await authClient.organization.setActive({ organizationId: orgId });
    setStep("webhook");
    setLoading(false);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/webhook-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create key");
      setLoading(false);
      return;
    }
    setWebhookKey(data.key.key);
    setStep("done");
    setLoading(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Welcome to SecOps Center</h1>
          <p className="text-sm text-muted-foreground">
            Hi {userName}, let&apos;s set up your security operations workspace.
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2">
          {[
            { key: "org", label: "Organization" },
            { key: "webhook", label: "Webhook" },
            { key: "done", label: "Ready" },
          ].map((s, i) => {
            const isActive = s.key === step;
            const isDone =
              (s.key === "org" && (step === "webhook" || step === "done")) ||
              (s.key === "webhook" && step === "done");
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-8 bg-border" />}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={`text-xs ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Step 1: Create or select org */}
        {step === "org" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5" />
                Set Up Organization
              </CardTitle>
              <CardDescription>
                Create an organization to scope your security events and collaborate with your team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleCreateOrg} className="space-y-3">
                <Input
                  placeholder="Organization name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full gap-1.5" disabled={loading || !orgName.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Create &amp; Continue
                </Button>
              </form>

              {!!orgs?.length && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted-foreground">or select existing</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {orgs.map((org) => (
                      <button
                        key={org.id}
                        className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => handleSelectOrg(org.id)}
                        disabled={loading}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{org.name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">{org.slug}</Badge>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Create webhook key */}
        {step === "webhook" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-5 w-5" />
                Create Webhook Key
              </CardTitle>
              <CardDescription>
                Generate a webhook key to start ingesting security events from your servers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateKey} className="space-y-3">
                <Input
                  placeholder="Key name (e.g., prod-server-01)"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                  Generate Key
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Check className="h-5 w-5 text-emerald-500" />
                You&apos;re All Set!
              </CardTitle>
              <CardDescription>
                Your webhook key is ready. Use it to send security events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Your webhook key:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">
                    {webhookKey}
                  </code>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground mb-2">Send a test event:</p>
                <pre className="text-[11px] font-mono overflow-x-auto leading-relaxed">
{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/webhook \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: ${webhookKey}" \\
  -d '{"event":"ssh_attempt","status":"failed",
  "auth_method":"invalid_user","host":"server-01",
  "user":"root","source_ip":"203.0.113.42",
  "service":"sshd",
  "timestamp":"${new Date().toISOString()}"}'`}
                </pre>
              </div>

              <Button className="w-full gap-1.5" onClick={() => window.location.href = "/"}>
                <ArrowRight className="h-4 w-4" />
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
