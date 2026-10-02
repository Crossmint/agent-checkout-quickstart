// Client-side calls for the Agent Checkouts lifecycle.
//
// These functions run in the BROWSER. The checkout endpoints accept a
// client-side API key (ck_...); because the request originates from the browser,
// the browser automatically attaches an `Origin` header, which is what a ck_ key
// requires. The key is therefore public — set it via NEXT_PUBLIC_* so it is
// inlined into the client bundle. (For a ck_ key this is expected; lock it down
// with the allowed-origins setting on the key in the Crossmint console.)
//
// Lifecycle (this is the loop the sample app implements):
//   1. createCheckout    POST   /                    → 202  { runId, status: "queued", ... }
//   2. getCheckout       GET    /:id                 → 200  poll every ~1-2s (no webhooks)
//      listMessages      GET    /:id/messages        → 200  what the agent did, asked, and concluded
//   3. sendMessage       POST   /:id/messages        → 202  answer an input request (status === "awaiting_input")
//        submitForm      — response { kind: "form", answers } for a "form" interaction
//        submitPayment   — response { kind: "payment", orderIntentId } for a "payment" interaction
//        sendAlternative — action "alternative" + free text (steer the agent elsewhere)
//        declineInput    — action "decline" (refuse the request)
//   4. cancelCheckout    POST   /:id/cancel          → 202  cancel any time
//
// Card authorization for a "payment" interaction (same key + JWT, but at
// ${BASE_URL}/api/unstable, not under /agent-checkouts):
//   registerCard        PUT  /payment-methods/:id/order-intent-registration  (idempotent)
//   getCardRegistration GET  /payment-methods/:id/order-intent-registration  (404 → null)
//   createOrderIntent   POST /order-intents
//   getOrderIntent      GET  /order-intents/:id

import {
  buildCreateCheckoutBody,
  buildCreateBuyerProfileBody,
  type BrowserProfile,
  type BrowserProfilesResponse,
  type BuyerProfile,
  type BuyerProfilesPage,
  type CancelAck,
  type CheckoutMessage,
  type CheckoutMessagesPage,
  type CheckoutView,
  type CardRegistration,
  type CreateBrowserProfileInput,
  type CreateBuyerProfileInput,
  type CreateCheckoutInput,
  type CreateOrderIntentInput,
  type FormAnswers,
  type MessageAck,
  type OrderIntent,
  type OutboundMessage,
  type OutboundMessagePart,
  type UpdateBrowserProfileInput,
  type UpdateBuyerProfileInput,
} from "@/lib/agent-checkout-types";

const BASE_URL = (process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_BASE = `${BASE_URL}/api/unstable/agent-checkouts`;
const BUYER_PROFILES_BASE = `${API_BASE}/buyer-profiles`;
const BROWSER_PROFILES_BASE = `${API_BASE}/browser-profiles`;
const API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? "";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the checkout's browser embed URL. The API returns it as a path
 * relative to the Crossmint origin (e.g. "/intents/:id/browser-embed"); left
 * as-is, an <iframe src> would resolve it against the app's own origin and 404.
 * Absolute URLs are returned untouched.
 */
export function resolveEmbedUrl(embedUrl?: string): string | undefined {
  if (!embedUrl) return undefined;
  if (/^https?:\/\//i.test(embedUrl)) return embedUrl;
  return `${BASE_URL}/${embedUrl.replace(/^\//, "")}`;
}

function log(label: string, data: unknown) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`${"─".repeat(60)}\n`);
}

// The Agent Checkouts API authorizes the call on behalf of a signed-in user.
// `jwt` is the Stytch session JWT (see app/providers.tsx) — without it the API
// responds 401 "No authentication header provided", even with a valid ck_ key.
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

// ─── 1. Create ──────────────────────────────────────────────────────────────

/**
 * Create a checkout. `constraints.maxCost` is required and the currency must be
 * a 3-letter code. `request.task` is the optional natural-language instruction
 * for the agent. Returns 202 with the run view in status "queued" — save `runId`.
 */
