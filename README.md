<div align="center">
<img width="200" alt="Crossmint" src="https://github.com/user-attachments/assets/8b617791-cd37-4a5a-8695-a7c9018b7c70" />
<br>
<br>
<h1>Agent Checkouts Quickstart</h1>

<div align="center">
<a href="https://docs.crossmint.com/agents/overview">Docs</a> | <a href="https://agent-checkouts.demos-crossmint.com">Live demo</a> | <a href="https://www.crossmint.com/quickstarts">See all quickstarts</a>
</div>

<br>
<br>
</div>

## Introduction

Hand an agent a product URL and an instruction and let it check out for you. This quickstart drives Crossmint's **Agent Checkouts API** end to end: it creates a checkout, watches a real automated browser session work through the merchant's pages, pauses to collect anything only a human can answer (shipping, payment), and reports back with a receipt.

The app walks you through **three steps**:

1. **Buyer profile** — pick (or create) a reusable set of buyer details: name, contact, and shipping. The agent uses it so it doesn't have to ask.
2. **What to buy** — paste a product URL and write a buyer request. The more you specify up front (size, payment method, delivery option, billing address), the fewer questions the agent stops to ask. You set the payment _method_ here (e.g. "pay by card"), but not the card details — the agent asks for those during checkout.
3. **Checkout** — watch the live browser session with the instruction and an elapsed timer, enter card details when the agent prompts for them (a warning explains what's safe to paste), answer any other prompts, and cancel any time.

**Learn how to:**
- Create a checkout from a product URL + a natural-language instruction, attaching a saved buyer profile by `buyerProfileId`
- Poll the checkout through its lifecycle: `queued → running → awaiting_user_action → succeeded | failed | cancelled`
- Embed the live browser session the agent is driving
- Render a form dynamically from each pending action's JSON Schema — never hardcoding fields
- Submit or decline user actions, and read the final receipt or failure reason
- Save reusable **buyer profiles** (name, contact, shipping) and attach one to a checkout with `buyerProfileId`

## How it works

The app calls four endpoints under `${NEXT_PUBLIC_CROSSMINT_BASE_URL}/api/unstable/agent-checkouts` (`lib/agent-checkout-api.ts`):

| Step | Call | Result |
| --- | --- | --- |
| 1. Create | `POST /` | `200` — full view, `status: "queued"`. Save `id`. |
| 2. Poll | `GET /:id` | `200` — repeat every ~1.5s (no webhooks in v1). |
| 3. Respond | `POST /:id/actions/:aid` | `202` — when `status === "awaiting_user_action"`. |
| 4. Cancel | `DELETE /:id` | `202` — async; flips to `cancelled` on a later poll. |

Terminal states carry a `receipt` (`succeeded`) or a `failure` with a `reason` of `max_cost_exceeded | user_cancelled | user_action_expired | automation_failed` (`failed`).

`constraints.maxCost` is required by the API, but this demo doesn't ask for a budget — it sends a deliberately huge cap (`HIGH_MAX_COST` in `app/page.tsx`) so the agent is never blocked on cost. Add a real cost input if you want to enforce a budget.

## Buyer profiles

A **buyer profile** is a project-scoped, reusable set of the buyer's details — **name, contact, and shipping only** (there is deliberately no payment block). Save one, then attach it to any checkout so the agent fills those fields from it instead of asking every time.

Profile endpoints live under `…/agent-checkouts/buyer-profiles` (`lib/agent-checkout-api.ts`):

| Call | Result |
| --- | --- |
| `POST /buyer-profiles` | `201` — the full profile. Save `id`. |
| `GET /buyer-profiles/:id` | `200` — one profile (`404` if not owned). |
| `GET /buyer-profiles?limit=&cursor=` | `200` — `{ data, nextCursor }`, keyset paginated (`limit` max 100). |
| `PATCH /buyer-profiles/:id` | `200` — partial update; an empty patch is a `400`. |
| `DELETE /buyer-profiles/:id` | `204` — No Content. |

`shipping.countryCode` (ISO 3166-1 alpha-2) is required. `shipping.administrativeAreaCode` is ISO 3166-2, prefixed with the country code — e.g. `US-CA`. The **State / region** input accepts a bare code (`CA`) or a prefixed one (`US-CA`) and normalizes to the prefixed form; a full name like `Florida` is passed through as typed (the API validates it). Pass a profile's id as `buyerProfileId` on `POST /agent-checkouts` to attach it. **Step 1** of the flow lists your profiles (from the list endpoint — no `localStorage` needed), lets you create/edit/delete them, and select the one to carry into the checkout.

**Auth:** every call runs in the browser and sends two things — your **client-side** Crossmint key (`X-API-KEY: ck_...`) and the signed-in user's **Stytch session JWT** (`Authorization: Bearer ...`). The `ck_` key alone returns `401`; checkouts are always made on behalf of an authenticated user.

> **Use production/live credentials — not test.** This quickstart runs against Crossmint **production** (`https://www.crossmint.com`), which validates the session JWT against the **live** Stytch project's JWKS. A **test** Stytch token (`public-token-test-...`) mints a JWT signed by a key production doesn't trust, and every call fails with `401 ... Couldn't find a JWT signing key in the JWKS for kid jwk-test-... (ERROR_JWT_INVALID)`. The `ck_` key must be `ck_production_...` and the Stytch token `public-token-live-...` — the two must come from the **same environment**.

## Setup

1. Clone the repository and navigate to the project folder:
```bash
git clone https://github.com/Crossmint/agent-checkout-quickstart.git && cd agent-checkout-quickstart
```

2. Install dependencies:
```bash
npm install   # or yarn / pnpm / bun
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Then fill in `.env.local` (all values are `NEXT_PUBLIC_*` — they ship to the browser):
```bash
# Stytch public token — must be the LIVE environment token, NOT test. A
# public-token-test-... produces a JWT that Crossmint production rejects with a
# 401 JWKS error. Get the Live token at https://stytch.com/dashboard
NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN=public-token-live-...

# Crossmint CLIENT production key with scopes: agent-checkouts.create | read | update | cancel.
# For buyer profiles (step 1), also add: agent-checkouts.buyer-profiles.create | read | update | delete.
# Public by design — restrict it with allowed-origins in the Crossmint console.
NEXT_PUBLIC_CROSSMINT_API_KEY=ck_production_...

# Production host for the Agent Checkouts API.
NEXT_PUBLIC_CROSSMINT_BASE_URL=https://www.crossmint.com
```

4. Configure the **Live** environment in your [Stytch dashboard](https://stytch.com/dashboard) (this app uses production credentials — see the Auth note above):
   - **Redirect URLs** — add the app **root** URL (e.g. `http://localhost:3000/`) under both **Login** and **Signup** (this is where Google sends the user back).
   - **Enable the frontend SDK in production** and add your app's domain (e.g. `localhost` for local dev, plus your deployed domain) to the SDK's **authorized domains**. The browser SDK refuses to initialize on a domain that isn't allow-listed.
   - In the same **SDK configuration**, enable **Manage user data** and **OAuth** — the app signs users in with Google OAuth (`components/login-screen.tsx`) and reads their session/user data from the browser, so both must be on or the SDK calls are rejected.
   - **Configure Google OAuth with your own Google Cloud credentials.** Unlike Test — where Stytch supplies shared OAuth credentials — the **Live** environment requires your own: create an OAuth 2.0 Client ID + secret in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), add Stytch's callback URL (shown in the Stytch OAuth settings, `https://api.stytch.com/v1/oauth/callback/...`) as an **Authorized redirect URI** in Google Cloud, then paste the Google **Client ID** and **Client Secret** into Stytch → **OAuth → Google**. Without this, login fails with a generic `stytch.com/redirect-error` ("There was an error logging you in").

