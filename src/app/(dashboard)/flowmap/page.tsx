import { requireAuth } from "@/lib/proxy";
import { FlowMapClient } from "@/components/flow-map-client";

export default async function FlowMapPage() {
  const session = await requireAuth();
  return <FlowMapClient userName={session.user.name} />;
}
