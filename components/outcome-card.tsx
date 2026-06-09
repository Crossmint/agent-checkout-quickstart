"use client";

import { CheckCircle2, XCircle, Ban, ExternalLink } from "lucide-react";
import type { CheckoutView, Money } from "@/lib/agentic-checkout-types";

function formatMoney(total?: Money | string): string | null {
  if (!total) return null;
  if (typeof total === "string") return total;
  return `${total.amount} ${total.currency?.toUpperCase() ?? ""}`.trim();
}

const FAILURE_COPY: Record<string, string> = {
  max_cost_exceeded: "The order would have cost more than your max.",
  user_cancelled: "The checkout was cancelled.",
  user_action_expired: "A requested action expired before it was answered.",
  automation_failed: "The agent couldn't complete the checkout.",
};

export function OutcomeCard({ checkout }: { checkout: CheckoutView }) {
  if (checkout.status === "succeeded") {
    const receipt = checkout.receipt;
    const total = formatMoney(receipt?.total);
    return (
      <div className="rounded-[10px] border border-[#05B959]/30 bg-[#05B959]/[0.06] p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <CheckCircle2 className="size-5 text-[#05B959]" />
          <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#00150d]">
            Purchase complete
          </h3>
        </div>
        <dl className="space-y-2 text-sm">
          {total && <Row label="Total" value={total} />}
          {receipt?.merchantOrderId && <Row label="Order ID" value={receipt.merchantOrderId} mono />}
          {receipt?.capturedAt && (
            <Row label="Captured" value={new Date(receipt.capturedAt).toLocaleString()} />
          )}
          {receipt?.evidence?.confirmationText && (
            <Row label="Confirmation" value={receipt.evidence.confirmationText} />
          )}
        </dl>
        {receipt?.evidence?.confirmationUrl && (
          <a
            href={receipt.evidence.confirmationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#05B959] hover:underline"
          >
            View confirmation <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    );
  }

  if (checkout.status === "failed") {
    const failure = checkout.failure;
    return (
      <div className="rounded-[10px] border border-red-500/25 bg-red-50 p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <XCircle className="size-5 text-red-600" />
          <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#00150d]">
            Checkout failed
          </h3>
        </div>
        <p className="text-sm text-[#00150d]/70">
          {failure?.message ?? (failure ? FAILURE_COPY[failure.reason] : "Something went wrong.")}
        </p>
        {failure?.reason && (
          <span className="mt-3 inline-block rounded-full bg-red-500/10 px-2.5 py-1 font-mono text-xs text-red-700">
            {failure.reason}
          </span>
        )}
      </div>
    );
  }

  // cancelled
  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-[#F6F6F6] p-5">
      <div className="flex items-center gap-2.5">
        <Ban className="size-5 text-[#6d6d6d]" />
        <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#00150d]">
          Checkout cancelled
        </h3>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[#00150d]/50">{label}</dt>
      <dd className={`text-right text-[#00150d] ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
