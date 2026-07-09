"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useStytch, useStytchUser, StytchLogin, Products } from "@stytch/nextjs";

// Stytch login config — Google OAuth. The redirect URL must match one registered
// in your Stytch dashboard: https://stytch.com/dashboard/redirect-urls
// Login lives at the root, so we redirect back to the origin root. Derived from
// window.location.origin so it works on localhost, Vercel previews, and prod.
const redirectUrl =
  typeof window !== "undefined" ? `${window.location.origin}/` : "/";

const loginConfig = {
  products: [Products.oauth],
  oauthOptions: {
    providers: [{ type: "google" as const }],
    loginRedirectURL: redirectUrl,
    signupRedirectURL: redirectUrl,
  },
};

const loginPresentation = {
  theme: { "container-border": "transparent" },
};

// After Stytch redirects back with ?token=...&stytch_token_type=oauth, exchange
// the token for a session and clean up the URL. Returns true while exchanging.
export function useStytchTokenAuth() {
  const stytch = useStytch();
  const { user } = useStytchUser();

  // Read the OAuth token from the URL after mount only. Reading `window` during
  // render (e.g. in a useState initializer) diverges between the server (no
  // token → renders the login form) and the first client render (token present
  // → renders the spinner), which breaks hydration. Starting at null keeps the
  // first client render identical to the server, then the effect picks it up.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stytch_token_type") === "oauth") {
      setToken(params.get("token"));
    }
  }, []);

  useEffect(() => {
    if (!token || user) return;
    stytch.oauth
      .authenticate(token, { session_duration_minutes: 60 })
      .catch((err) => console.error("Stytch OAuth authentication failed:", err))
      .finally(() => window.history.replaceState({}, "", "/"));
  }, [token, stytch, user]);

  return !!token && !user;
}

export function LoginScreen() {
  const authenticating = useStytchTokenAuth();

  if (authenticating) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F5F4]">
        <Loader2 className="size-5 animate-spin text-[#05B959]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F7F5F4] px-6">
      <div className="mb-8 max-w-md text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-[28px] font-medium leading-none tracking-[-0.84px] text-[#00150d]">
          Agent Checkouts
        </h1>
        <p className="mt-3 text-sm text-[#00150d]/55">
          Sign in to hand a product URL and an instruction to an agent. It drives a real
          browser to the checkout and reports back.
        </p>
      </div>
      <div className="flex w-full max-w-md items-center justify-center overflow-hidden rounded-[12px] bg-white p-2">
        <StytchLogin config={loginConfig} presentation={loginPresentation} />
      </div>
    </div>
  );
}
