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

// ─── Packs ──────────────────────────────────────────────────────────────────
// A pack is a project-scoped bundle of agentic instructions for ONE merchant.
// It carries the merchant's identity (display name + domains) and a record of
// "phases" — each phase says when it applies (`applicability`) and what the
// agent should do (`instructions`). Attach a pack to a checkout via `packId`
// and the agent follows the pack's phases through that merchant's flow.

/** A single phase of a pack — keyed by a snake_case id in the `phases` record. */
export type PackPhase = {
  // When this phase applies, in natural language (≤4000 chars).
  applicability: string;
  // What the agent should do while in this phase (≤20000 chars).
  instructions: string;
  // Optional human label for the phase (≤200 chars).
  description?: string;
};

/** phases: snake_case id → phase body. At least one, at most 50 per pack. */
export type PackPhases = Record<string, PackPhase>;

/** The merchant a pack guides checkout for. */
export type PackMerchant = {
  // Optional kebab-case handle. Derived from the primary domain when omitted.
  slug?: string;
  displayName: string;
  // Canonical lowercase hostnames (no protocol/path), e.g. ["nike.com"].
  domains: string[];
};

/** The read model returned by every pack endpoint (create / get / update). */
export type PackManifest = {
  schemaVersion: number;
  id: string;
  description?: string;
  merchant: PackMerchant;
  phases: PackPhases;
  // How many checkouts have run against this pack.
  timesUsed: number;
  createdAt: string;
  updatedAt: string;
};

/** Body for POST /agentic-checkouts/packs. */
export type CreatePackInput = {
  description?: string;
  merchant: PackMerchant;
  phases: PackPhases;
};

/** Body for PATCH /agentic-checkouts/packs/:id. Phases replace the whole record. */
export type UpdatePackInput = {
  // `null` clears the stored description.
  description?: string | null;
  merchant?: PackMerchant;
  phases?: PackPhases;
};

/**
 * Pack provenance attached to a checkout view once a pack has driven the run.
 * Captured on the run's event stream, so it survives a later pack edit/delete.
 */
export type IntentPackUsage = {
  packId: string;
  merchantDisplayName: string;
  phasesUsed: string[];
};

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
  // Present once a pack drove (or is driving) this checkout.
  pack?: IntentPackUsage;
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
  // Optional pack to guide the agent through this merchant's flow.
  packId?: string;
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
    // Optional: a checkout targets one merchant, so at most one pack covers it.
    ...(input.packId ? { packId: input.packId } : {}),
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

/**
 * Builds the POST /packs request body, dropping empty optionals so the logged
 * request matches the real wire shape. Phases arrive already keyed by id.
 */
export function buildCreatePackBody(input: CreatePackInput) {
  return {
    ...(input.description ? { description: input.description } : {}),
    merchant: {
      ...(input.merchant.slug ? { slug: input.merchant.slug } : {}),
      displayName: input.merchant.displayName,
      domains: input.merchant.domains,
    },
    phases: input.phases,
  };
}

/** One entry in the client-side API-call log rendered by the "Code" view. */
export type ApiCall = {
  method: "POST" | "GET" | "PATCH" | "DELETE";
  path: string;
  requestBody?: unknown;
  response?: unknown;
  at: string;
};
