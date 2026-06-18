"use client";

import { useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import type { CreateCheckoutInput, PackManifest } from "@/lib/agentic-checkout-types";

export function CheckoutForm({
  onSubmit,
  submitting,
  error,
  packs = [],
}: {
  onSubmit: (input: CreateCheckoutInput) => void;
  submitting: boolean;
  error?: string | null;
  packs?: PackManifest[];
}) {
  const [targetUrl, setTargetUrl] = useState("");
  const [request, setRequest] = useState("buy size M");
  const [maxCostAmount, setMaxCostAmount] = useState("20.00");
  const [maxCostCurrency, setMaxCostCurrency] = useState("USD");
  const [orderRef, setOrderRef] = useState("demo-1");
  const [packId, setPackId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ targetUrl, request, maxCostAmount, maxCostCurrency, orderRef, packId: packId || undefined });
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

      <Field label="Instruction" hint="Natural-language request for the agent (optional, ≤4000 chars).">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="buy size M"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Max cost" hint="Hard spending cap. Required.">
          <input
            type="text"
            inputMode="decimal"
            required
            value={maxCostAmount}
            onChange={(e) => setMaxCostAmount(e.target.value)}
            placeholder="20.00"
            className={inputClass}
          />
        </Field>
        <Field label="Currency" hint="3-letter code.">
          <input
            type="text"
            required
            maxLength={3}
            value={maxCostCurrency}
            onChange={(e) => setMaxCostCurrency(e.target.value.toUpperCase())}
            placeholder="USD"
            className={`${inputClass} uppercase`}
          />
        </Field>
      </div>

      <Field label="Order reference" hint="Stored in metadata for your own bookkeeping (optional).">
        <input
          type="text"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
          placeholder="demo-1"
          className={inputClass}
        />
      </Field>

      {packs.length > 0 && (
        <Field label="Merchant" hint="Optional. Guides the agent with that merchant's saved phases (sent as packId).">
          <select
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">No merchant pack</option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.merchant.displayName} — {pack.merchant.domains[0]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
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
