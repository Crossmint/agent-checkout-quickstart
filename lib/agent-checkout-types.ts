// ─── Agent Checkouts API types ────────────────────────────────────────────
// Mirrors the shape returned by ${CROSSMINT_BASE_URL}/api/unstable/agent-checkouts.

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

// ─── Buyer profiles ───────────────────────────────────────────────────────--
// A buyer profile is a project-scoped, reusable set of the buyer's details —
// name, contact, and shipping ONLY (there is no payment block). Save one, then
// attach it to any number of checkouts by passing its id as `buyerProfileId`,
// so the agent fills shipping/contact from it instead of asking every time.

/** Buyer name. Both parts optional, 1–100 chars each. */
export type BuyerName = { first?: string; last?: string };

/** Buyer contact. Both parts optional. */
export type BuyerContact = { email?: string; phone?: string };

/**
 * Shipping destination. `countryCode` (ISO 3166-1 alpha-2) is required;
 * `administrativeAreaCode` (ISO 3166-2) must be prefixed with the country code
 * (e.g. "US-CA") and is nullable, as is `postalCode`.
 */
export type BuyerShipping = {
  addressLines: string[];
  locality: string;
  administrativeAreaCode?: string | null;
  postalCode?: string | null;
  countryCode: string;
};

/** The read model returned by every buyer-profile endpoint (create/get/list/update). */
export type BuyerProfile = {
  id: string;
  label?: string;
  name?: BuyerName;
  contact?: BuyerContact;
  shipping: BuyerShipping;
  createdAt: string;
  updatedAt: string;
};

/** Body for POST /agent-checkouts/buyer-profiles. `shipping` is required. */
export type CreateBuyerProfileInput = {
  label?: string;
  name?: BuyerName;
  contact?: BuyerContact;
  shipping: BuyerShipping;
};

/**
 * Body for PATCH /agent-checkouts/buyer-profiles/:id — any subset of writable
 * fields (at least one; an empty patch is a 400). `shipping` may itself be partial.
 */
export type UpdateBuyerProfileInput = {
  label?: string;
  name?: BuyerName;
  contact?: BuyerContact;
  shipping?: Partial<BuyerShipping>;
};

/** One keyset-paginated page of GET /agent-checkouts/buyer-profiles. */
export type BuyerProfilesPage = {
  data: BuyerProfile[];
  // Opaque cursor for the next page; `null` on the last page.
  nextCursor: string | null;
};

// ─── Browser profiles ──────────────────────────────────────────────────────
// A browser profile is a durable browser identity for the signed-in user: the
// merchant logins it accumulates are reused across runs, so the user signs in
// once instead of on every checkout. Attach it by passing its id as
// `browserProfileId`. The API exposes metadata only — the saved browser state
// itself never comes back through it.

/** The read model returned by every browser-profile endpoint. */
export type BrowserProfile = {
  id: string;
  label?: string;
  createdAt: string;
  // When the label was last changed; checkout runs don't touch it.
  updatedAt: string;
};

/** Body for POST /agent-checkouts/browser-profiles — `label` is the only field. */
export type CreateBrowserProfileInput = { label?: string };

/** Body for PATCH /agent-checkouts/browser-profiles/:id — the label is the only editable field. */
export type UpdateBrowserProfileInput = { label: string };

/** GET /agent-checkouts/browser-profiles. Unpaginated: a user holds at most one profile. */
export type BrowserProfilesResponse = { data: BrowserProfile[] };

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
  // Optional free-text guidance for unusual checkouts (no cart, custom labels, a
  // non-obvious path to pay). Tells the agent exactly what to click on this site.
  merchantContext?: string;
  maxCostAmount?: string;
  maxCostCurrency?: string;
  orderRef?: string;
  // Optional saved buyer profile whose name/contact/shipping the agent should use.
  buyerProfileId?: string;
  // Optional browser profile whose saved merchant logins the run should reuse.
  browserProfileId?: string;
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
      // Only for unusual checkouts — steers the agent through non-standard flows.
      ...(input.merchantContext ? { merchantContext: input.merchantContext } : {}),
    },
    // Optional: attach a saved buyer profile by id so the agent reuses the
    // buyer's name/contact/shipping instead of asking for them.
    ...(input.buyerProfileId ? { buyerProfileId: input.buyerProfileId } : {}),
    // Optional: run inside the user's saved browser identity, so merchant
    // logins captured by earlier runs are already there.
    ...(input.browserProfileId ? { browserProfileId: input.browserProfileId } : {}),
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
 * Builds the POST /buyer-profiles request body, dropping empty optionals so the
 * logged request matches the real wire shape. `shipping` is always sent.
 */
export function buildCreateBuyerProfileBody(input: CreateBuyerProfileInput) {
  return {
    ...(input.label ? { label: input.label } : {}),
    ...(input.name && (input.name.first || input.name.last) ? { name: input.name } : {}),
    ...(input.contact && (input.contact.email || input.contact.phone)
      ? { contact: input.contact }
      : {}),
    shipping: input.shipping,
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
