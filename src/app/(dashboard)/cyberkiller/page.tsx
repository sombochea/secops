import { requireAuth } from "@/lib/proxy";
import { CyberKillerView } from "@/components/cyberkiller";

export default async function CyberKillerPage() {
  await requireAuth();
  return <CyberKillerView />;
}
