import { requireAuth } from "@/lib/proxy";
import { Dashboard } from "@/components/dashboard";

export default async function DashboardPage() {
  const session = await requireAuth();

  return <Dashboard userName={session.user.name} />;
}