export async function createCheckout(jwt: string, input: CreateCheckoutInput): Promise<CheckoutView> {
  const body = buildCreateCheckoutBody(input);

  log("POST /agent-checkouts → request body", body);
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to create checkout (${res.status}): ${await readError(res)}`);
  const data: CheckoutView = await res.json();
  log("POST /agent-checkouts → response", data);
  return data;
}

// ─── 2. Poll ──────────────────────────────────────────────────────────────--

/** Fetch the current run view. Poll this every ~1-2s; there are no webhooks. */
export async function getCheckout(jwt: string, id: string): Promise<CheckoutView> {
  const res = await fetch(`${API_BASE}/${id}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch checkout (${res.status}): ${await readError(res)}`);
  const data: CheckoutView = await res.json();
  return data;
}

/** Fetch one page of the run's messages. Pass the previous page's `nextCursor` to continue. */
export async function listMessages(
  jwt: string,
  runId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<CheckoutMessagesPage> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const query = params.toString();
  const res = await fetch(`${API_BASE}/${runId}/messages${query ? `?${query}` : ""}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to list messages (${res.status}): ${await readError(res)}`);
  const data: CheckoutMessagesPage = await res.json();
  return data;
}

/** Walk every page of the run's messages, oldest first. */
export async function listAllMessages(jwt: string, runId: string): Promise<CheckoutMessage[]> {
  const all: CheckoutMessage[] = [];
  let cursor: string | undefined;
  do {
    const page = await listMessages(jwt, runId, cursor ? { cursor } : {});
    all.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ─── 3. Answer an input request ───────────────────────────────────────────--

/**
 * Send one message to the run. The `id` is generated here so the same message
 * retried is not applied twice. Returns a 202 ack as soon as the message is
 * accepted (not when the agent has consumed it); go back to polling, since more
 * input requests may follow (e.g. payment after shipping).
 */
export async function sendMessage(
  jwt: string,
  runId: string,
  part: OutboundMessagePart,
): Promise<{ body: OutboundMessage; ack: MessageAck }> {
  const body: OutboundMessage = { id: crypto.randomUUID(), parts: [part] };
  log(`POST /agent-checkouts/${runId}/messages → request body`, body);
  const res = await fetch(`${API_BASE}/${runId}/messages`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to send message (${res.status}): ${await readError(res)}`);
  const ack: MessageAck = await res.json();
  log(`POST /agent-checkouts/${runId}/messages → response`, ack);
  return { body, ack };
}

/**
 * Answer a "form" input request. `answers` is keyed by field key: plain values
 * for standard fields, `{ protectedInputId }` references for protected ones.
 * Omit optional fields the buyer left unanswered — null is not an answer.
 */
export function submitForm(jwt: string, runId: string, requestId: string, answers: FormAnswers) {
  return sendMessage(jwt, runId, {
    type: "input_response",
    requestId,
    action: "submit",
    response: { kind: "form", answers },
  });
}

/**
 * Answer a "payment" input request with an order intent created for the
 * request's amount and merchant. Never contains card details — the checkout
 * mints the credential from the order intent's rail inside the vault.
 */
export function submitPayment(jwt: string, runId: string, requestId: string, orderIntentId: string) {
  return sendMessage(jwt, runId, {
    type: "input_response",
    requestId,
    action: "submit",
    response: { kind: "payment", orderIntentId },
  });
}

/**
 * Steer the agent to another path instead of giving the requested answer
 * (e.g. "Pay with Shop Pay instead").
 */
export function sendAlternative(jwt: string, runId: string, requestId: string, text: string) {
  return sendMessage(jwt, runId, { type: "input_response", requestId, action: "alternative", text });
}

/** Refuse an input request. The agent decides how to proceed (often by stopping). */
export function declineInput(jwt: string, runId: string, requestId: string) {
  return sendMessage(jwt, runId, { type: "input_response", requestId, action: "decline" });
}

