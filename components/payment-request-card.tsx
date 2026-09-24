"use client";

import { useCallback, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import {
  CrossmintPaymentMethodManagement,
  CrossmintProvider,
  OrderIntentVerification,
} from "@crossmint/client-sdk-react-ui";
import type { CrossmintPaymentMethod } from "@crossmint/client-sdk-base";
import {
  createOrderIntent,
  getOrderIntent,
  orderIntentReadiness,
  registerPaymentMethodForOrderIntents,
  type OrderIntentReadiness,
  type PaymentInteraction,
} from "@/lib/crossmint-payments-api";

const API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? "";
const BASE_URL_OVERRIDE = process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL;

/** A saved card as the buyer sees it. Display data only; nothing here can charge the card. */
type SelectedCard = { paymentMethodId: string; brand: string; last4: string };

type Step =
  | { name: "choose_card" }
  | { name: "authorizing"; card: SelectedCard }
  | {
      name: "verifying";
      card: SelectedCard;
      readiness: Extract<OrderIntentReadiness, { status: "pending_verification" }>;
    }
  | { name: "failed"; card: SelectedCard | null; message: string };

/**
 * Answers a `payment` input request. The card itself is entered in Crossmint's
 * hosted payment-method component, which tokenizes it inside Crossmint's PCI
 * boundary; this app only ever sees `paymentMethodId` plus brand/last4. From
 * that we create an order intent capped at the request's amount and hand its
 * `orderIntentId` to the run. The agent redeems the intent for a merchant-bound
 * credential on Crossmint's side, so no card number ever touches this app, the
 * messages API, or the agent's context.
 */
export function PaymentRequestCard({
  jwt,
  interaction,
  onAuthorized,
  submitting,
}: {
  jwt: string;
  interaction: PaymentInteraction;
  onAuthorized: (orderIntentId: string) => void;
  submitting: boolean;
}) {
  const [step, setStep] = useState<Step>({ name: "choose_card" });

  const settle = useCallback(
    (card: SelectedCard, orderIntentId: string, readiness: OrderIntentReadiness) => {
      switch (readiness.status) {
        case "ready":
          onAuthorized(orderIntentId);
          return;
        case "pending_verification":
          setStep({ name: "verifying", card, readiness });
          return;
        case "unusable":
          setStep({
            name: "failed",
            card,
            message: `This card can't back the checkout: ${readiness.reason}.`,
          });
          return;
      }
    },
    [onAuthorized],
  );

  const authorize = useCallback(
    async (paymentMethod: CrossmintPaymentMethod) => {
      if (paymentMethod.type !== "card") return;
      const card: SelectedCard = {
        paymentMethodId: paymentMethod.paymentMethodId,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
      };
      setStep({ name: "authorizing", card });
      try {
        await registerPaymentMethodForOrderIntents(jwt, card.paymentMethodId);
        const intent = await createOrderIntent(jwt, card.paymentMethodId, interaction);
        settle(card, intent.orderIntentId, orderIntentReadiness(intent));
      } catch (err) {
        setStep({
          name: "failed",
          card,
          message: err instanceof Error ? err.message : "Failed to authorize the card",
        });
      }
    },
    [jwt, interaction, settle],
  );

  // Verification flips the rail to `active` on Crossmint's side shortly after
  // the buyer completes it; re-read a bounded number of times, the last read decides.
  const verified = useCallback(
    async (card: SelectedCard, orderIntentId: string) => {
      setStep({ name: "authorizing", card });
      let readiness: OrderIntentReadiness = {
        status: "unusable",
        reason: "verification did not complete",
      };
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          readiness = orderIntentReadiness(await getOrderIntent(jwt, orderIntentId));
        } catch (err) {
          setStep({
            name: "failed",
            card,
            message: err instanceof Error ? err.message : "Failed to re-read the order intent",
          });
          return;
        }
        if (readiness.status !== "pending_verification") break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      settle(card, orderIntentId, readiness);
    },
    [jwt, settle],
  );

  const amountLabel = `${interaction.amount.kind === "maximum" ? "up to " : ""}${interaction.amount.value} ${interaction.amount.currency}`;

  // Scoped here rather than in app/providers.tsx: the hosted components are the
  // only consumers, and the provider validates the key on mount, which would
  // otherwise break prerendering when the env var is absent.
  return (
    <CrossmintProvider apiKey={API_KEY} overrideBaseUrl={BASE_URL_OVERRIDE} consoleLogLevel="warn">
      <div className="space-y-3">
        <p className="text-xs text-[#00150d]/60">
          Authorizes {amountLabel} at {interaction.merchant.domain}. Your card is entered in a Crossmint-hosted field
          and never shared with this app or the agent.
        </p>

        {step.name === "choose_card" && (
          <CrossmintPaymentMethodManagement
            jwt={jwt}
            allowedModes={["existing", "new"]}
            allowedPaymentMethodTypes={["card"]}
            onPaymentMethodSelected={authorize}
          />
        )}

        {step.name === "authorizing" && (
          <Status
            card={step.card}
            text={submitting ? "Sending the authorization to the agent…" : "Authorizing with Crossmint…"}
          />
        )}

        {step.name === "verifying" && (
          <>
            <Status card={step.card} text="Your bank wants to confirm this card. Complete the step in the dialog." />
            <OrderIntentVerification
              orderIntent={step.readiness.orderIntent}
              onVerificationComplete={() => void verified(step.card, step.readiness.orderIntent.orderIntentId)}
              onVerificationError={(error) =>
                setStep({
                  name: "failed",
                  card: step.card,
                  message: error instanceof Error ? error.message : "Card verification failed",
                })
              }
            />
          </>
        )}

        {step.name === "failed" && (
          <div className="space-y-2">
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{step.message}</p>
            <button
              type="button"
              onClick={() => setStep({ name: "choose_card" })}
              className="rounded-[6px] border border-[#00150d]/15 px-3 py-1.5 text-xs font-medium text-[#00150d] hover:bg-black/[0.03]"
            >
              Choose another card
            </button>
          </div>
        )}
      </div>
    </CrossmintProvider>
  );
}

function Status({ card, text }: { card: SelectedCard; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#00150d]/70">
      <Loader2 className="size-3.5 animate-spin" />
      <span className="inline-flex items-center gap-1 font-medium">
        <CreditCard className="size-3.5" /> {card.brand} •••• {card.last4}
      </span>
      <span>{text}</span>
    </div>
  );
}
