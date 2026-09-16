"use client";

import { CheckCircle2, XCircle, Ban, ShieldAlert, Clock } from "lucide-react";
import type {
  BlockedCode,
  CheckoutMessage,
  CheckoutView,
  FailureReason,
  Money,
} from "@/lib/agent-checkout-types";

function formatMoney(total?: Money): string | null {
  if (!total) return null;
  return `${total.amount} ${total.currency?.toUpperCase() ?? ""}`.trim();
}

/** Human-readable elapsed time between checkout creation and its terminal moment. */
function formatDuration(fromIso?: string, toIso?: string): string | null {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * The run view has no "ended at" timestamp; the last message (normally the
 * agent's `result`) is the closest thing.
 */
function endTimestamp(messages: CheckoutMessage[]): string | undefined {
  return messages.at(-1)?.createdAt;
}

function ElapsedRow({
  checkout,
  messages,
  label,
}: {
  checkout: CheckoutView;
  messages: CheckoutMessage[];
  label: string;
}) {
  const elapsed = formatDuration(checkout.createdAt, endTimestamp(messages));
  if (!elapsed) return null;
  return (
    <div className="mt-3 flex items-center gap-1.5 text-xs text-[#00150d]/45">
      <Clock className="size-3.5" />
      {label} {elapsed}
    </div>
  );
}

const BLOCKED_COPY: Record<BlockedCode, string> = {
  "policy.max_cost_exceeded": "The order would have cost more than your max.",
  "product.item_unavailable": "The item is out of stock or no longer listed.",
  "product.requested_option_unavailable": "The requested size, colour, or variant isn't available.",
  "merchant.fulfillment_unavailable": "The merchant can't ship to the buyer's address.",
  "merchant.human_verification_required": "The merchant asked for a CAPTCHA or other human check.",
  "merchant.access_blocked": "The merchant blocked the automated browser.",
  "merchant.payment_declined": "The merchant declined the payment.",
  "merchant.checkout_error": "The merchant's checkout returned an error.",
  "merchant.no_safe_path": "The agent found no safe way to complete the purchase.",
};

const FAILURE_COPY: Record<FailureReason, string> = {
  reconciliation_required: "The purchase state is unclear and needs a manual check.",
  cost_limit: "The run hit its cost limit.",
  accounting_unavailable: "Cost accounting was unavailable, so the run stopped.",
  cancelled: "The checkout was cancelled.",
  model_error: "The agent's model returned an error.",
  runtime_error: "Something went wrong while running the agent.",
  browser_session_lost: "The browser session was lost.",
  input_expired: "A requested input expired before it was answered.",
};

/** The agent's closing words, from the last `result` part in the conversation. */
function resultSummary(messages: CheckoutMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const part = messages[i].parts.find((p) => p.type === "result");
    if (part?.type === "result") return part.summary;
  }
  return undefined;
}

export function OutcomeCard({
  checkout,
  messages,
}: {
  checkout: CheckoutView;
  messages: CheckoutMessage[];
}) {
  const result = checkout.result;

  if (checkout.status === "succeeded" && result?.outcome === "succeeded") {
    const receipt = result.purchase.kind === "receipt_captured" ? result.purchase.receipt : null;
    const total = formatMoney(receipt?.total);
    return (
      <div className="rounded-[10px] border border-[#05B959]/30 bg-[#05B959]/[0.06] p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <CheckCircle2 className="size-5 text-[#05B959]" />
          <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#00150d]">
            Purchase complete
          </h3>
        </div>
        <p className="mb-3 text-sm text-[#00150d]/70">{result.summary}</p>
        <dl className="space-y-2 text-sm">
          {total && <Row label="Total" value={total} />}
          {receipt?.merchantOrderId && <Row label="Order ID" value={receipt.merchantOrderId} mono />}
          {!receipt && <Row label="Receipt" value="Confirmed by the merchant, no receipt captured" />}
        </dl>
        <ElapsedRow checkout={checkout} messages={messages} label="Completed in" />
      </div>
    );
  }

  if (checkout.status === "blocked" && result?.outcome === "blocked") {
    return (
      <div className="rounded-[10px] border border-[#f59e0b]/30 bg-amber-50 p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <ShieldAlert className="size-5 text-[#b45309]" />
          <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#00150d]">
            Checkout blocked
          </h3>
        </div>
        <p className="text-sm text-[#00150d]/70">{result.summary || BLOCKED_COPY[result.code]}</p>
        <span className="mt-3 inline-block rounded-full bg-[#b45309]/10 px-2.5 py-1 font-mono text-xs text-[#b45309]">
          {result.code}
        </span>
        <ElapsedRow checkout={checkout} messages={messages} label="Stopped after" />
      </div>
    );
  }

  if (checkout.status === "failed") {
    const reason = checkout.reason;
    return (
      <div className="rounded-[10px] border border-red-500/25 bg-red-50 p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <XCircle className="size-5 text-red-600" />
          <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#00150d]">
            Checkout failed
          </h3>
        </div>
        <p className="text-sm text-[#00150d]/70">
          {resultSummary(messages) ?? (reason ? FAILURE_COPY[reason] : "Something went wrong.")}
        </p>
        {reason && (
          <span className="mt-3 inline-block rounded-full bg-red-500/10 px-2.5 py-1 font-mono text-xs text-red-700">
            {reason}
          </span>
        )}
        <ElapsedRow checkout={checkout} messages={messages} label="Stopped after" />
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
      {result?.outcome === "cancelled" && (
        <p className="mt-2 text-sm text-[#00150d]/70">{result.summary}</p>
      )}
      <ElapsedRow checkout={checkout} messages={messages} label="Stopped after" />
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
