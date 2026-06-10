"use client";

import { useMemo } from "react";
import { Hand, AlertTriangle } from "lucide-react";
import type { PendingUserAction } from "@/lib/agentic-checkout-types";
import { JsonSchemaForm } from "@/components/json-schema-form";

/**
 * Prompts the buyer for whatever a pending action needs. The fields are driven
 * entirely by the action's `responseSchema` — never hardcode them — and
 * rendered through {@link JsonSchemaForm}, an RJSF (`@rjsf/core` +
 * `@rjsf/validator-ajv8`) wrapper. Using RJSF means we render the schema
 * rather than maintain a second hand-written JSON Schema interpreter.
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

  const looksLikePayment = useMemo(
    () => /pay|card|cvc|cvv|pan|credit/i.test(JSON.stringify(schema).toLowerCase()),
    [schema],
  );

  const expiresLabel = action.expiresAt
    ? new Date(action.expiresAt).toLocaleTimeString()
    : null;

  return (
    <div className="max-h-[80vh] overflow-y-auto rounded-[12px] border border-[#f59e0b]/25 bg-white p-5 shadow-2xl">
      {looksLikePayment && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-[#92400e]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This looks like a payment step. In v1 these values travel as plaintext —
            use only test data in this demo.
          </span>
        </div>
      )}

      <JsonSchemaForm
        schema={schema}
        submitLabel="Submit"
        isSubmitting={submitting}
        onSubmit={onSubmit}
        secondary={{ label: "Decline", onClick: () => onDecline("changed my mind") }}
        header={
          <div className="flex items-start gap-2.5">
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
        }
      />
    </div>
  );
}
