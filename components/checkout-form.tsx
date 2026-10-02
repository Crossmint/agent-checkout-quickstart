"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, ShoppingBag } from "lucide-react";

// The example prompt — one instruction per line so it reads as a structured
// list. Payment *method* can be set here (e.g. "pay by card"), but never card
// details: when the agent is ready to pay it sends a typed payment request,
// which this app authorizes with an order intent on the buyer's saved card.
const EXAMPLE_REQUEST = [
  "buy size M",
  "pay by card",
  "cheapest delivery",
  "billing same as shipping",
].join("\n");

export function CheckoutForm({
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  // Step 2 only collects the URL + task (+ optional merchant guidance).
  // The buyer profile (step 1) and a very high max cost are added by the caller
  // when it creates the checkout.
  onSubmit: (startUrl: string, task: string, merchantGuidance: string) => void;
  onBack: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const [targetUrl, setTargetUrl] = useState("");
  const [request, setRequest] = useState(EXAMPLE_REQUEST);
  const [merchantGuidance, setMerchantGuidance] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(targetUrl, request, merchantGuidance);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Product URL" hint="The page the agent should check out from.">
        <input
          type="url"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://merchant.com/products/some-item"
          className={inputClass}
        />
      </Field>

      <Field
        label="Buyer request"
        hint="One instruction per line — the more you spell out, the fewer questions the agent asks."
      >
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={4}
          maxLength={4000}
          className={`${inputClass} resize-none font-mono text-[13px] leading-relaxed`}
        />
      </Field>

      {/* Merchant context — optional, tucked into an expander since most standard
          stores don't need it. */}
      <details className="group rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[#FAFAFA]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-[#00150d] [&::-webkit-details-marker]:hidden">
          <span>
            Merchant context <span className="font-normal text-[#00150d]/45">— optional</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#00150d]/40 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-[rgba(0,0,0,0.08)] px-3 py-3">
          <p className="text-xs leading-relaxed text-[#00150d]/55">
            Only for <span className="font-medium text-[#00150d]/75">unusual checkouts</span> — a
            site with no cart, its own button labels, or a non-obvious path to pay (paying a bill
            or invoice, say). For a normal add-to-cart → checkout store, leave this blank; the
            agent already knows that pattern.
          </p>
          <p className="text-xs leading-relaxed text-[#00150d]/55">
            Where the request says <em>what</em> to buy or pay, this says{" "}
            <em>exactly what to click</em> on this site — name the buttons and the order of
            steps, like briefing someone doing it for the first time.
          </p>
          <textarea
            value={merchantGuidance}
            onChange={(e) => setMerchantGuidance(e.target.value)}
            rows={4}
            maxLength={20000}
            placeholder={
              "e.g. This is a medical bill portal — there is no cart.\n" +
              "Enter the account number in the 'Account #' field, then click 'Look up balance'.\n" +
              "Click 'Pay now', choose 'Pay full balance', then continue to the payment form."
            }
            className={`${inputClass} resize-none`}
          />
        </div>
      </details>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm text-[#00150d]/70 transition-colors hover:bg-black/[0.03] disabled:opacity-50"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Starting checkout…
            </>
          ) : (
            <>
              <ShoppingBag className="size-4" /> Start checkout
            </>
          )}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#00150d]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#00150d]/45">{hint}</span>}
    </label>
  );
}
