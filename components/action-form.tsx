"use client";

import { useMemo } from "react";
import { Hand, AlertTriangle } from "lucide-react";
import type { FormValues, RequiredAction } from "@/lib/agent-checkout-types";
import { JsonSchemaForm } from "@/components/json-schema-form";

/**
 * Prompts the buyer for whatever the run's `requiredAction` needs. The fields
 * are driven entirely by the request's `interaction.responseSchema` — never
 * hardcode them — and
 * rendered through {@link JsonSchemaForm}, an RJSF (`@rjsf/core` +
 * `@rjsf/validator-ajv8`) wrapper. Using RJSF means we render the schema
 * rather than maintain a second hand-written JSON Schema interpreter.
 *
 * Known gap (flagged): when a payment request appears, card data currently flows
 * in `response.values` as plaintext — the wire schema has no secret/payment semantics.
 * Fine for a local demo; do not ship a real funding story on top of this.
 */
export function ActionForm({
  action,
  onSubmit,
  onDecline,
  submitting,
}: {
  action: RequiredAction;
  onSubmit: (values: FormValues) => void;
  onDecline: () => void;
  submitting: boolean;
}) {
  const schema = useMemo(() => action.request.interaction.responseSchema ?? {}, [action]);

  const looksLikePayment = useMemo(
    () => /pay|card|cvc|cvv|pan|credit/i.test(JSON.stringify(schema).toLowerCase()),
    [schema],
  );

  const expiresLabel = action.request.expiresAt
    ? new Date(action.request.expiresAt).toLocaleTimeString()
    : null;

  return (
    <div className="max-h-[80vh] overflow-y-auto rounded-[12px] border border-[#f59e0b]/25 bg-white p-5 shadow-2xl">
      {looksLikePayment && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Only enter an agent card, single-use virtual card, or test card —{" "}
            <span className="font-medium">never a real card number</span>. These values are sent
            and stored as plain text, not a PCI-compliant field, so a leaked reusable PAN could
            be used to charge the card. Agent and single-use virtual cards are safe because they
            are scoped or one-time — Visa and Mastercard both put them out of PCI-DSS scope.
          </span>
        </div>
      )}

      <JsonSchemaForm
        schema={schema}
        submitLabel="Submit"
        isSubmitting={submitting}
        onSubmit={(values) => onSubmit(values as FormValues)}
        secondary={{ label: "Decline", onClick: onDecline }}
        header={
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#b45309]/15">
              <Hand className="size-3.5 text-[#b45309]" />
            </span>
            <div>
              <p className="text-sm font-medium text-[#00150d]">{action.request.question}</p>
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
