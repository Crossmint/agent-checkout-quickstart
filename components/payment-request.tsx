"use client";

import { useCallback, useState } from "react";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import {
  CrossmintCvcRecollection,
  CrossmintPaymentMethodManagement,
  OrderIntentVerification,
  type OrderIntentVerificationProps,
} from "@crossmint/client-sdk-react-ui";
import {
  createOrderIntent,
  getCardRegistration,
  getOrderIntent,
  registerCard,
} from "@/lib/agent-checkout-api";
import type {
  ApiCall,
  OrderIntent,
  OrderIntentEncryptedCardRail,
  PaymentInteraction,
} from "@/lib/agent-checkout-types";

// Registration polls borrow card-permissions-quickstart's delays (~15s total).
const REGISTRATION_DELAYS_MS = [800, 1200, 1600, 2000, 2500, 3000, 3000, 4000];
const VERIFY_TRIES = 10;
const VERIFY_DELAY_MS = 1500;

const inputClass =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm text-[#00150d] placeholder:text-[#00150d]/30 outline-none transition-colors focus:border-[#05B959]/60";
const primaryButtonClass =
  "flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#05B959] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-[8px] border border-[rgba(0,0,0,0.12)] px-4 py-2.5 text-sm font-medium text-[#00150d]/70 transition-colors hover:bg-black/[0.03] disabled:opacity-50";

type Step = "select" | "verifying" | "recollecting-cvc" | "alternative";

/**
 * Answers a "payment" input request: the buyer picks a saved card, the app
 * registers it, creates an order intent for the request's exact amount and
 * merchant, completes rail verification or CVC recollection when required, and
 * submits the `orderIntentId`. Raw card data never reaches this app or the
 * checkout — the iframe components and the vault own it end to end.
 *
 * Mount it keyed on the request's `requestId`.
 */
export function PaymentRequest({
  interaction,
  jwt,
  email,
  countryCode,
  submitting,
  onSubmit,
  onAlternative,
  onDecline,
  logCall,
}: {
  interaction: PaymentInteraction;
  jwt: string;
  /** Buyer email — card-network rails need it at registration (Stytch JWTs carry no email claim). */
  email: string;
  /** Registration country — the selected buyer profile's shipping country, "US" otherwise. */
  countryCode: string;
  submitting: boolean;
  onSubmit: (orderIntentId: string) => void;
  onAlternative: (text: string) => void;
  onDecline: () => void;
  logCall: (call: Omit<ApiCall, "at">) => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [cardSummary, setCardSummary] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternative, setAlternative] = useState("");
  // The intent under verification/CVC recollection; survives re-renders so the
  // SDK components keep working while polls refresh it.
  const [orderIntent, setOrderIntent] = useState<OrderIntent | null>(null);

  const disabled = busy || submitting;
  const amountLabel =
    (interaction.amount.kind === "maximum" ? "Up to " : "") +
    `${interaction.amount.value} ${interaction.amount.currency}`;

  /** Poll the registration until no rail is still pending; proceed anyway if it never settles. */
  const waitForRegistration = useCallback(async () => {
    for (const delay of REGISTRATION_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const registration = await getCardRegistration(jwt, paymentMethodId!);
      if (registration && !registration.rails.some((r) => r.status === "pending")) return;
    }
  }, [jwt, paymentMethodId]);

  /** After verification, poll until the pending rail reports active. */
  const waitForVerified = useCallback(async (): Promise<OrderIntent> => {
    let latest = orderIntent;
    for (let i = 0; i < VERIFY_TRIES; i++) {
      await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
      if (latest) {
        const next = await getOrderIntent(jwt, latest.orderIntentId);
        logCall({
          method: "GET",
          path: `/api/unstable/order-intents/${next.orderIntentId}`,
          response: next,
        });
        latest = next;
        if (
          next.rails.some(
            (r) =>
              (r.rail === "agentic-token" || r.rail === "encrypted-card") &&
              r.status === "active" &&
              r.credentialFormats.includes("card"),
          )
        ) {
          return next;
        }
      }
    }
    // Verification may still be settling — submit with what we have.
    if (!latest) throw new Error("Lost the order intent while waiting for verification.");
    return latest;
  }, [jwt, logCall, orderIntent]);

  /**
   * Read the intent's rails: submit when a card-capable rail is already active;
   * otherwise hand off to the verification or CVC recollection component. When
   * no card rail is listed at all, submit anyway — the checkout can still pay
   * with an `encrypted-card` rail our reads don't expose.
   */
  const continueFromRails = useCallback(
    async (intent: OrderIntent) => {
      const cardActive = intent.rails.some(
        (r) =>
          (r.rail === "agentic-token" || r.rail === "encrypted-card") &&
          r.status === "active" &&
          r.credentialFormats.includes("card"),
      );
      if (cardActive) {
        setStatus("Authorizing payment…");
        onSubmit(intent.orderIntentId);
        return;
      }
      const pendingVerification = intent.rails.find(
        (r) => r.rail === "agentic-token" && r.status === "pending_verification",
      );
      if (pendingVerification && intent.verificationConfig) {
        setOrderIntent(intent);
        setStatus("Waiting for verification…");
        setStep("verifying");
        return;
      }
      const pendingCvc = intent.rails.find(
        (r): r is OrderIntentEncryptedCardRail =>
          r.rail === "encrypted-card" && r.status === "pending_cvc_recollection",
      );
      if (pendingCvc) {
        setOrderIntent(intent);
        setStatus("Confirm your card's security code to continue.");
        setStep("recollecting-cvc");
        return;
      }
      // No usable card rail listed — the checkout may still be able to pay via
      // an encrypted-card rail it can see even when our reads can't.
      setStatus("Authorizing payment…");
      onSubmit(intent.orderIntentId);
    },
    [onSubmit],
  );

  const authorize = useCallback(async () => {
    if (disabled || !paymentMethodId) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Registering card…");
      const { body, response } = await registerCard(jwt, paymentMethodId, {
        email,
        countryCode,
        languageCode: "en-US",
      });
      logCall({
        method: "PUT",
        path: `/api/unstable/payment-methods/${paymentMethodId}/order-intent-registration`,
        requestBody: body,
        response,
      });
      if (response.rails.some((r) => r.status === "pending")) {
        setStatus("Waiting for the card networks…");
        await waitForRegistration();
      }
      setStatus("Creating order intent…");
      const created = await createOrderIntent(jwt, {
        paymentMethodId,
        amount: { value: interaction.amount.value, currency: interaction.amount.currency },
        merchant: interaction.merchant,
        description: `Agent Checkout at ${interaction.merchant.name}`,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString(),
      });
      logCall({
        method: "POST",
        path: "/api/unstable/order-intents",
        requestBody: created.body,
        response: created.response,
      });
      await continueFromRails(created.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [
    disabled,
    paymentMethodId,
    jwt,
    email,
    countryCode,
    logCall,
    waitForRegistration,
    interaction,
    continueFromRails,
  ]);

  const onVerificationComplete = useCallback(async () => {
    setStep("select");
    setStatus("Waiting for verification…");
    setError(null);
    try {
      const intent = await waitForVerified();
      await continueFromRails(intent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification could not be confirmed");
      setStatus(null);
    }
  }, [waitForVerified, continueFromRails]);

  const onCvcComplete = useCallback(async () => {
    setStep("select");
    setStatus("Confirming card…");
    setError(null);
    try {
      const latest = orderIntent;
      if (!latest) throw new Error("Lost the order intent.");
      const next = await getOrderIntent(jwt, latest.orderIntentId);
      logCall({
        method: "GET",
        path: `/api/unstable/order-intents/${next.orderIntentId}`,
        response: next,
      });
      await continueFromRails(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CVC confirmation failed");
      setStatus(null);
    }
  }, [jwt, logCall, orderIntent, continueFromRails]);

  // The verification modal mounts on demand, over the rest of the flow.
  if (step === "verifying" && orderIntent?.verificationConfig) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-[#00150d]/60">
          <Loader2 className="size-4 animate-spin text-[#05B959]" />
          {status}
        </p>
        <OrderIntentVerification
          orderIntent={orderIntent as OrderIntentVerificationProps["orderIntent"]}
          displayName="Agent Checkout Quickstart"
          onVerificationComplete={onVerificationComplete}
          onVerificationError={(err) => {
            setStep("select");
            setStatus(null);
            setError(
              err instanceof Error ? err.message : "Card verification failed — try again.",
            );
          }}
        />
      </div>
    );
  }

  if (step === "recollecting-cvc" && orderIntent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-[#00150d]/60">
          <ShieldCheck className="size-4 text-[#05B959]" />
          {status}
        </p>
        <CrossmintCvcRecollection
          jwt={jwt}
          paymentMethodId={orderIntent.paymentMethodId}
          onComplete={onCvcComplete}
          onError={(err) => {
            setStep("select");
            setStatus(null);
            setError(err.message ?? "The security code could not be saved — try again.");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="space-y-1 rounded-[8px] bg-black/[0.02] px-3 py-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-[#00150d]/50">Amount</dt>
          <dd className="font-medium text-[#00150d]">{amountLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-[#00150d]/50">Merchant</dt>
          <dd className="min-w-0 truncate text-right text-[#00150d]">
            {interaction.merchant.name}
            <span className="ml-1.5 font-mono text-[11px] text-[#00150d]/40">
              {interaction.merchant.url}
            </span>
          </dd>
        </div>
      </dl>

      {step === "select" && (
        <>
          <CrossmintPaymentMethodManagement
            jwt={jwt}
            allowedModes={["existing", "new"]}
            onPaymentMethodSelected={(pm) => {
              if (pm.type !== "card") return;
              setPaymentMethodId(pm.paymentMethodId);
              setCardSummary(`${pm.card.brand} ··${pm.card.last4}`);
            }}
          />
          {cardSummary && (
            <p className="flex items-center gap-1.5 text-xs text-[#00150d]/60">
              <CreditCard className="size-3.5" /> {cardSummary}
            </p>
          )}
        </>
      )}

      {status && (
        <p className="flex items-center gap-2 text-xs text-[#00150d]/55">
          <Loader2 className="size-3.5 animate-spin text-[#05B959]" />
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {step === "alternative" ? (
        <div className="flex flex-col gap-2">
          <input
            value={alternative}
            onChange={(e) => setAlternative(e.target.value)}
            placeholder='e.g. "Pay with Shop Pay instead"'
            className={inputClass}
            disabled={disabled}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled || !alternative.trim()}
              onClick={() => onAlternative(alternative.trim())}
              className={primaryButtonClass}
            >
              Send
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setStep("select")}
              className={secondaryButtonClass}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={disabled || !paymentMethodId}
            onClick={authorize}
            className={primaryButtonClass}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Authorize {amountLabel}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setStep("alternative")}
            className={secondaryButtonClass}
          >
            Pay another way
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDecline}
            className={secondaryButtonClass}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
