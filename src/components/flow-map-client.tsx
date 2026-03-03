"use client";

import dynamic from "next/dynamic";

const SecurityFlowMap = dynamic(() => import("@/components/security-flow-map").then((m) => m.SecurityFlowMap), { ssr: false });

export function FlowMapClient({ userName }: { userName: string }) {
  return <SecurityFlowMap userName={userName} />;
}
