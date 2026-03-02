"use client";

import { useState, useMemo } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { TipCard } from "@/components/tip-card";
import { CommandPlayground } from "@/components/command-playground";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SECURITY_TIPS, CATEGORIES, type SecurityTip } from "@/lib/security-tips";
import { Search, X, ArrowLeft } from "lucide-react";

export function PlaybookPage({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [selectedTip, setSelectedTip] = useState<SecurityTip | null>(null);

  const filtered = useMemo(() => {
    return SECURITY_TIPS.filter((t) => {
      if (category && t.category !== category) return false;
      if (severity && t.severity !== severity) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q))
        );
      }
      return true;
    });
  }, [search, category, severity]);

  const hasFilters = search || category || severity;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader userName={userName} onAboutClick={() => setAboutOpen(true)} />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 sm:px-6">
        {selectedTip ? (
          <div className="space-y-6">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedTip(null)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to tips
            </Button>
            <TipCard tip={selectedTip} expanded />
            {selectedTip.commands?.length ? (
              <CommandPlayground commands={selectedTip.commands} tipTitle={selectedTip.title} />
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tips, tags..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severity || "all"} onValueChange={(v) => setSeverity(v === "all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{filtered.length} results</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setSearch(""); setCategory(""); setSeverity(""); }}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              </div>
            )}

            {/* Tips grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((tip) => (
                <TipCard key={tip.id} tip={tip} onClick={() => setSelectedTip(tip)} />
              ))}
              {filtered.length === 0 && (
                <p className="col-span-2 text-center py-12 text-muted-foreground text-sm">
                  No tips match your filters.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground">
          Built by{" "}
          <button className="text-primary hover:underline" onClick={() => setAboutOpen(true)}>
            Sambo Chea
          </button>
        </p>
      </footer>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
