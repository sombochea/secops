import { requireAuth } from "@/lib/proxy";
import { IncidentTimeline } from "@/components/incident-timeline";

export default async function TimelinePage() {
  const session = await requireAuth();
  return <IncidentTimeline userName={session.user.name} />;
}