// ─── 4. Cancel ──────────────────────────────────────────────────────────────

/** Cancel a checkout. Async — the status flips to "cancelled" on a later poll. */
export async function cancelCheckout(jwt: string, runId: string): Promise<CancelAck> {
  log("POST /agent-checkouts/:id/cancel → request", { runId });
  const res = await fetch(`${API_BASE}/${runId}/cancel`, {
    method: "POST",
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to cancel checkout (${res.status}): ${await readError(res)}`);
  const data: CancelAck = await res.json();
  log("POST /agent-checkouts/:id/cancel → accepted", data);
  return data;
}

// ─── Buyer profiles ─────────────────────────────────────────────────────────
//
// A buyer profile stores the buyer's name, contact, and shipping (no payment).
// Create one, then attach it to any checkout by passing its id as
// `buyerProfileId`. Unlike packs, this resource HAS a keyset-paginated list
// endpoint, so the app enumerates profiles from the server rather than tracking
// ids locally.
//
//   createBuyerProfile  POST   /buyer-profiles       → 201  the profile
//   getBuyerProfile     GET    /buyer-profiles/:id   → 200  (404 if not owned)
//   listBuyerProfiles   GET    /buyer-profiles       → 200  { data, nextCursor }
//   updateBuyerProfile  PATCH  /buyer-profiles/:id   → 200  the updated profile
//   deleteBuyerProfile  DELETE /buyer-profiles/:id   → 204

/** Thrown by getBuyerProfile when a profile no longer exists / isn't owned (404). */
export class BuyerProfileNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Buyer profile ${id} not found`);
    this.name = "BuyerProfileNotFoundError";
  }
}

