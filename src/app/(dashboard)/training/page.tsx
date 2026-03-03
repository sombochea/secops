import { requireAuth } from "@/lib/proxy";
import { SocTraining } from "@/components/soc-training";

export default async function TrainingPage() {
  const session = await requireAuth();
  return <SocTraining userName={session.user.name} />;
}
