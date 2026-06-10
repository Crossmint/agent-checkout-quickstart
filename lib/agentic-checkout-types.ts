// ─── Agentic Checkouts API types ────────────────────────────────────────────
// Mirrors the shape returned by ${CROSSMINT_BASE_URL}/api/unstable/agentic-checkouts.

/** A generic JSON Schema, as carried by a pending user action's responseSchema. */
export type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: (string | number)[];
  // A single fixed value — used inside oneOf/anyOf branches to model an option.
  const?: string | number;
  // Options can also arrive as a list of branches (often {const, title}).
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  format?: string;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

/** status walks: queued → running → awaiting_user_action → succeeded | failed | cancelled */
export type CheckoutStatus =
  | "queued"
  | "running"
  | "awaiting_user_action"
  | "succeeded"
  | "failed"
  | "cancelled";

export const TERMINAL_STATUSES: CheckoutStatus[] = ["succeeded", "failed", "cancelled"];

export function isTerminal(status: CheckoutStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** What the agent wants the buyer to do — rendered as a dynamic form. */
export type PendingUserAction = {
  id: string;
  message: string;
  responseSchema: JsonSchema;
  expiresAt?: string;
};

/** An ordered, append-only log of what the agent has done so far. */
export type ProgressItem = {
  type: string; // e.g. "step" | "user-action"
  message?: string;
  title?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type Money = { amount: string; currency: string };

export type Receipt = {
  total?: Money | string;
  capturedAt?: string;
  merchantOrderId?: string;
  evidence?: {
    confirmationUrl?: string;
    confirmationText?: string;
  };
};

export type FailureReason =
  | "max_cost_exceeded"
  | "user_cancelled"
  | "user_action_expired"
  | "automation_failed";

export type Failure = {
  reason: FailureReason;
  message?: string;
  failedAt?: string;
};

/** The full checkout view returned by POST / and GET /:id. */
export type CheckoutView = {
  id: string;
  status: CheckoutStatus;
  target: {
    kind: string; // "direct_url"
    url: string;
    request?: string;
  };
  constraints: {
    maxCost: Money;
  };
  metadata?: Record<string, unknown>;
  progressItems: ProgressItem[];
  pendingUserAction?: PendingUserAction;
  browser?: {
    embedUrl?: string;
    permissions?: unknown;
  };
  receipt?: Receipt;
  failure?: Failure;
  createdAt?: string;
  updatedAt?: string;
};

/** POST /:id/actions/:aid → 202 */
export type ActionAck = {
  checkoutId: string;
  actionId: string;
  status: "accepted";
  acceptedAt?: string;
};

/** Input for creating a checkout via the form. */
export type CreateCheckoutInput = {
  targetUrl: string;
  request?: string;
  maxCostAmount?: string;
  maxCostCurrency?: string;
  orderRef?: string;
};

/**
 * Builds the POST / request body from form input. Shared by the create server
 * action and the "Code" view so the logged request matches the real wire shape.
 */
export function buildCreateCheckoutBody(input: CreateCheckoutInput) {
  return {
    target: {
      kind: "direct_url",
      url: input.targetUrl,
      ...(input.request ? { request: input.request } : {}),
    },
    // constraints.maxCost is required by the API. Collected from the form's
    // "Max cost" + "Currency" fields; the defaults are a fallback only.
    constraints: {
      maxCost: {
        amount: input.maxCostAmount ?? "100.00",
        currency: (input.maxCostCurrency ?? "USD").toUpperCase(),
      },
    },
    ...(input.orderRef ? { metadata: { orderRef: input.orderRef } } : {}),
  };
}

/** One entry in the client-side API-call log rendered by the "Code" view. */
export type ApiCall = {
  method: "POST" | "GET" | "DELETE";
  path: string;
  requestBody?: unknown;
  response?: unknown;
  at: string;
};
