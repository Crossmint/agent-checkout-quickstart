// ─── Agent Checkouts API types ────────────────────────────────────────────
// Mirrors the shape returned by ${CROSSMINT_BASE_URL}/api/unstable/agent-checkouts.

import type { ProtectedInputField } from "@crossmint/client-sdk-react-ui";

// ─── Input requests ─────────────────────────────────────────────────────────
// While `status === "awaiting_input"`, the run carries a typed request. Its
// `interaction.kind` picks the contract: a "form" lists typed field descriptors
// (rendered with your own controls, or CrossmintProtectedInput when `handling`
// is "protected"), a "payment" carries the charge metadata to authorize with an
// order intent — never raw card details.

export type TextInputAutoComplete =
  | "on"
  | "off"
  | "name"
  | "given-name"
  | "family-name"
  | "email"
  | "username"
  | "tel"
  | "current-password"
  | "new-password"
  | "one-time-code"
  | "street-address"
  | "postal-code";

export type TextInputMode =
  | "none"
  | "text"
  | "decimal"
  | "numeric"
  | "tel"
  | "search"
  | "email"
  | "url";

export type TextInput = {
  kind: "text";
  multiline?: boolean;
  placeholder?: string;
  display?: "masked";
  autoComplete?: TextInputAutoComplete;
  inputMode?: TextInputMode;
};

export type BooleanInput = { kind: "boolean" };

export type NumberInput = { kind: "number" | "integer" };

export type ChoiceOption = {
  value: string;
  label: string;
  // Placeholder options are a prompt ("Choose…"), never a valid answer.
  placeholder: boolean;
  selected: boolean;
  disabled: boolean;
};

export type ChoiceInput = {
  kind: "choice";
  selection:
    | { kind: "one" }
    | { kind: "many"; min: number; max?: number };
  options: ChoiceOption[];
};

/** A field rendered with the app's own controls; its answer is a plain value. */
export type StandardField = {
  key: string;
  label: string;
  required: boolean;
  handling: "standard";
  input: TextInput | BooleanInput | NumberInput | ChoiceInput;
};

/**
 * A field collected by Crossmint's `CrossmintProtectedInput`; its answer is a
 * `{ protectedInputId }` reference — the raw value never reaches this app.
 */
export type ProtectedField = ProtectedInputField;

export type BuyerInputField = StandardField | ProtectedField;

export type FormInteraction = {
  kind: "form";
  fields: BuyerInputField[];
};

export type PaymentInteraction = {
  kind: "payment";
  purpose: "checkout_payment";
  method: "card";
  amount: { kind: "exact" | "maximum"; value: string; currency: string };
  merchant: { url: string; name: string; countryCode: string };
};

export type Interaction = FormInteraction | PaymentInteraction;

// ─── Order intents ──────────────────────────────────────────────────────────
// Mirrors the SDK's base types (@crossmint/client-sdk-base) for the card
// rails an order intent exposes. The react-ui package does not re-export them,
// so the app keeps a local copy; `OrderIntentVerification` accepts the
// `verificationConfig` variant.

export type OrderIntentStatus = "active" | "cancelled" | "expired";
export type OrderIntentProvider = "vic" | "agentpay";
export type OrderIntentCredentialFormat = "card" | "network-token";

type OrderIntentRailState =
  | { status: "active" | "pending_verification"; error?: never }
  | { status: "error"; error: { code: string } };

export type OrderIntentAgenticTokenRail = OrderIntentRailState & {
  rail: "agentic-token";
  provider: OrderIntentProvider;
  credentialFormats: OrderIntentCredentialFormat[];
};

export type OrderIntentEncryptedCardRail = (
  | { status: "active" | "pending_cvc_recollection"; error?: never }
  | { status: "error"; error: { code: string } }
) & {
  rail: "encrypted-card";
  credentialFormats: "card"[];
};

export type OrderIntentSptRail = OrderIntentRailState & {
  rail: "spt";
  provider: "stripe";
  credentialFormats: "identifier"[];
};

export type OrderIntentRail =
  | OrderIntentAgenticTokenRail
  | OrderIntentEncryptedCardRail
  | OrderIntentSptRail;

export type OrderIntentVerificationConfig = {
  environment: "production" | "test";
  publicApiKey: string;
  allowanceId: string;
};

export type OrderIntentMerchant = {
  name: string;
  url: string;
  countryCode: string;
  categoryCode?: string;
  acquirerBin?: string;
};