5. Run the dev server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or whichever port Next picks if `:3000` is taken by the API).

## Deploy to Vercel

1. Push the repo to GitHub and **Import** it in Vercel (it auto-detects Next.js — no build config needed).
2. Add the environment variables from your `.env.local` in **Project → Settings → Environment Variables**: `NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN`, `NEXT_PUBLIC_CROSSMINT_API_KEY` (a `ck_production_...` key), and `NEXT_PUBLIC_CROSSMINT_BASE_URL` (`https://www.crossmint.com`).
3. After the first deploy, in the Stytch **Live** environment add your Vercel URL (and any custom domain), with a trailing `/`, as a **redirect URL**, and add the domain to the SDK's **authorized domains** (see Setup step 4) — then add the same origin to the Crossmint key's **allowed-origins**.

> `.env` / `.env.local` are gitignored and never leave your machine — set the values in Vercel, not in the repo.

## Notes & known gaps

- **Poll, don't push.** v1 has no webhooks; a ~1.5s poll on `GET /:id` driving a state machine is the intended pattern (`app/page.tsx`).
- **Forms are schema-driven.** `pendingUserAction.responseSchema` is arbitrary JSON Schema per action — `components/action-form.tsx` renders it dynamically.
- **Payment data is plaintext in v1.** Pending-action `values` travel and are stored as plain text with no secret/payment semantics on the wire. You can set the payment _method_ in the buyer request (e.g. "pay by card"), but **card details aren't accepted in the request yet** — the agent prompts for them during checkout (step 3), where the app shows a warning. When you enter a card there, use **only an agent card or a single-use / virtual card number. Never a real, reusable card number**: a leaked multi-use PAN can be used to charge the card. Agent-issued and single-use cards are safe because they are scoped or one-time, and the networks put them outside PCI-DSS scope:
  - Visa: *"single-use virtual Visa account numbers … [are] out of scope for PCI DSS protection requirements based on the low risk of fraud,"* and EMVCo payment tokens *"are not considered to be Visa account data and are not in scope for PCI DSS"* — while *"all other Visa primary account numbers (PANs) must be protected in accordance with PCI DSS"* ([Expanded Position on PCI DSS Applicability for Virtual Visa Accounts](https://usa.visa.com/dam/VCOM/global/support-legal/documents/expanded-pci-dss.pdf)).
  - Mastercard treats Single-Use Virtual Card Numbers as out of PCI-DSS scope because the number is disabled after one authorization and cannot be reused ([Virtual Card Numbers and SDP Compliance FAQs](https://www.mastercard.com/content/dam/public/mastercardcom/globalrisk/pdf/Virtual%20Card%20Numbers%20and%20SDP%20Compliance%20FAQs%20(15%20February%202022).pdf)).
  - The agent-card programs that issue these scoped tokens: [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce) and [Mastercard Agent Pay](https://www.mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay.html).
- **Buyer profiles hold no payment.** They store name, contact, and shipping only — payment is still collected per checkout via the pending payment action.
- **Buyer-profile scopes are separate.** Creating/listing profiles needs the `agent-checkouts.buyer-profiles.*` scopes on your `ck_` key, in addition to the checkout scopes. Without them step 1's profile calls return `403`.
- **Production only — test tokens 401.** All credentials must be from the **live/production** environment. Mixing a **test** Stytch token with production Crossmint yields `401 ... Couldn't find a JWT signing key in the JWKS for kid jwk-test-... (ERROR_JWT_INVALID)`. Fix: swap in the `public-token-live-...` token from the Stytch project tied to your Crossmint production account and restart the dev server (`NEXT_PUBLIC_*` vars are inlined at build time).
