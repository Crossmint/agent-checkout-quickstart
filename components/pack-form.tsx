"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Store } from "lucide-react";
import type { CreatePackInput, PackPhases } from "@/lib/agentic-checkout-types";

// One editable phase row. `id` becomes the key in the `phases` record, so it
// must be unique, non-empty, and snake_case (the API enforces the last part).
type PhaseDraft = {
  id: string;
  applicability: string;
  instructions: string;
  description: string;
};

const STARTER_PHASES: PhaseDraft[] = [
  {
    id: "add_to_cart",
    applicability: "On a product page, before anything is in the cart.",
    instructions: "Select the requested size and colour, then add the item to the cart.",
    description: "Add the product to the cart",
  },
  {
    id: "checkout",
    applicability: "Once the cart has the right item and it's time to pay.",
    instructions:
      "Proceed to checkout. Ask the buyer for shipping and payment details — never invent them.",
    description: "Drive the checkout flow",
  },
];

export function PackForm({
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  onSubmit: (input: CreatePackInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const [displayName, setDisplayName] = useState("Acme Store");
  const [domains, setDomains] = useState("acme.com");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [phases, setPhases] = useState<PhaseDraft[]>(STARTER_PHASES);
  const [localError, setLocalError] = useState<string | null>(null);

  const updatePhase = (i: number, patch: Partial<PhaseDraft>) =>
    setPhases((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const addPhase = () =>
    setPhases((prev) => [...prev, { id: "", applicability: "", instructions: "", description: "" }]);

  const removePhase = (i: number) => setPhases((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const domainList = domains
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    if (domainList.length === 0) {
      setLocalError("Add at least one merchant domain.");
      return;
    }

    // Fold the phase rows into the keyed `phases` record the API expects.
    const phaseRecord: PackPhases = {};
    for (const phase of phases) {
      const id = phase.id.trim();
      if (!id) {
        setLocalError("Every phase needs an id.");
        return;
      }
      if (phaseRecord[id]) {
        setLocalError(`Duplicate phase id: ${id}`);
        return;
      }
      if (!phase.applicability.trim() || !phase.instructions.trim()) {
        setLocalError(`Phase "${id}" needs both applicability and instructions.`);
        return;
      }
      phaseRecord[id] = {
        applicability: phase.applicability.trim(),
        instructions: phase.instructions.trim(),
        ...(phase.description.trim() ? { description: phase.description.trim() } : {}),
      };
    }

    onSubmit({
      ...(description.trim() ? { description: description.trim() } : {}),
      merchant: {
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        displayName: displayName.trim(),
        domains: domainList,
      },
      phases: phaseRecord,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Merchant name" hint="Shown on checkouts this pack drives.">
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Acme Store"
            className={inputClass}
          />
        </Field>
        <Field label="Slug" hint="Optional kebab-case handle.">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="acme-store"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Domains" hint="Comma- or space-separated hostnames (no protocol).">
        <input
          type="text"
          required
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          placeholder="acme.com, checkout.acme.com"
          className={inputClass}
        />
      </Field>

      <Field label="Description" hint="Optional note for your own bookkeeping.">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Default flow for Acme"
          className={inputClass}
        />
      </Field>

      {/* Phases ------------------------------------------------------------ */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-[#00150d]">Phases</span>
          <button
            type="button"
            onClick={addPhase}
            className="flex items-center gap-1 text-xs text-[#05B959] transition-opacity hover:opacity-80"
          >
            <Plus className="size-3.5" /> Add phase
          </button>
        </div>
        <div className="space-y-3">
          {phases.map((phase, i) => (
            <div key={i} className="space-y-2.5 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[#FAFAFA] p-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <PhaseLabel>Phase ID</PhaseLabel>
                  {phases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhase(i)}
                      className="text-[#00150d]/30 transition-colors hover:text-red-500"
                      title="Remove phase"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={phase.id}
                  onChange={(e) => updatePhase(i, { id: e.target.value })}
                  placeholder="add_to_cart"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <PhaseLabel>When it applies</PhaseLabel>
                <textarea
                  value={phase.applicability}
                  onChange={(e) => updatePhase(i, { applicability: e.target.value })}
                  rows={2}
                  placeholder="On a product page, before anything is in the cart."
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div>
                <PhaseLabel>What the agent should do</PhaseLabel>
                <textarea
                  value={phase.instructions}
                  onChange={(e) => updatePhase(i, { instructions: e.target.value })}
                  rows={3}
                  placeholder="Select the requested size and colour, then add the item to the cart."
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {(localError || error) && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{localError ?? error}</div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving merchant…
            </>
          ) : (
            <>
              <Store className="size-4" /> Save merchant
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm text-[#00150d]/70 transition-colors hover:bg-black/[0.03]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";

function PhaseLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#00150d]/40">
      {children}
    </span>
  );
}

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
