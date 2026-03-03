import { requireAuth } from "@/lib/proxy";
import { ThreatHunting } from "@/components/threat-hunting";

export default async function HuntPage() {
  const session = await requireAuth();
  return <ThreatHunting userName={session.user.name} />;
}
