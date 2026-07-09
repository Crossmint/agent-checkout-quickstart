"use client";

import { Loader2, Clock, Bot, Hand, CheckCircle2, XCircle, Ban } from "lucide-react";
import type { CheckoutStatus } from "@/lib/agent-checkout-types";

const CONFIG: Record<
  CheckoutStatus,
  { label: string; icon: typeof Loader2; spin?: boolean; fg: string; bg: string }
> = {
  queued: { label: "Queued", icon: Clock, fg: "#8a6d00", bg: "rgba(234,179,8,0.12)" },
  running: { label: "Agent working", icon: Bot, spin: false, fg: "#2377FF", bg: "rgba(35,119,255,0.1)" },
  awaiting_user_action: { label: "Needs your input", icon: Hand, fg: "#b45309", bg: "rgba(245,158,11,0.14)" },
  succeeded: { label: "Succeeded", icon: CheckCircle2, fg: "#05B959", bg: "rgba(5,185,89,0.12)" },
  failed: { label: "Failed", icon: XCircle, fg: "#dc2626", bg: "rgba(220,38,38,0.1)" },
  cancelled: { label: "Cancelled", icon: Ban, fg: "#6d6d6d", bg: "rgba(0,0,0,0.06)" },
};

export function StatusBadge({ status }: { status: CheckoutStatus }) {
  const c = CONFIG[status];
  const Icon = c.icon;
  const animate = status === "queued" || status === "running";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: c.fg, backgroundColor: c.bg }}
    >
      {animate ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Icon className="size-3" />
      )}
      {c.label}
    </span>
  );
}
