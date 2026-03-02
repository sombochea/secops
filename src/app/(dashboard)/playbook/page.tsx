import { requireAuth } from "@/lib/proxy";
import { PlaybookPage } from "@/components/playbook";

export default async function Playbook() {
  const session = await requireAuth();
  return <PlaybookPage userName={session.user.name} />;
}
