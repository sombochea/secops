import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type { SecurityTip } from "@/lib/security-tips";

const SEVERITY_CONFIG = {
  critical: { icon: ShieldAlert, color: "text-red-500", bg: "bg-red-500/10", badge: "destructive" as const },
  high: { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10", badge: "default" as const },
  medium: { icon: ShieldCheck, color: "text-yellow-500", bg: "bg-yellow-500/10", badge: "secondary" as const },
  low: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10", badge: "outline" as const },
};

interface Props {
  tip: SecurityTip;
  expanded?: boolean;
  onClick?: () => void;
}

export function TipCard({ tip, expanded, onClick }: Props) {
  const sev = SEVERITY_CONFIG[tip.severity];
  const Icon = sev.icon;

  if (!expanded) {
    return (
      <Card
        className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
        onClick={onClick}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sev.bg} ${sev.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant={sev.badge} className="text-[10px]">{tip.severity}</Badge>
                <Badge variant="outline" className="text-[10px]">{tip.category}</Badge>
              </div>
              <CardTitle className="text-sm font-medium leading-snug">{tip.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground line-clamp-2">{tip.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {tip.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Expanded view
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${sev.bg} ${sev.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge variant={sev.badge} className="text-xs">{tip.severity}</Badge>
              <Badge variant="outline" className="text-xs">{tip.category}</Badge>
            </div>
            <CardTitle className="text-base">{tip.title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
          <p className="text-sm leading-relaxed">{tip.description}</p>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Impact</h4>
          <p className="text-sm leading-relaxed text-muted-foreground">{tip.impact}</p>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Remediation Steps</h4>
          <ol className="space-y-2">
            {tip.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                <span className="font-mono text-xs leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {tip.references?.length ? (
          <>
            <Separator />
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">References</h4>
              <div className="space-y-1">
                {tip.references.map((ref) => (
                  <a
                    key={ref.url}
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {ref.title}
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap gap-1 pt-1">
          {tip.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
