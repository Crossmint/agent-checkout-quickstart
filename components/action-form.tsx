"use client";

import { useCallback } from "react";
import { Hand } from "lucide-react";
import type {
  FormValues,
  InputResponse,
  RequiredAction,
} from "@/lib/agent-checkout-types";
import { JsonSchemaForm } from "@/components/json-schema-form";
import { SecureInputCard } from "@/components/secure-input-card";

/**
 * Prompts the buyer for whatever the run's `requiredAction` needs, branching on
 * `interaction.kind`:
 *
 * - `form`: fields are driven entirely by the request's `responseSchema` (never
 *   hardcode them) and rendered through {@link JsonSchemaForm}, an RJSF wrapper.
 * - `payment` / `protected`: a short-lived secure session is opened for the
 *   request and its `clientToken` mounts a Crossmint-hosted component that
 *   collects the card or password; only the session's opaque `sessionId` is
 *   submitted. Sensitive values never pass through this app or the messages
 *   API, so a sensitive field must never be modelled as a `form` field.
 */
export function ActionForm({
  action,
  jwt,
  runId,
  onSubmit,
  onDecline,
  submitting,
}: {
  action: RequiredAction;
  jwt: string;
  runId: string;
  onSubmit: (response: InputResponse) => void;
  onDecline: () => void;
  submitting: boolean;
}) {
  const { interaction, expiresAt, question } = action.request;
  const kind = interaction.kind;
  const submitSession = useCallback(
    (sessionId: string) => {
      if (kind === "form") return;
      onSubmit({ kind, sessionId });
    },
    [kind, onSubmit],
  );

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleTimeString()
    : null;
  const header = (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#b45309]/15">
        <Hand className="size-3.5 text-[#b45309]" />
      </span>
      <div>
        <p className="text-sm font-medium text-[#00150d]">{question}</p>
        {expiresLabel && (
          <p className="text-xs text-[#00150d]/45">
            Respond before {expiresLabel}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-h-[80vh] overflow-y-auto rounded-[12px] border border-[#f59e0b]/25 bg-white p-5 shadow-2xl">
      {interaction.kind === "form" ? (
        <JsonSchemaForm
          schema={interaction.responseSchema ?? {}}
          submitLabel="Submit"
          isSubmitting={submitting}
          onSubmit={(values) =>
            onSubmit({ kind: "form", values: values as FormValues })
          }
          secondary={{ label: "Decline", onClick: onDecline }}
          header={header}
        />
      ) : (
        <div className="space-y-4">
          {header}
          <SecureInputCard
            jwt={jwt}
            runId={runId}
            requestId={action.requestId}
            interaction={interaction}
            onSubmitted={submitSession}
            submitting={submitting}
          />
          <button
            type="button"
            onClick={onDecline}
            disabled={submitting}
            className="text-xs font-medium text-[#00150d]/60 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
