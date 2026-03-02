"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";

type Step = "loading" | "signup" | "login" | "success" | "error";

export default function InvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Try accepting immediately (works if user is already logged in)
  useEffect(() => {
    if (!token) { setStep("error"); setError("No invite token"); return; }

    fetch("/api/invite-links/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setOrgName(d.organizationName ?? "");
          setStep("success");
        } else if (d.needsSignup) {
          if (d.email) { setEmail(d.email); setEmailLocked(true); }
          setStep("signup");
        } else if (d.needsLogin) {
          setStep("login");
          setError(d.error);
        } else {
          setStep("error");
          setError(d.error ?? "Invalid invite");
        }
      })
      .catch(() => { setStep("error"); setError("Network error"); });
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/invite-links/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, email, password }),
    });
    const d = await res.json();

    if (d.ok) {
      setOrgName(d.organizationName ?? "");
      setStep("success");
    } else {
      setError(d.error ?? "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>SecOps Center Invite</CardTitle>
          <CardDescription>You&apos;ve been invited to join an organization</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Validating invite...</p>
            </div>
          )}

          {step === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Create an account to join the organization.
              </p>
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={emailLocked} className={emailLocked ? "bg-muted" : ""} />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Account & Join
              </Button>
            </form>
          )}

          {step === "login" && (
            <div className="space-y-4 text-center">
              <XCircle className="h-8 w-8 text-yellow-500 mx-auto" />
              <p className="text-sm">{error}</p>
              <Button onClick={() => router.push(`/login?redirect=/invite?token=${token}`)} className="w-full">
                Go to Login
              </Button>
            </div>
          )}

          {step === "success" && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <div>
                <p className="text-sm font-medium">You&apos;ve joined{orgName ? ` ${orgName}` : " the organization"}!</p>
                <p className="text-xs text-muted-foreground mt-1">You can now access the dashboard.</p>
              </div>
              <Button onClick={() => router.push("/")} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4 text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => router.push("/")} className="w-full">
                Go to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
