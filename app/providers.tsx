"use client";

import { createStytchClient, StytchProvider } from "@stytch/nextjs";

// Stytch authenticates the user in the browser. The resulting session JWT is
// what the Agent Checkouts API expects as `Authorization: Bearer <jwt>` —
// the ck_ client key alone is not enough, the call must be made on behalf of a
// signed-in user.
const stytch = createStytchClient(process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN!);

export function Providers({ children }: { children: React.ReactNode }) {
  return <StytchProvider stytch={stytch}>{children}</StytchProvider>;
}
