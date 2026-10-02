"use client";

import { createStytchClient, StytchProvider } from "@stytch/nextjs";
import { CrossmintProvider } from "@crossmint/client-sdk-react-ui";

// Stytch authenticates the user in the browser. The resulting session JWT is
// what the Agent Checkouts API expects as `Authorization: Bearer <jwt>` —
// the ck_ client key alone is not enough, the call must be made on behalf of a
// signed-in user.
const stytch = createStytchClient(process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN!);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StytchProvider stytch={stytch}>
      {/* CrossmintProvider supplies the ck_ key to the SDK's components:
          CrossmintProtectedInput (protected form fields), the payment-method
          manager, OrderIntentVerification, and CVC recollection. */}
      {/* CrossmintProvider validates the key eagerly; render it only when the
          ck_ key is configured (SDK components can't work without it anyway). */}
      {process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ? (
        <CrossmintProvider apiKey={process.env.NEXT_PUBLIC_CROSSMINT_API_KEY}>
          {children}
        </CrossmintProvider>
      ) : (
        children
      )}
    </StytchProvider>
  );
}
