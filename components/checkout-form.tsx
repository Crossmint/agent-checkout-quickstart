"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";

// The example prompt — one instruction per line so it reads as a structured
// list. Payment *method* can be set here (e.g. "pay by card"), but the card
// details themselves aren't accepted in the request yet: the agent prompts for
// them during checkout (step 3).
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
          rows={4}
          maxLength={4000}
          className={`${inputClass} resize-none font-mono text-[13px] leading-relaxed`}
        />
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
