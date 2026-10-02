"use client";

import { Hand } from "lucide-react";
import type { ApiCall, FormAnswers, RequiredAction } from "@/lib/agent-checkout-types";
import { BuyerInputForm } from "@/components/buyer-input-form";
import { PaymentRequest } from "@/components/payment-request";

/**
 * Prompts the buyer for whatever the run's `requiredAction` needs. The request
 * is typed on `interaction.kind`: a "form" lists field descriptors rendered by
 * {@link BuyerInputForm}, a "payment" is authorized with an order intent by
 * {@link PaymentRequest} — raw card details never enter this app or the task.
 */
export function ActionForm({
  action,
  jwt,
  email,
  countryCode,
  onSubmit,
  onSubmitPayment,
  onAlternative,
  onDecline,
  submitting,
  logCall,
}: {
  action: RequiredAction;
  jwt: string;
  /** Signed-in buyer's email — passed to card registration for a payment request. */
  email: string;
  /** Buyer's shipping country — passed to card registration; "US" fallback. */
  countryCode: string;
  onSubmit: (answers: FormAnswers) => void;
  onSubmitPayment: (orderIntentId: string) => void;
  onAlternative: (text: string) => void;
  onDecline: () => void;
  submitting: boolean;
  logCall: (call: Omit<ApiCall, "at">) => void;
}) {
  const { interaction } = action.request;
  const expiresLabel = action.request.expiresAt
    ? new Date(action.request.expiresAt).toLocaleTimeString()
    : null;

  return (
    <div
      className="max-h-[80vh] overflow-y-auto rounded-[12px] border border-[#f59e0b]/25 bg-white p-5 shadow-2xl"
    >
      <div className="mb-4 flex items-start gap-2.5">
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

      {interaction.kind === "payment" ? (
        <PaymentRequest
          key={action.requestId}
          interaction={interaction}
          jwt={jwt}
          email={email}
          countryCode={countryCode}
          submitting={submitting}
          onSubmit={onSubmitPayment}
          onAlternative={onAlternative}
          onDecline={onDecline}
          logCall={logCall}
        />
      ) : (
        <BuyerInputForm
          key={action.requestId}
          interaction={interaction}
          jwt={jwt}
          submitting={submitting}
          onSubmit={onSubmit}
          onDecline={onDecline}
        />
      )}
    </div>
  );
}
