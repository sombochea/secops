import { requireAuth } from "@/lib/proxy";
import { UserBehaviorAnalytics } from "@/components/user-behavior-analytics";

export default async function UBAPage() {
  const session = await requireAuth();
  return <UserBehaviorAnalytics userName={session.user.name} />;
}
