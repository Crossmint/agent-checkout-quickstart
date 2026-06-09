<div align="center">
<img width="200" alt="Crossmint" src="https://github.com/user-attachments/assets/8b617791-cd37-4a5a-8695-a7c9018b7c70" />
<br>
<br>
<h1>Agentic Checkouts Quickstart</h1>

<div align="center">
<a href="https://docs.crossmint.com/agents/overview">Docs</a> | <a href="https://www.crossmint.com/quickstarts">See all quickstarts</a>
</div>

<br>
<br>
</div>

## Introduction

Hand an agent a product URL and a budget and let it check out for you. This quickstart drives Crossmint's **Agentic Checkouts API** end to end: it creates a checkout, watches a real automated browser session work through the merchant's pages, pauses to collect anything only a human can answer (shipping, payment), and reports back with a receipt.

**Learn how to:**
- Create a checkout from a product URL + a natural-language instruction + a hard max cost
- Poll the checkout through its lifecycle: `queued → running → awaiting_user_action → succeeded | failed | cancelled`
- Embed the live browser session the agent is driving
- Render a form dynamically from each pending action's JSON Schema — never hardcoding fields
- Submit or decline user actions, and read the final receipt or failure reason

## How it works

The app calls four endpoints under `${NEXT_PUBLIC_CROSSMINT_BASE_URL}/api/unstable/agentic-checkouts` (`lib/agentic-checkout-api.ts`):

| Step | Call | Result |
| --- | --- | --- |
| 1. Create | `POST /` | `200` — full view, `status: "queued"`. Save `id`. |
| 2. Poll | `GET /:id` | `200` — repeat every ~1.5s (no webhooks in v1). |
| 3. Respond | `POST /:id/actions/:aid` | `202` — when `status === "awaiting_user_action"`. |
| 4. Cancel | `DELETE /:id` | `202` — async; flips to `cancelled` on a later poll. |

Terminal states carry a `receipt` (`succeeded`) or a `failure` with a `reason` of `max_cost_exceeded | user_cancelled | user_action_expired | automation_failed` (`failed`).

**Auth:** every call runs in the browser and sends two things — your **client-side** Crossmint key (`X-API-KEY: ck_...`) and the signed-in user's **Stytch session JWT** (`Authorization: Bearer ...`). The `ck_` key alone returns `401`; checkouts are always made on behalf of an authenticated user.

## Setup

1. Clone the repository and navigate to the project folder:
```bash
git clone https://github.com/Crossmint/agentic-checkout-quickstart.git && cd agentic-checkout-quickstart
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
# Stytch public token (LIVE) — authenticates the user. https://stytch.com/dashboard
NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN=public-token-live-...

# Crossmint CLIENT production key with scopes: agentic-checkouts.create | read | update | cancel.
# Public by design — restrict it with allowed-origins in the Crossmint console.
NEXT_PUBLIC_CROSSMINT_API_KEY=ck_production_...

# Production host for the Agentic Checkouts API.
NEXT_PUBLIC_CROSSMINT_BASE_URL=https://www.crossmint.com
```

4. In your [Stytch dashboard](https://stytch.com/dashboard/redirect-urls), add the app **root** URL (e.g. `http://localhost:3000/`) as a redirect URL under both **Login** and **Signup** (OAuth).

5. Run the dev server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or whichever port Next picks if `:3000` is taken by the API).

## Deploy to Vercel

1. Push the repo to GitHub and **Import** it in Vercel (it auto-detects Next.js — no build config needed).
2. Add the environment variables from your `.env.local` in **Project → Settings → Environment Variables**: `NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN`, `NEXT_PUBLIC_CROSSMINT_API_KEY` (a `ck_production_...` key), and `NEXT_PUBLIC_CROSSMINT_BASE_URL` (`https://www.crossmint.com`).
3. After the first deploy, add your Vercel URL (and any custom domain), with a trailing `/`, as a Stytch redirect URL — and add it to the Crossmint key's **allowed-origins**.

> `.env` / `.env.local` are gitignored and never leave your machine — set the values in Vercel, not in the repo.

## Notes & known gaps

- **Poll, don't push.** v1 has no webhooks; a ~1.5s poll on `GET /:id` driving a state machine is the intended pattern (`app/page.tsx`).
- **Forms are schema-driven.** `pendingUserAction.responseSchema` is arbitrary JSON Schema per action — `components/action-form.tsx` renders it dynamically.
- **Payment data is plaintext in v1.** When a payment action appears, card fields currently travel in `values` with no secret/payment semantics on the wire. Don't build a real funding story on this until the API adds payment semantics.
