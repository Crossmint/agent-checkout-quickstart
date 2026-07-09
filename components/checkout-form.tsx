"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, ShoppingBag } from "lucide-react";

// The example prompt — one instruction per line so it reads as a structured
// list. The card is Stripe's TEST card (4242…), a fake number that can't charge
// anyone, so it's safe to show and paste.
const EXAMPLE_REQUEST = [
  "buy size M",
  "pay by card",
  "card 4242 4242 4242 4242",
  "exp 12/34",
  "cvc 123",
  "cheapest delivery",
  "billing same as shipping",
].join("\n");

export function CheckoutForm({
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  // Step 2 only collects the URL + instruction. The buyer profile (step 1) and
  // a very high max cost are added by the caller when it creates the checkout.
  onSubmit: (targetUrl: string, request: string) => void;
  onBack: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const [targetUrl, setTargetUrl] = useState("");
  const [request, setRequest] = useState(EXAMPLE_REQUEST);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(targetUrl, request);
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
          rows={7}
          maxLength={4000}
          className={`${inputClass} resize-none font-mono text-[13px] leading-relaxed`}
        />
        <div className="mt-2 flex gap-2 rounded-[8px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Agent and single-use virtual cards are safe because they are scoped or one-time —
            Visa and Mastercard both put them out of PCI-DSS scope. So paste one of those, or a
            test card (like the Stripe 4242… number above) —{" "}
            <span className="font-medium">never a real card number</span>: this request is sent
            and stored as plain text, not a PCI-compliant field, so a leaked reusable PAN could
            be used to charge the card.
          </span>
        </div>
      </Field>

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
