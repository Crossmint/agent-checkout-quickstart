"use client";

import { useMemo, useState } from "react";
import { Loader2, Hand, AlertTriangle } from "lucide-react";
import type { JsonSchema, PendingUserAction } from "@/lib/agentic-checkout-types";

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";

function titleFor(key: string, schema: JsonSchema): string {
  if (schema.title) return schema.title;
  // camelCase / snake_case → "Title Case"
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function coerce(schema: JsonSchema, raw: string | boolean): unknown {
  if (typeof raw === "boolean") return raw;
  if (schema.type === "number" || schema.type === "integer") {
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

type Option = { value: string; label: string };

/**
 * Extracts selectable options from a field schema. The API can express a
 * closed set of choices in a few ways, so we check all of them — otherwise the
 * field renders as free text and the agent rejects the answer with a 400:
 *   - `enum`                       → ["standard", "express"]
 *   - `oneOf` / `anyOf` of `const` → [{const: "standard", title: "Standard"}]
 *   - `items.enum` (array field)   → choose from a fixed set
 * Returns null when the field is genuinely free-form.
 */
function optionsFor(schema: JsonSchema): Option[] | null {
  if (schema.enum?.length) {
    return schema.enum.map((v) => ({ value: String(v), label: String(v) }));
  }
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches?.length) {
    const opts = branches
      .filter((b) => b.const !== undefined || b.enum?.length)
      .flatMap((b) =>
        b.const !== undefined
          ? [{ value: String(b.const), label: b.title ?? String(b.const) }]
          : (b.enum ?? []).map((v) => ({ value: String(v), label: String(v) })),
      );
    if (opts.length) return opts;
  }
  if (schema.items?.enum?.length) {
    return schema.items.enum.map((v) => ({ value: String(v), label: String(v) }));
  }
  return null;
}

/**
 * Renders a form dynamically from a pending action's `responseSchema`. The
 * schema is arbitrary JSON Schema per action — never hardcode fields. Supports
 * the common scalar shapes: string / number / boolean / enum.
 *
 * Known gap (flagged): when a payment action appears, card data currently flows
 * in `values` as plaintext — the wire schema has no secret/payment semantics.
 * Fine for a local demo; do not ship a real funding story on top of this.
 */
export function ActionForm({
  action,
  onSubmit,
  onDecline,
  submitting,
}: {
  action: PendingUserAction;
  onSubmit: (values: Record<string, unknown>) => void;
  onDecline: (reason: string) => void;
  submitting: boolean;
}) {
  const schema = useMemo(() => action.responseSchema ?? {}, [action]);
  const properties = useMemo(() => schema.properties ?? {}, [schema]);
  const required = useMemo(() => new Set(schema.required ?? []), [schema]);
  const keys = Object.keys(properties);

  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const k of keys) {
      const def = properties[k]?.default;
      if (def !== undefined) init[k] = typeof def === "boolean" ? def : String(def);
      else if (properties[k]?.type === "boolean") init[k] = false;
    }
    return init;
  });

  const looksLikePayment = /pay|card|cvc|cvv|pan|credit/i.test(JSON.stringify(properties).toLowerCase());

  const set = (k: string, v: string | boolean) => setValues((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = coerce(properties[k], values[k] ?? "");
      if (v !== undefined && v !== "") out[k] = v;
    }
    onSubmit(out);
  };

  const expiresLabel = action.expiresAt
    ? new Date(action.expiresAt).toLocaleTimeString()
    : null;

  return (
    <div className="max-h-[80vh] overflow-y-auto rounded-[12px] border border-[#f59e0b]/25 bg-white p-5 shadow-2xl">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#b45309]/15">
          <Hand className="size-3.5 text-[#b45309]" />
        </span>
        <div>
          <p className="text-sm font-medium text-[#00150d]">{action.message}</p>
          {expiresLabel && (
            <p className="text-xs text-[#00150d]/45">Respond before {expiresLabel}</p>
          )}
        </div>
      </div>

      {looksLikePayment && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-[#92400e]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This looks like a payment step. In v1 these values travel as plaintext —
            use only test data in this demo.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {keys.length === 0 && (
          <p className="text-sm text-[#00150d]/50">
            This action has no fields — just confirm to continue.
          </p>
        )}

        {keys.map((key) => {
          const field = properties[key];
          const isRequired = required.has(key);
          const label = titleFor(key, field);
          const options = optionsFor(field);

          return (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium text-[#00150d]">
                {label}
                {isRequired && <span className="text-[#dc2626]"> *</span>}
              </span>

              {options ? (
                <select
                  required={isRequired}
                  value={String(values[key] ?? "")}
                  onChange={(e) => set(key, e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(values[key])}
                    onChange={(e) => set(key, e.target.checked)}
                    className="size-4 accent-[#05B959]"
                  />
                  <span className="text-sm text-[#00150d]/70">{field.description ?? "Yes"}</span>
                </span>
              ) : (
                <input
                  type={
                    field.format === "email"
                      ? "email"
                      : field.type === "number" || field.type === "integer"
                        ? "text"
                        : "text"
                  }
                  inputMode={field.type === "number" || field.type === "integer" ? "decimal" : undefined}
                  required={isRequired}
                  value={String(values[key] ?? "")}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={field.description ?? ""}
                  className={inputClass}
                />
              )}

              {field.description && field.type !== "boolean" && (
                <span className="mt-1 block text-xs text-[#00150d]/45">{field.description}</span>
              )}
            </label>
          );
        })}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onDecline("changed my mind")}
            className="rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm font-medium text-[#00150d]/70 transition-colors hover:bg-black/[0.03] disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </form>
    </div>
  );
}
