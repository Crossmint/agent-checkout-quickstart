"use client";

import { useEffect, useRef, useState } from "react";
import { IFrameWindow } from "@crossmint/client-sdk-window";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import type { Interaction } from "@/lib/agent-checkout-types";

const BASE_URL = (process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? "";

// Events the hosted component emits. Only metadata crosses the iframe boundary:
// never the password, never the vault token behind it.
const protectedInputEvents = {
  "ui:height.changed": z.object({ height: z.number() }),
  "protected-input:created": z.object({
    protectedInputId: z.string(),
    purpose: z.literal("password"),
    merchant: z.object({ domain: z.string() }),
    expiresAt: z.string(),
  }),
  "protected-input:error": z.object({ code: z.string(), message: z.string() }),
};

function protectedInputUrl(jwt: string, merchantDomain: string, expiresAt: string): string {
  const params = new URLSearchParams({
    jwt,
    apiKey: API_KEY,
    merchantUrl: `https://${merchantDomain}`,
    expiresAt,
    label: `Password for ${merchantDomain}`,
    targetOrigin: window.location.origin,
  });
  return `${BASE_URL}/sdk/unstable/protected-input?${params.toString()}`;
}

/**
 * Answers a `protected` input request. The password is typed into Crossmint's
 * hosted protected-input page, embedded here as an iframe: it is tokenized
 * inside Crossmint's vault and registered against the merchant domain the run
 * named, and the only thing that comes back to this page is the resulting
 * `protectedInputId`. The agent redeems that ID server-side when it fills the
 * merchant's sign-in form, so the password never touches this app, the
 * messages API, or the agent's context.
 */
export function ProtectedRequestCard({
  jwt,
  interaction,
  expiresAt,
  onCreated,
  submitting,
}: {
  jwt: string;
  interaction: Extract<Interaction, { kind: "protected" }>;
  expiresAt: string;
  onCreated: (protectedInputId: string) => void;
  submitting: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(160);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  // `targetOrigin` is this page's origin, so the URL can only be built in the browser.
  const [src] = useState(() =>
    typeof window === "undefined" ? null : protectedInputUrl(jwt, interaction.merchant.domain, expiresAt),
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const channel = IFrameWindow.initExistingIFrame(iframe, {
      incomingEvents: protectedInputEvents,
    });
    const subscriptions = [
      channel.on("ui:height.changed", ({ height: next }) => setHeight(Math.max(next, 80))),
      channel.on("protected-input:created", ({ protectedInputId }) => {
        setCreated(true);
        onCreated(protectedInputId);
      }),
      channel.on("protected-input:error", ({ message }) => setError(message)),
    ];
    return () => subscriptions.forEach((id) => channel.off(id));
  }, [src, onCreated]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#00150d]/60">
        The agent needs your password for {interaction.merchant.domain}. It is entered in a Crossmint-hosted field and
        never shared with this app or the agent.
      </p>

      {created ? (
        <div className="flex items-center gap-2 text-xs text-[#00150d]/70">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{submitting ? "Handing the reference to the agent…" : "Password saved securely."}</span>
        </div>
      ) : src === null ? null : (
        <iframe
          ref={iframeRef}
          src={src}
          title={`Password for ${interaction.merchant.domain}`}
          className="w-full border-0"
          style={{ height }}
          allow="clipboard-write"
        />
      )}

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
    </div>
  );
}
