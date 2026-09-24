// ─── Crossmint payment-methods / order-intents API ────────────────────────
// Used to answer a `payment` input request. The buyer picks or adds a card in
// Crossmint's hosted component (which tokenizes it — this app never sees the
// number), we register that payment method for order intents, and we create an
// order intent bounded by the request's amount. Only the resulting
// `orderIntentId` is sent to the run; the agent redeems it server-side.

import type { OrderIntent, OrderIntentWithVerification } from "@crossmint/client-sdk-base";

import type { Interaction } from "@/lib/agent-checkout-types";

const BASE_URL = (process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_BASE = `${BASE_URL}/api/unstable`;
const API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? "";

/** Two hours: long enough for a checkout, short enough that a forgotten intent lapses. */
const ORDER_INTENT_TTL_MS = 2 * 60 * 60 * 1000;

export type PaymentInteraction = Extract<Interaction, { kind: "payment" }>;

function authHeaders(jwt: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY,
    Authorization: `Bearer ${jwt}`,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body === "string" ? body : JSON.stringify(body);
  } catch {
    return res.statusText;
  }
}

/**
 * Opt the saved card into order intents. Idempotent: registering an already
 * registered card returns the current registration.
 */
export async function registerPaymentMethodForOrderIntents(jwt: string, paymentMethodId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/payment-methods/${paymentMethodId}/order-intent-registration`, {
    method: "PUT",
    headers: authHeaders(jwt),
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to register payment method (${res.status}): ${await readError(res)}`);
}

/**
 * Create an order intent the agent can redeem for this checkout. The amount is
 * a ceiling: `exact` means the run already verified the payable total, while
 * `maximum` caps spend at the run's cost limit. The merchant is not fixed here:
 * the agent names it on each credential request.
 */
export async function createOrderIntent(
  jwt: string,
  paymentMethodId: string,
  interaction: PaymentInteraction,
): Promise<OrderIntent> {
  const res = await fetch(`${API_BASE}/order-intents`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify({
      paymentMethodId,
      amount: {
        value: interaction.amount.value,
        currency: interaction.amount.currency,
      },
      description: `Agent checkout at ${interaction.merchant.domain}`,
      expiresAt: new Date(Date.now() + ORDER_INTENT_TTL_MS).toISOString(),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to create order intent (${res.status}): ${await readError(res)}`);
  return res.json();
}

export async function getOrderIntent(jwt: string, orderIntentId: string): Promise<OrderIntent> {
  const res = await fetch(`${API_BASE}/order-intents/${orderIntentId}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch order intent (${res.status}): ${await readError(res)}`);
  return res.json();
}

/**
 * Where an order intent stands. `pending_verification` means the card network
 * wants the buyer to confirm (OTP / app approval) before the intent can be
 * redeemed; `OrderIntentVerification` drives that step.
 */
export type OrderIntentReadiness =
  | { status: "ready" }
  | { status: "pending_verification"; orderIntent: OrderIntentWithVerification }
  | { status: "unusable"; reason: string };

/**
 * The agentic-token rail is preferred: it mints a network token bound to the
 * merchant. The agent types a card into the merchant's form, so that rail must
 * issue the `card` credential format. The encrypted-card rail is the fallback.
 */
export function orderIntentReadiness(intent: OrderIntent): OrderIntentReadiness {
  if (intent.status !== "active") return { status: "unusable", reason: `order intent is ${intent.status}` };
  const agentic = intent.rails.find((rail) => rail.rail === "agentic-token" && rail.credentialFormats.includes("card"));
  if (agentic?.status === "active") return { status: "ready" };
  if (agentic?.status === "pending_verification") {
    if (intent.verificationConfig === undefined) {
      return {
        status: "unusable",
        reason: "the card rail needs verification but no verification config was sent",
      };
    }
    return { status: "pending_verification", orderIntent: intent };
  }
  if (intent.rails.some((rail) => rail.rail === "encrypted-card" && rail.status === "active")) {
    return { status: "ready" };
  }
  return {
    status: "unusable",
    reason: agentic?.status === "error" ? agentic.error.code : "no card rail can back this checkout",
  };
}
