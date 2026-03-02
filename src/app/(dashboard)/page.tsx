import { requireAuth } from "@/lib/proxy";
import { Dashboard } from "@/components/dashboard";
import { OrgSetupWizard } from "@/components/org-setup-wizard";

export default async function DashboardPage() {
  const session = await requireAuth();

  if (!session.hasOrg) {
    return <OrgSetupWizard userName={session.user.name} />;
  }

  return <Dashboard userName={session.user.name} />;
}
