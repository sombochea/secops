import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            SecOps Center
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-yellow-500/50 text-yellow-500">
              v0.1.0-alpha
            </Badge>
          </DialogTitle>
          <DialogDescription>Security Operations Center Dashboard</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            A real-time security operations dashboard for monitoring, tracking, and responding to
            security events across your infrastructure. Built for security admins and ops teams
            who need fast visibility and quick mitigation tools.
          </p>
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Version</span>
              <span>0.1.0-alpha</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Built by</span>
              <a href="https://github.com/sombochea" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Sambo Chea <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Source</span>
              <a href="https://github.com/sombochea/secops" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                sombochea/secops <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Stack</span>
              <span>Next.js · Drizzle · ShadCN · Better Auth</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">License</span>
              <span>MIT — Free to use &amp; customize</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} Sambo Chea. All rights reserved.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
