import { requireAuth } from "@/lib/proxy";
import { SettingsPage } from "@/components/settings";

export default async function Settings() {
  const session = await requireAuth();
  return <SettingsPage userName={session.user.name} />;
}
