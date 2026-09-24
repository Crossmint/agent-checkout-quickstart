// ─── Agent Checkouts API types ────────────────────────────────────────────
// Mirrors the shape returned by ${CROSSMINT_BASE_URL}/api/unstable/agent-checkouts.

/** A generic JSON Schema, as carried by an input request's responseSchema. */
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

/** status walks: queued → running → awaiting_input → succeeded | blocked | failed | cancelled */
export type CheckoutStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "succeeded"
  | "blocked"
  | "failed"
  | "cancelled";

export const TERMINAL_STATUSES: CheckoutStatus[] = [
  "succeeded",
  "blocked",
  "failed",
  "cancelled",
];

export function isTerminal(status: CheckoutStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * How the buyer answers an input request. `form` is rendered from its JSON
 * Schema and answered with plain values. `payment` and `protected` carry safe
 * metadata only: the card or password is collected by a Crossmint-hosted
 * component and the answer is an opaque Crossmint ID, so the sensitive value
 * never travels through the messages API.
 */
export type Interaction =
  | {
      kind: "form";
      responseSchema: JsonSchema;
      uiSchema: Record<string, unknown>;
    }
  | {
      kind: "payment";
      purpose: "checkout_payment";
      method: "card";
      // `exact` is the verified payable total; `maximum` is the run's cost ceiling.
      amount: { kind: "exact" | "maximum"; value: string; currency: string };
      merchant: { domain: string };
    }
  | { kind: "protected"; purpose: "password"; merchant: { domain: string } };

/**
 * What the agent wants the buyer to do. Carried on the run as `requiredAction`
 * while `status === "awaiting_input"`, and answered by sending an
 * `input_response` message that references `requestId`.
 */
export type RequiredAction = {
  type: "input_response";
  messageId: string;
  requestId: string;
  request: {
    expiresAt: string;
    question: string;
    interaction: Interaction;
  };
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

/**
 * GET /agent-checkouts/browser-profiles. Shaped like the other list endpoints,
 * but a user holds at most one profile today, so `nextCursor` is `null`.
 */
export type BrowserProfilesResponse = {
  data: BrowserProfile[];
  nextCursor: string | null;
};

/** What the agent bought, on a `succeeded` run. */
export type Purchase =
  | {
      kind: "receipt_captured";
      receipt: { total: Money; merchantOrderId?: string };
    }
  | { kind: "confirmed_without_receipt" };

/** Why the agent stopped on purpose, on a `blocked` run. */
export type BlockedCode =
  | "policy.max_cost_exceeded"
  | "product.item_unavailable"
  | "product.requested_option_unavailable"
  | "merchant.fulfillment_unavailable"
  | "merchant.human_verification_required"
  | "merchant.access_blocked"
  | "merchant.payment_declined"
  | "merchant.checkout_error"
  | "merchant.no_safe_path";

/** Why the run itself broke, on a `failed` run. */
export type FailureReason =
  | "reconciliation_required"
  | "cost_limit"
  | "accounting_unavailable"
  | "cancelled"
  | "model_error"
  | "runtime_error"
  | "browser_session_lost"
  | "input_expired";

/** The terminal outcome carried on the run and in the last `result` message. */
export type CheckoutResult =
  | { outcome: "succeeded"; summary: string; purchase: Purchase }
  | { outcome: "blocked"; summary: string; code: BlockedCode }
  | { outcome: "cancelled"; summary: string }
  | { outcome: "failed"; summary: string };

/** The live browser session the agent is driving. `null` until one is attached. */
export type CheckoutBrowser = {
  embedUrl: string;
  // View-only: the embed is for watching, not interacting.
  permissions: readonly ["read"];
} | null;

/** The echo of what the run was created with. */
export type CheckoutInput = {
  request: { startUrl: string; task?: string };
  constraints: { maxCost: Money };
  buyerProfileId?: string;
  browserProfileId?: string;
  merchantGuidance?: string;
};

/**
 * The run view returned by POST / and GET /:id. Terminal runs carry `result`;
 * a `failed` run carries `reason` instead, with the summary in its last
 * `result` message.
 */
export type CheckoutView = {
  runId: string;
  createdAt: string;
  revision: number;
  knownSpentUsdMicros: number;
  input: CheckoutInput;
  status: CheckoutStatus;
  requiredAction?: RequiredAction | null;
  browser?: CheckoutBrowser;
  result?: CheckoutResult;
  reason?: FailureReason;
};

// ─── Messages ───────────────────────────────────────────────────────────────
// The run's conversation: what the agent did (activity, progress), what it asked
// (input_request), what the buyer answered (input_response), and how it ended
// (result). Read with GET /:id/messages; the buyer writes with POST /:id/messages.

export type MessagePart =
  | { type: "text"; text: string; delivery?: "accepted" | "consumed" }
  | {
      type: "activity";
      status: "running" | "completed" | "incomplete" | "uncertain";
      operations: { kind: string; count: number }[];
    }
  | {
      type: "input_request";
      requestId: string;
      status: "open" | "closed";
      expiresAt: string;
      question: string;
      interaction: Interaction;
    }
  | {
      type: "input_response";
      requestId: string;
      action: "submit" | "alternative" | "decline";
    }
  | { type: "progress"; text: string }
  | ({ type: "result" } & CheckoutResult);

export type CheckoutMessage = {
  id: string;
  revision: number;
  role: "user" | "assistant";
  createdAt: string;
  parts: MessagePart[];
};

/** One page of GET /:id/messages. `streamCursor` resumes the SSE stream. */
export type CheckoutMessagesPage = {
  data: CheckoutMessage[];
  nextCursor: string | null;
  streamCursor: string;
};

/** A form answer to an input request: field name → value. */
export type FormValues = Record<string, string | number | boolean | string[]>;

/**
 * A submitted answer, matching the request's `interaction.kind`. The payment
 * and protected answers are Crossmint locators, not credentials: the run
 * resolves them server-side and nothing here can charge a card or reveal a
 * password on its own.
 */
export type InputResponse =
  | { kind: "form"; values: FormValues }
  | { kind: "payment"; sessionId: string }
  | { kind: "protected"; sessionId: string };

/**
 * An ephemeral secure-collection session for one `payment` or `protected`
 * input request (`POST /:id/input-requests/:requestId/sessions`). `clientToken`
 * is a single-use, short-lived credential that only the Crossmint-hosted
 * component may see: it is passed to the component and nowhere else. The
 * `sessionId` is an opaque locator and is all that goes back on the messages API.
 */
export type SecureInputSession = {
  sessionId: string;
  clientToken: string;
  expiresAt: string;
};

/** Current state of one input request (`GET /:id/input-requests/:requestId`). */
export type InputRequestState = {
  requestId: string;
  status: "open" | "answered" | "closed" | "expired";
  expiresAt: string;
  question: string;
  interaction: Interaction;
};

/** The single part of a buyer message sent with POST /:id/messages. */
export type OutboundMessagePart =
  | { type: "text"; text: string }
  | {
      type: "input_response";
      requestId: string;
      action: "submit";
      response: InputResponse;
    }
  | {
      type: "input_response";
      requestId: string;
      action: "alternative";
      text: string;
    }
  | { type: "input_response"; requestId: string; action: "decline" };

/** Body for POST /:id/messages. `id` is client-generated so a retry is not applied twice. */
export type OutboundMessage = { id: string; parts: [OutboundMessagePart] };

/** POST /:id/messages → 202 */
export type MessageAck = { status: "accepted"; messageId: string };

/** POST /:id/cancel → 202 */
export type CancelAck = { status: "accepted" };

/** Input for creating a checkout via the form. */
export type CreateCheckoutInput = {
  startUrl: string;
  task?: string;
  // Optional free-text guidance for unusual checkouts (no cart, custom labels, a
  // non-obvious path to pay). Tells the agent exactly what to click on this site.
  merchantGuidance?: string;
  maxCostAmount?: string;
  maxCostCurrency?: string;
  // Optional saved buyer profile whose name/contact/shipping the agent should use.
  buyerProfileId?: string;
  // Optional browser profile whose saved merchant logins the run should reuse.
  browserProfileId?: string;
};

/**
 * Builds the POST / request body from form input. Shared by the create call
 * and the "Code" view so the logged request matches the real wire shape.
 */
export function buildCreateCheckoutBody(input: CreateCheckoutInput) {
  return {
    request: {
      startUrl: input.startUrl,
      ...(input.task ? { task: input.task } : {}),
    },
    // Only for unusual checkouts — steers the agent through non-standard flows.
    ...(input.merchantGuidance
      ? { merchantGuidance: input.merchantGuidance }
      : {}),
    // Optional: attach a saved buyer profile by id so the agent reuses the
    // buyer's name/contact/shipping instead of asking for them.
    ...(input.buyerProfileId ? { buyerProfileId: input.buyerProfileId } : {}),
    // Optional: run inside the user's saved browser identity, so merchant
    // logins captured by earlier runs are already there.
    ...(input.browserProfileId
      ? { browserProfileId: input.browserProfileId }
      : {}),
    // constraints.maxCost is required by the API; the defaults are a fallback only.
    constraints: {
      maxCost: {
        amount: input.maxCostAmount ?? "100.00",
        currency: (input.maxCostCurrency ?? "USD").toUpperCase(),
      },
    },
  };
}

/**
 * Builds the POST /buyer-profiles request body, dropping empty optionals so the
 * logged request matches the real wire shape. `shipping` is always sent.
 */
export function buildCreateBuyerProfileBody(input: CreateBuyerProfileInput) {
  return {
    ...(input.label ? { label: input.label } : {}),
    ...(input.name && (input.name.first || input.name.last)
      ? { name: input.name }
      : {}),
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
