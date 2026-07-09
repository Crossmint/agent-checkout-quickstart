// Client-side calls for the Agentic Checkouts lifecycle.
//
// These functions run in the BROWSER. The checkout endpoints accept a
// client-side API key (ck_...); because the request originates from the browser,
// the browser automatically attaches an `Origin` header, which is what a ck_ key
// requires. The key is therefore public — set it via NEXT_PUBLIC_* so it is
// inlined into the client bundle. (For a ck_ key this is expected; lock it down
// with the allowed-origins setting on the key in the Crossmint console.)
//
// Lifecycle (this is the loop the sample app implements):
//   1. createCheckout    POST   /                    → 200  { id, status: "queued", ... }
//   2. getCheckout       GET    /:id                 → 200  poll every ~1-2s (no webhooks in v1)
//   3. respondToAction   POST   /:id/actions/:aid    → 202  when status === "awaiting_user_action"
//   4. cancelCheckout    DELETE /:id                 → 202  cancel any time

import {
  buildCreateCheckoutBody,
  buildCreateBuyerProfileBody,
  type ActionAck,
  type BuyerProfile,
  type BuyerProfilesPage,
  type CheckoutView,
  type CreateBuyerProfileInput,
  type CreateCheckoutInput,
  type UpdateBuyerProfileInput,
} from "@/lib/agentic-checkout-types";

const BASE_URL = (process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_BASE = `${BASE_URL}/api/unstable/agent-checkouts`;
const BUYER_PROFILES_BASE = `${API_BASE}/buyer-profiles`;
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

// The Agentic Checkouts API authorizes the call on behalf of a signed-in user.
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
 * a 3-letter code. `target.request` is the optional natural-language instruction
 * for the agent. Returns the full checkout view with status "queued" — save `id`,
 * it is both the Crossmint checkout id and the underlying intent id.
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

/** Fetch the current checkout view. Poll this every ~1-2s; there are no webhooks in v1. */
export async function getCheckout(jwt: string, id: string): Promise<CheckoutView> {
  const res = await fetch(`${API_BASE}/${id}`, {
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch checkout (${res.status}): ${await readError(res)}`);
  const data: CheckoutView = await res.json();
  return data;
}

// ─── 3. Respond to a pending user action ──────────────────────────────────--

/**
 * Submit a response to a pending user action. `values` must satisfy the action's
 * responseSchema. NOTE: the action id goes in the URL only — never in the body
 * (the endpoint is .strict() and rejects an actionId field). Returns a 202 ack;
 * go back to polling, since more actions may follow (e.g. payment after shipping).
 */
export async function submitAction(
  jwt: string,
  checkoutId: string,
  actionId: string,
  values: Record<string, unknown>,
): Promise<ActionAck> {
  const body = { action: "submit", values };
  log(`POST /agent-checkouts/${checkoutId}/actions/${actionId} → request body`, body);
  const res = await fetch(`${API_BASE}/${checkoutId}/actions/${actionId}`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to submit action (${res.status}): ${await readError(res)}`);
  const data: ActionAck = await res.json();
  log(`POST /agent-checkouts/${checkoutId}/actions/${actionId} → response`, data);
  return data;
}

/** Decline a pending user action with an optional reason. */
export async function declineAction(
  jwt: string,
  checkoutId: string,
  actionId: string,
  reason?: string,
): Promise<ActionAck> {
  const body = { action: "decline", ...(reason ? { reason } : {}) };
  log(`POST /agent-checkouts/${checkoutId}/actions/${actionId} → decline`, body);
  const res = await fetch(`${API_BASE}/${checkoutId}/actions/${actionId}`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to decline action (${res.status}): ${await readError(res)}`);
  const data: ActionAck = await res.json();
  log(`POST /agent-checkouts/${checkoutId}/actions/${actionId} → declined`, data);
  return data;
}

// ─── 4. Cancel ──────────────────────────────────────────────────────────────

/** Cancel a checkout. Async — the status flips to "cancelled" on a later poll. */
export async function cancelCheckout(jwt: string, id: string): Promise<void> {
  log("DELETE /agent-checkouts/:id → request", { id });
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to cancel checkout (${res.status}): ${await readError(res)}`);
  log("DELETE /agent-checkouts/:id → accepted", { id, status: res.status });
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
