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
  type ActionAck,
  type CheckoutView,
  type CreateCheckoutInput,
} from "@/lib/agentic-checkout-types";

const BASE_URL = (process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_BASE = `${BASE_URL}/api/unstable/agentic-checkouts`;
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

  log("POST /agentic-checkouts → request body", body);
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to create checkout (${res.status}): ${await readError(res)}`);
  const data: CheckoutView = await res.json();
  log("POST /agentic-checkouts → response", data);
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
  log(`POST /agentic-checkouts/${checkoutId}/actions/${actionId} → request body`, body);
  const res = await fetch(`${API_BASE}/${checkoutId}/actions/${actionId}`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to submit action (${res.status}): ${await readError(res)}`);
  const data: ActionAck = await res.json();
  log(`POST /agentic-checkouts/${checkoutId}/actions/${actionId} → response`, data);
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
  log(`POST /agentic-checkouts/${checkoutId}/actions/${actionId} → decline`, body);
  const res = await fetch(`${API_BASE}/${checkoutId}/actions/${actionId}`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to decline action (${res.status}): ${await readError(res)}`);
  const data: ActionAck = await res.json();
  log(`POST /agentic-checkouts/${checkoutId}/actions/${actionId} → declined`, data);
  return data;
}

// ─── 4. Cancel ──────────────────────────────────────────────────────────────

/** Cancel a checkout. Async — the status flips to "cancelled" on a later poll. */
export async function cancelCheckout(jwt: string, id: string): Promise<void> {
  log("DELETE /agentic-checkouts/:id → request", { id });
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to cancel checkout (${res.status}): ${await readError(res)}`);
  log("DELETE /agentic-checkouts/:id → accepted", { id, status: res.status });
}