/** Create a buyer profile. Returns the full profile — save `id` to attach it to checkouts. */
export async function createBuyerProfile(
  jwt: string,
  input: CreateBuyerProfileInput,
): Promise<BuyerProfile> {
  const body = buildCreateBuyerProfileBody(input);
  log("POST /agent-checkouts/buyer-profiles → request body", body);
  const res = await fetch(BUYER_PROFILES_BASE, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to create buyer profile (${res.status}): ${await readError(res)}`);
  const data: BuyerProfile = await res.json();
  log("POST /agent-checkouts/buyer-profiles → response", data);
  return data;
}

/** Fetch a single buyer profile. Throws BuyerProfileNotFoundError on a 404. */
export async function getBuyerProfile(jwt: string, id: string): Promise<BuyerProfile> {
  const res = await fetch(`${BUYER_PROFILES_BASE}/${id}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (res.status === 404) throw new BuyerProfileNotFoundError(id);
  if (!res.ok) throw new Error(`Failed to fetch buyer profile (${res.status}): ${await readError(res)}`);
  return (await res.json()) as BuyerProfile;
}

/**
 * Fetch one keyset-paginated page of buyer profiles. `limit` defaults to 20
 * (max 100); pass the previous page's `nextCursor` to continue. See
 * listAllBuyerProfiles to walk every page.
 */
export async function listBuyerProfiles(
  jwt: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<BuyerProfilesPage> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const query = params.toString();
  const res = await fetch(`${BUYER_PROFILES_BASE}${query ? `?${query}` : ""}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to list buyer profiles (${res.status}): ${await readError(res)}`);
  return (await res.json()) as BuyerProfilesPage;
}

/**
 * Walk every page of buyer profiles, following `nextCursor` until it's null.
 * The first call is sent bare (no query string) — same shape as the checkout
 * `GET /:id` calls — and a query param is only added when a cursor exists, so
 * we don't trip the list route's strict input validation on a fresh load.
 */
export async function listAllBuyerProfiles(jwt: string): Promise<BuyerProfile[]> {
  const all: BuyerProfile[] = [];
  let cursor: string | undefined;
  do {
    const page = await listBuyerProfiles(jwt, cursor ? { cursor } : {});
    all.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/** Update a buyer profile. Send any subset of writable fields (empty patch → 400). */
export async function updateBuyerProfile(
  jwt: string,
  id: string,
  input: UpdateBuyerProfileInput,
): Promise<BuyerProfile> {
  log(`PATCH /agent-checkouts/buyer-profiles/${id} → request body`, input);
  const res = await fetch(`${BUYER_PROFILES_BASE}/${id}`, {
    method: "PATCH",
    headers: authHeaders(jwt),
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to update buyer profile (${res.status}): ${await readError(res)}`);
  const data: BuyerProfile = await res.json();
  log(`PATCH /agent-checkouts/buyer-profiles/${id} → response`, data);
  return data;
}

/** Delete a buyer profile. Returns 204 No Content. */
export async function deleteBuyerProfile(jwt: string, id: string): Promise<void> {
  log("DELETE /agent-checkouts/buyer-profiles/:id → request", { id });
  const res = await fetch(`${BUYER_PROFILES_BASE}/${id}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to delete buyer profile (${res.status}): ${await readError(res)}`);
  log("DELETE /agent-checkouts/buyer-profiles/:id → accepted", { id, status: res.status });
}

// ─── Browser profiles ───────────────────────────────────────────────────────
//
// A browser profile is a durable browser identity for the signed-in user: the
// merchant logins captured by one run are already signed in on the next.
// Attach it to a checkout by passing its id as `browser.profileId`. Every
// endpoint returns metadata only — the saved browser state itself is held by
// Crossmint's browser infrastructure and never comes back over the API.
//
// A user holds at most one profile, so the list fits in one page (no cursor
// walking needed) and create answers 409 once one exists.
//
//   createBrowserProfile  POST   /browser-profiles       → 201  the profile (409 if one exists)
//   getBrowserProfile     GET    /browser-profiles/:id   → 200  (404 if not owned)
//   listBrowserProfiles   GET    /browser-profiles       → 200  { data, nextCursor }
//   updateBrowserProfile  PATCH  /browser-profiles/:id   → 200  the renamed profile
//   deleteBrowserProfile  DELETE /browser-profiles/:id   → 204  erases the saved state

/** Thrown when create is called for a user who already holds a profile (409). */
export class BrowserProfileExistsError extends Error {
  constructor() {
    super("This user already has a browser profile");
    this.name = "BrowserProfileExistsError";
  }
}

/** Create the user's browser profile. Throws BrowserProfileExistsError on a 409. */
export async function createBrowserProfile(
  jwt: string,
  input: CreateBrowserProfileInput = {},
): Promise<BrowserProfile> {
  const body = input.label ? { label: input.label } : {};
  log("POST /agent-checkouts/browser-profiles → request body", body);
  const res = await fetch(BROWSER_PROFILES_BASE, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 409) throw new BrowserProfileExistsError();
  if (!res.ok) throw new Error(`Failed to create browser profile (${res.status}): ${await readError(res)}`);
  const data: BrowserProfile = await res.json();
  log("POST /agent-checkouts/browser-profiles → response", data);
  return data;
}

/** Fetch a single browser profile. A profile owned by anyone else is a 404. */
export async function getBrowserProfile(jwt: string, id: string): Promise<BrowserProfile> {
  const res = await fetch(`${BROWSER_PROFILES_BASE}/${id}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch browser profile (${res.status}): ${await readError(res)}`);
  return (await res.json()) as BrowserProfile;
}

/** The user's browser profile, or null when they don't have one yet. */
export async function findBrowserProfile(jwt: string): Promise<BrowserProfile | null> {
  const res = await fetch(BROWSER_PROFILES_BASE, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to list browser profiles (${res.status}): ${await readError(res)}`);
  const page = (await res.json()) as BrowserProfilesResponse;
  return page.data[0] ?? null;
}

/** Rename a browser profile. The label is the only editable field. */
export async function updateBrowserProfile(
  jwt: string,
  id: string,
  input: UpdateBrowserProfileInput,
): Promise<BrowserProfile> {
  log(`PATCH /agent-checkouts/browser-profiles/${id} → request body`, input);
  const res = await fetch(`${BROWSER_PROFILES_BASE}/${id}`, {
    method: "PATCH",
    headers: authHeaders(jwt),
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to update browser profile (${res.status}): ${await readError(res)}`);
  const data: BrowserProfile = await res.json();
  log(`PATCH /agent-checkouts/browser-profiles/${id} → response`, data);
  return data;
}

/**
 * Delete a browser profile. This erases the stored browser state, not just
 * Crossmint's record of it, so every saved merchant login is gone. Runs already
 * using the profile finish first; erasure completes once they end.
 */
export async function deleteBrowserProfile(jwt: string, id: string): Promise<void> {
  log("DELETE /agent-checkouts/browser-profiles/:id → request", { id });
  const res = await fetch(`${BROWSER_PROFILES_BASE}/${id}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to delete browser profile (${res.status}): ${await readError(res)}`);
  log("DELETE /agent-checkouts/browser-profiles/:id → accepted", { id, status: res.status });
}

// ─── Card order intents ─────────────────────────────────────────────────────
//
// When the run's input request is a "payment" interaction, the app authorizes
// the buyer's saved card with an order intent for exactly the request's
// `amount` and `merchant`, then submits the `orderIntentId`. These endpoints
// sit next to agent-checkouts under /api/unstable and take the same ck_ key +
// Bearer JWT. Raw card data never appears here — these calls carry ids only.
//
// Each function returns { body, response } so the caller can append the pair
// to the "Code" API log like the checkout calls.

const UNSTABLE_BASE = `${BASE_URL}/api/unstable`;

/**
 * Register a saved card for order intents (idempotent). Provisions the
 * card-network rails the card supports; does not prompt for verification and
 * grants no spending permission by itself.
 */
export async function registerCard(
  jwt: string,
  paymentMethodId: string,
  input: { email: string; countryCode: string; languageCode: string },
): Promise<{ body: typeof input; response: CardRegistration }> {
  const path = `/payment-methods/${paymentMethodId}/order-intent-registration`;
  log(`PUT ${path} → request body`, input);
  const res = await fetch(`${UNSTABLE_BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(jwt),
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to register card (${res.status}): ${await readError(res)}`);
  const data: CardRegistration = await res.json();
  log(`PUT ${path} → response`, data);
  return { body: input, response: data };
}

/** The card's registration, or null when it hasn't been registered yet (404). */
export async function getCardRegistration(
  jwt: string,
  paymentMethodId: string,
): Promise<CardRegistration | null> {
  const res = await fetch(
    `${UNSTABLE_BASE}/payment-methods/${paymentMethodId}/order-intent-registration`,
    { headers: authHeaders(jwt), cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(`Failed to read card registration (${res.status}): ${await readError(res)}`);
  return (await res.json()) as CardRegistration;
}

/**
 * Create an order intent: a bounded allowance on the saved card for one
 * merchant. The response lists each rail and its status — a rail that is
 * `pending_verification` needs `OrderIntentVerification`, and `encrypted-card`
 * can need `CrossmintCvcRecollection`, before the intent can back a payment.
 */
export async function createOrderIntent(
  jwt: string,
  input: CreateOrderIntentInput,
): Promise<{ body: CreateOrderIntentInput; response: OrderIntent }> {
  log("POST /order-intents → request body", input);
  const res = await fetch(`${UNSTABLE_BASE}/order-intents`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to create order intent (${res.status}): ${await readError(res)}`);
  const data: OrderIntent = await res.json();
  log("POST /order-intents → response", data);
  return { body: input, response: data };
}

/** Re-read an order intent — rail statuses move after verification/CVC recollection. */
export async function getOrderIntent(jwt: string, orderIntentId: string): Promise<OrderIntent> {
  const res = await fetch(`${UNSTABLE_BASE}/order-intents/${orderIntentId}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok)
    throw new Error(`Failed to fetch order intent (${res.status}): ${await readError(res)}`);
  return (await res.json()) as OrderIntent;
}
