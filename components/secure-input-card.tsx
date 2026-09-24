"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IFrameWindow } from "@crossmint/client-sdk-window";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import {
  createInputRequestSession,
  getInputRequest,
} from "@/lib/agent-checkout-api";
import type {
  Interaction,
  SecureInputSession,
} from "@/lib/agent-checkout-types";

const BASE_URL = (
  process.env.NEXT_PUBLIC_CROSSMINT_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

type SecureInteraction = Extract<
  Interaction,
  { kind: "payment" | "protected" }
>;

// Contract with the Crossmint-hosted secure-input component. The component is
// mounted with the session's single-use `clientToken` and reports back with the
// `sessionId` only; the card or password stays inside it. Keep the path and
// event names below in step with the hosted component.
const SECURE_INPUT_PATH = "/sdk/unstable/secure-input";
const secureInputEvents = {
  "ui:height.changed": z.object({ height: z.number() }),
  "secure-input:submitted": z.object({ sessionId: z.string() }),
  "secure-input:expired": z.object({ sessionId: z.string() }),
  "secure-input:error": z.object({ code: z.string(), message: z.string() }),
};

function secureInputUrl(
  session: SecureInputSession,
  interaction: SecureInteraction,
): string {
  const params = new URLSearchParams({
    clientToken: session.clientToken,
    kind: interaction.kind,
    targetOrigin: window.location.origin,
  });
  return `${BASE_URL}${SECURE_INPUT_PATH}?${params.toString()}`;
}

type Phase =
  | { name: "opening" }
  | { name: "collecting"; session: SecureInputSession }
  | { name: "submitted" }
  | { name: "unavailable"; message: string }
  | { name: "failed"; message: string };

/**
 * Answers a `payment` or `protected` input request. The flow is:
 * open a session → mount the hosted component with its `clientToken` → on
 * `secure-input:submitted`, hand the `sessionId` to the run. If the session
 * expires first, the request is re-read: still `open` gets a fresh session,
 * anything else ends the prompt. The sensitive value never touches this app,
 * the messages API, or the agent's context, and the `clientToken` is only ever
 * used to build the component URL — it is not logged or shown in the Code view.
 */
export function SecureInputCard({
  jwt,
  runId,
  requestId,
  interaction,
  onSubmitted,
  submitting,
}: {
  jwt: string;
  runId: string;
  requestId: string;
  interaction: SecureInteraction;
  onSubmitted: (sessionId: string) => void;
  submitting: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "opening" });
  const [height, setHeight] = useState(200);

  // Callers put the card in `opening` first; this resolves it to the next phase.
  const openSession = useCallback(
    () =>
      createInputRequestSession(jwt, runId, requestId).then(
        (session) => setPhase({ name: "collecting", session }),
        (err: unknown) =>
          setPhase({
            name: "failed",
            message:
              err instanceof Error
                ? err.message
                : "Failed to open a secure session",
          }),
      ),
    [jwt, runId, requestId],
  );

  // The session is gone (expired/closed). Only worth re-opening while the run is
  // still waiting on this request.
  const recoverSession = useCallback(async () => {
    setPhase({ name: "opening" });
    try {
      const request = await getInputRequest(jwt, runId, requestId);
      if (request.status === "open") {
        await openSession();
      } else {
        setPhase({
          name: "unavailable",
          message: `This request is ${request.status}; the agent is no longer waiting on it.`,
        });
      }
    } catch (err) {
      setPhase({
        name: "failed",
        message:
          err instanceof Error ? err.message : "Failed to check the request",
      });
    }
  }, [jwt, runId, requestId, openSession]);

  useEffect(() => {
    void openSession();
  }, [openSession]);

  // Wire the hosted component while a session is live. Local expiry is tracked
  // too, so a component that never reports back can't leave the buyer stuck.
  useEffect(() => {
    if (phase.name !== "collecting") return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const channel = IFrameWindow.initExistingIFrame(iframe, {
      incomingEvents: secureInputEvents,
    });
    const subscriptions = [
      channel.on("ui:height.changed", ({ height: next }) =>
        setHeight(Math.max(next, 120)),
      ),
      channel.on("secure-input:submitted", ({ sessionId }) => {
        setPhase({ name: "submitted" });
        onSubmitted(sessionId);
      }),
      channel.on("secure-input:expired", () => void recoverSession()),
      channel.on("secure-input:error", ({ message }) =>
        setPhase({ name: "failed", message }),
      ),
    ];
    const msUntilExpiry =
      new Date(phase.session.expiresAt).getTime() - Date.now();
    const expiryTimer = setTimeout(
      () => void recoverSession(),
      Math.max(msUntilExpiry, 0),
    );
    return () => {
      clearTimeout(expiryTimer);
      subscriptions.forEach((id) => channel.off(id));
    };
  }, [phase, onSubmitted, recoverSession]);

  const label =
    interaction.kind === "payment"
      ? `Pay ${interaction.amount.kind === "maximum" ? "up to " : ""}${interaction.amount.value} ${interaction.amount.currency} at ${interaction.merchant.domain}`
      : `Password for ${interaction.merchant.domain}`;
  const noun = interaction.kind === "payment" ? "card" : "password";

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#00150d]/60">
        {label}. Your {noun} is entered in a Crossmint-hosted field and never
        shared with this app or the agent.
      </p>

      {phase.name === "opening" && <Spinner text="Opening a secure session…" />}

      {phase.name === "collecting" && (
        <iframe
          ref={iframeRef}
          src={secureInputUrl(phase.session, interaction)}
          title={label}
          className="w-full border-0"
          style={{ height }}
          allow="payment; clipboard-write"
        />
      )}

      {phase.name === "submitted" && (
        <Spinner
          text={
            submitting
              ? "Handing the reference to the agent…"
              : `${noun[0].toUpperCase()}${noun.slice(1)} saved securely.`
          }
        />
      )}

      {(phase.name === "failed" || phase.name === "unavailable") && (
        <div className="space-y-2">
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {phase.message}
          </p>
          {phase.name === "failed" && (
            <button
              type="button"
              onClick={() => void recoverSession()}
              className="rounded-[6px] border border-[#00150d]/15 px-3 py-1.5 text-xs font-medium text-[#00150d] hover:bg-black/[0.03]"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#00150d]/70">
      <Loader2 className="size-3.5 animate-spin" />
      <span>{text}</span>
    </div>
  );
}