type OrderIntentBase = {
  orderIntentId: string;
  paymentMethodId: string;
  status: OrderIntentStatus;
  amount: { total: string; spent: string; reserved: string; available: string; currency: string };
  merchant?: OrderIntentMerchant;
  description: string;
  rails: OrderIntentRail[];
  expiresAt: string;
};

export type OrderIntentWithVerification = OrderIntentBase & {
  verificationConfig: OrderIntentVerificationConfig;
};

export type OrderIntent =
  | OrderIntentWithVerification
  | (OrderIntentBase & { verificationConfig?: never });

/** Registration state for one provisioned card rail. */
export type RegistrationRail = {
  rail: "agentic-token" | "spt";
  provider?: OrderIntentProvider | "stripe";
  status: "enabled" | "pending" | "error";
  error?: { code: string } | null;
};

export type CardRegistration = {
  paymentMethodId: string;
  rails: RegistrationRail[];
};

export type CreateOrderIntentInput = {
  paymentMethodId: string;
  amount: { value: string; currency: string };
  merchant?: OrderIntentMerchant;
  description: string;
  expiresAt: string;
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

export const TERMINAL_STATUSES: CheckoutStatus[] = ["succeeded", "blocked", "failed", "cancelled"];

export function isTerminal(status: CheckoutStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * What the agent wants the buyer to do — rendered as a dynamic form. Carried on
 * the run as `requiredAction` while `status === "awaiting_input"`, and answered
 * by sending an `input_response` message that references `requestId`.
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
// `browser.profileId`. The API exposes metadata only — the saved browser state
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
export type BrowserProfilesResponse = { data: BrowserProfile[]; nextCursor: string | null };

/** What the agent bought, on a `succeeded` run. */
export type Purchase =
  | { kind: "receipt_captured"; receipt: { total: Money; merchantOrderId?: string } }
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
  | "browser_location_unsupported"
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
  browser?: {
    profileId?: string;
    location?: { type: "country"; countryCode: string };
  };
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
      action: "submit";
      // The read model echoes the projected application outcome, not the
      // submitted answers.
      response:
        | {
            kind: "form";
            fields: {
              key: string;
              label: string;
              answer: "provided" | "omitted";
              application: "already_satisfied" | "not_attempted" | "unresolved" | "verified";
            }[];
          }
        | {
            kind: "payment";
            application: "already_satisfied" | "not_attempted" | "unresolved" | "verified";
          };
    }
  | { type: "input_response"; requestId: string; action: "alternative"; text: string }
  | { type: "input_response"; requestId: string; action: "decline" }
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

/**
 * One form answer: a plain value for a standard field, or a
 * `{ protectedInputId }` reference for a protected one.
 */
export type FormAnswerValue = string | number | boolean | string[] | { protectedInputId: string };

/** The form answers to an input request: field key → answer. */
export type FormAnswers = Record<string, FormAnswerValue>;

/** The single part of a buyer message sent with POST /:id/messages. */
export type OutboundMessagePart =
  | { type: "text"; text: string }
  | {
      type: "input_response";
      requestId: string;
      action: "submit";
      response: { kind: "form"; answers: FormAnswers };
    }
  | {
      type: "input_response";
      requestId: string;
      action: "submit";
      response: { kind: "payment"; orderIntentId: string };
    }
  | { type: "input_response"; requestId: string; action: "alternative"; text: string }
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
  // Sent on the wire as `browser.profileId`.
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
    ...(input.merchantGuidance ? { merchantGuidance: input.merchantGuidance } : {}),
    // Optional: attach a saved buyer profile by id so the agent reuses the
    // buyer's name/contact/shipping instead of asking for them.
    ...(input.buyerProfileId ? { buyerProfileId: input.buyerProfileId } : {}),
    // Optional: run inside the user's saved browser identity, so merchant
    // logins captured by earlier runs are already there. Lives under `browser`
    // alongside the (unused here) `browser.location` egress-country option.
    ...(input.browserProfileId ? { browser: { profileId: input.browserProfileId } } : {}),
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
    ...(input.name && (input.name.first || input.name.last) ? { name: input.name } : {}),
    ...(input.contact && (input.contact.email || input.contact.phone)
      ? { contact: input.contact }
      : {}),
    shipping: input.shipping,
  };
}

/** One entry in the client-side API-call log rendered by the "Code" view. */
export type ApiCall = {
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  path: string;
  requestBody?: unknown;
  response?: unknown;
  at: string;
};
