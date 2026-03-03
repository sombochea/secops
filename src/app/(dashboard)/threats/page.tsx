import { requireAuth } from "@/lib/proxy";
import { ThreatIntelDashboard } from "@/components/threat-intel-dashboard";

export default async function ThreatsPage() {
  const session = await requireAuth();
  return <ThreatIntelDashboard userName={session.user.name} />;
}
