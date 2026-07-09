"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, RotateCcw, X } from "lucide-react";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import {
  createCheckout,
  getCheckout,
  submitAction,
  declineAction,
  cancelCheckout,
  resolveEmbedUrl,
  listAllBuyerProfiles,
} from "@/lib/agentic-checkout-api";
import { LoginScreen } from "@/components/login-screen";
import {
  buildCreateCheckoutBody,
  isTerminal,
  type ApiCall,
  type BuyerProfile,
  type CheckoutView,
  type CreateCheckoutInput,
} from "@/lib/agentic-checkout-types";
import { CheckoutForm } from "@/components/checkout-form";
import { StatusBadge } from "@/components/status-badge";
import { ProgressTimeline } from "@/components/progress-timeline";
import { BrowserFrame } from "@/components/browser-frame";
import { ActionForm } from "@/components/action-form";
import { OutcomeCard } from "@/components/outcome-card";
import { Footer } from "@/components/footer";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { ApiLogView } from "@/components/api-log-view";
import { BuyerProfilesView } from "@/components/buyer-profiles-view";
import { Stepper, type Step } from "@/components/stepper";
import { ElapsedTimer } from "@/components/elapsed-timer";

const POLL_INTERVAL_MS = 1500;
const BASE_PATH = "/api/unstable/agent-checkouts";

// The API requires constraints.maxCost, but this demo doesn't ask for a budget —
// it sends a deliberately huge cap so the agent is never blocked on cost.
const HIGH_MAX_COST = { amount: "1000000.00", currency: "USD" };

// Two pre-checkout steps; the third ("run") is implied once a checkout exists.
type FlowStep = "profile" | "buy";

function CheckoutApp() {
  const stytch = useStytch();
  const { user } = useStytchUser();
  // The Stytch session JWT authorizes every Agentic Checkouts call on behalf of
  // the signed-in user. Read it fresh per call so a refreshed session is picked up.
  const getJwt = useCallback(() => stytch.session.getTokens()?.session_jwt ?? "", [stytch]);

  const userEmail = user?.emails?.[0]?.email ?? "";
  const userInitial = userEmail[0]?.toUpperCase() ?? "U";

  // Which pre-checkout step we're on. Once `checkout` is set we're implicitly on
  // the "run" step regardless of this value.
  const [step, setStep] = useState<FlowStep>("profile");
  // The buyer profile picked in step 1 and attached to the checkout in step 2.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  // When the checkout was created, for the elapsed-time display in step 3.
  const [startedAt, setStartedAt] = useState<number>(0);

  // Saved buyer profiles the agent can reuse. Unlike packs, the API lists them,
  // so we fetch every page from the server. Shared between step 1's picker and
  // the profile summary shown in step 2.
  const [profiles, setProfiles] = useState<BuyerProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  // The stored selection, validated against the current list and defaulting to
  // the first profile. Derived (not stored) so a deleted/absent selection
  // self-heals without an effect.
  const effectiveSelectedId =
    selectedProfileId && profiles.some((p) => p.id === selectedProfileId)
      ? selectedProfileId
      : (profiles[0]?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await listAllBuyerProfiles(getJwt());
        if (!cancelled) setProfiles(loaded);
      } catch (err) {
        // A failed load shouldn't block the checkout flow — log and move on.
        console.error("Failed to load buyer profiles:", err);
      } finally {
        if (!cancelled) setProfilesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getJwt]);

  const handleProfileCreated = useCallback((profile: BuyerProfile) => {
    setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
    // A freshly created profile becomes the selection so step 1 → 2 flows on.
    setSelectedProfileId(profile.id);
  }, []);

  const handleProfileUpdated = useCallback((profile: BuyerProfile) => {
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? profile : p)));
  }, []);

  const handleProfileDeleted = useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const [checkout, setCheckout] = useState<CheckoutView | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Track the action we've already answered so we don't re-render the form
  // while the next poll still reports the same pending action.
  const [respondedActionId, setRespondedActionId] = useState<string | null>(null);

  // "Code" view: a running log of the API calls the app makes.
  const [viewMode, setViewMode] = useState<ViewMode>("ui");
  const [apiLog, setApiLog] = useState<ApiCall[]>([]);
  const logCall = useCallback((call: Omit<ApiCall, "at">) => {
    setApiLog((prev) => [...prev, { ...call, at: new Date().toLocaleTimeString() }]);
  }, []);

  // ── Polling loop ──────────────────────────────────────────────────────────
  // No webhooks in v1: poll GET /:id every ~1.5s until a terminal state.
  // setCheckout returns a fresh object each poll, re-running this effect.
  useEffect(() => {
    if (!checkout || isTerminal(checkout.status)) return;
    // While the agent is blocked on an *unanswered* action, nothing changes
    // server-side until the buyer responds — so we stop polling entirely.
    // Once they've responded (respondedActionId matches), we resume so we can
    // catch the server moving past awaiting_user_action.
    const waitingOnUser =
      checkout.status === "awaiting_user_action" &&
      !!checkout.pendingUserAction &&
      respondedActionId !== checkout.pendingUserAction.id;
    if (waitingOnUser) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const next = await getCheckout(getJwt(), checkout.id);
        if (cancelled) return;
        // Log a poll only when something changed, so the Code view stays readable.
        const changed =
          next.status !== checkout.status ||
          (next.progressItems?.length ?? 0) !== (checkout.progressItems?.length ?? 0);
        if (changed) logCall({ method: "GET", path: `${BASE_PATH}/${next.id}`, response: next });
        setCheckout(next);
      } catch (err) {
        // Transient errors shouldn't kill the loop — nudge a re-poll.
        console.error("Poll failed:", err);
        if (!cancelled) setCheckout((c) => (c ? { ...c } : c));
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [checkout, respondedActionId, logCall, getJwt]);

  const handleCreate = useCallback(async (input: CreateCheckoutInput) => {
    setCreating(true);
    setError(null);
    setRespondedActionId(null);
    setApiLog([]);
    try {
      const view = await createCheckout(getJwt(), input);
      logCall({ method: "POST", path: BASE_PATH, requestBody: buildCreateCheckoutBody(input), response: view });
      setStartedAt(view.createdAt ? Date.parse(view.createdAt) : Date.now());
      setCheckout(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout");
    } finally {
      setCreating(false);
    }
  }, [logCall, getJwt]);

  // Step 2 submit: attach the step-1 profile and the high cost cap, then create.
  const handleStartCheckout = useCallback(
    (targetUrl: string, request: string) => {
      handleCreate({
        targetUrl,
        request,
        maxCostAmount: HIGH_MAX_COST.amount,
        maxCostCurrency: HIGH_MAX_COST.currency,
        buyerProfileId: effectiveSelectedId ?? undefined,
      });
    },
    [handleCreate, effectiveSelectedId],
  );

  const handleSubmitAction = useCallback(
    async (values: Record<string, unknown>) => {
      if (!checkout?.pendingUserAction) return;
      const aid = checkout.pendingUserAction.id;
      setActionBusy(true);
      try {
        const ack = await submitAction(getJwt(), checkout.id, aid, values);
        logCall({
          method: "POST",
          path: `${BASE_PATH}/${checkout.id}/actions/${aid}`,
          requestBody: { action: "submit", values },
          response: ack,
        });
        setRespondedActionId(aid);
        // Refresh immediately so the UI moves on without waiting for the next tick.
        setCheckout(await getCheckout(getJwt(), checkout.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit action");
      } finally {
        setActionBusy(false);
      }
    },
    [checkout, logCall, getJwt],
  );

  const handleDeclineAction = useCallback(
    async (reason: string) => {
      if (!checkout?.pendingUserAction) return;
      const aid = checkout.pendingUserAction.id;
      setActionBusy(true);
      try {
        const ack = await declineAction(getJwt(), checkout.id, aid, reason);
        logCall({
          method: "POST",
          path: `${BASE_PATH}/${checkout.id}/actions/${aid}`,
          requestBody: { action: "decline", reason },
          response: ack,
        });
        setRespondedActionId(aid);
        setCheckout(await getCheckout(getJwt(), checkout.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to decline action");
      } finally {
        setActionBusy(false);
      }
    },
    [checkout, logCall, getJwt],
  );

  const handleCancel = useCallback(async () => {
    if (!checkout) return;
    setCancelling(true);
    try {
      await cancelCheckout(getJwt(), checkout.id);
      logCall({ method: "DELETE", path: `${BASE_PATH}/${checkout.id}` });
      setCheckout(await getCheckout(getJwt(), checkout.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel checkout");
    } finally {
      setCancelling(false);
    }
  }, [checkout, logCall, getJwt]);

  const handleReset = () => {
    setCheckout(null);
    setError(null);
    setRespondedActionId(null);
    setApiLog([]);
    setViewMode("ui");
    // Back to "What to buy" — the buyer profile from step 1 stays selected.
    setStep("buy");
  };

  const status = checkout?.status;
  const terminal = status ? isTerminal(status) : false;

  // The pending action drives a modal centered over the video.
  const pending = checkout?.pendingUserAction;
  const awaiting = status === "awaiting_user_action";
  // Only block the browser when there's a real, *unanswered* action. Once the
  // user has responded (or the agent is still acting without a concrete ask),
  // we keep the browser visible and show a small non-blocking indicator.
  const showActionForm = Boolean(awaiting && pending && respondedActionId !== pending.id);
  const showProcessing = Boolean(awaiting && pending && respondedActionId === pending.id);

  // Which step to render: a live checkout is always step 3.
  const currentStep: Step = checkout ? 3 : step === "buy" ? 2 : 1;
  const selectedProfile = profiles.find((p) => p.id === effectiveSelectedId) ?? null;
  const selectedProfileName = selectedProfile
    ? selectedProfile.label ||
      [selectedProfile.name?.first, selectedProfile.name?.last].filter(Boolean).join(" ") ||
      "Buyer profile"
    : null;

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#F7F5F4]">
      {/* Signed-in user — top right */}
      <div className="absolute right-8 top-5 z-30 flex items-center gap-3">
        <button
          onClick={() => stytch.session.revoke()}
          className="text-xs text-[#00150d]/40 transition-colors hover:text-[#00150d]/80"
        >
          Log out
        </button>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#eaeaea]">
          <span className="font-[family-name:var(--font-heading)] text-[15px] font-medium text-[#00150d]">
            {userInitial}
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-12 pt-[72px]">
        {/* Header */}
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-[28px] font-medium leading-none tracking-[-0.84px] text-[#00150d]">
              Agentic Checkouts
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#00150d]/55">
              Hand a product URL and an instruction to an agent. It drives a real browser to
              the checkout, pauses for anything only you can answer, and reports back.
            </p>
          </div>
          {checkout && (
            <div className="flex shrink-0 items-center gap-4">
              <ViewSwitch view={viewMode} onChange={setViewMode} />
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-[#00150d]/40 transition-colors hover:text-[#00150d]/80"
              >
                <RotateCcw className="size-3.5" /> New checkout
              </button>
            </div>
          )}
        </header>

        {/* Step 1 → 2 → 3 progress. Earlier steps are clickable until the
            checkout is live. */}
        <Stepper
          current={currentStep}
          onStep={checkout ? undefined : (n) => setStep(n === 1 ? "profile" : "buy")}
        />

        {currentStep === 1 ? (
          /* ── Step 1: pick or create a buyer profile ───────────────────── */
          <div key="step-profile" className="animate-fade-in">
            <BuyerProfilesView
              getJwt={getJwt}
              profiles={profiles}
              loading={profilesLoading}
              onCreated={handleProfileCreated}
              onUpdated={handleProfileUpdated}
              onDeleted={handleProfileDeleted}
              selectable
              selectedId={effectiveSelectedId}
              onSelect={setSelectedProfileId}
            />
            <div className="mx-auto mt-5 flex max-w-[680px] justify-end">
              <button
                onClick={() => setStep("buy")}
                disabled={!effectiveSelectedId}
                className="flex items-center gap-1.5 rounded-[8px] bg-[#05B959] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Continue <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        ) : currentStep === 2 ? (
          /* ── Step 2: what to buy ──────────────────────────────────────── */
          <div key="step-buy" className="animate-fade-in mx-auto max-w-[520px]">
            <div className="rounded-[12px] bg-white p-6">
              <h2 className="mb-1 font-[family-name:var(--font-heading)] text-[18px] font-medium text-[#00150d]">
                What do you want to buy?
              </h2>
              <p className="mb-5 text-sm text-[#00150d]/55">
                Paste a product URL and tell the agent what to do.
                {selectedProfileName && (
                  <>
                    {" "}
                    Shipping to{" "}
                    <span className="font-medium text-[#00150d]/80">{selectedProfileName}</span>.
                  </>
                )}
              </p>
              <CheckoutForm
                onSubmit={handleStartCheckout}
                onBack={() => setStep("profile")}
                submitting={creating}
                error={error}
              />
            </div>
          </div>
        ) : !checkout ? null : viewMode === "code" ? (
          /* ── Code view: live log of the API calls ─────────────────────── */
          <div key="code" className="animate-fade-in">
            <ApiLogView calls={apiLog} />
          </div>
        ) : (
          /* ── Live checkout: progress (left) + wide video (right) ──────── */
          <div
            key="checkout"
            className="animate-fade-in-up grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]"
          >
            {/* Progress — left */}
            <aside className="lg:sticky lg:top-8 lg:self-start">
              <div className="rounded-[12px] bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-[family-name:var(--font-heading)] text-[15px] font-medium text-[#00150d]">
                    Progress
                  </h3>
                  <StatusBadge status={checkout.status} />
                </div>
                <ProgressTimeline
                  items={checkout.progressItems ?? []}
                  live={status === "queued" || status === "running"}
                />
              </div>
            </aside>

            {/* Video + outcome — right (wide) */}
            <main className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 truncate text-xs text-[#00150d]/45">{checkout.target.url}</p>
                <div className="flex shrink-0 items-center gap-4">
                  <ElapsedTimer startedAt={startedAt} running={!terminal} />
                  {!terminal && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex items-center gap-1.5 text-xs text-[#00150d]/40 transition-colors hover:text-red-500 disabled:opacity-50"
                    >
                      {cancelling ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Instruction the agent is working from. */}
              {checkout.target.request && (
                <div className="rounded-[8px] bg-white px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#00150d]/40">
                    Instruction
                  </p>
                  <p className="mt-1 text-sm text-[#00150d]">“{checkout.target.request}”</p>
                  <p className="mt-1 font-mono text-[11px] text-[#00150d]/30">{checkout.id}</p>
                </div>
              )}

              {/* The video sits in a relative wrapper so the action modal can
                  overlay it precisely. */}
              <div className="relative">
                <BrowserFrame embedUrl={resolveEmbedUrl(checkout.browser?.embedUrl)} />

                {/* Full backdrop ONLY when the agent is genuinely blocked on the
                    buyer. Otherwise the browser stays visible so you can watch
                    the agent keep working. */}
                {showActionForm && (
                  <div className="animate-fade-in absolute inset-0 z-20 flex items-center justify-center rounded-[10px] bg-black/40 p-4 backdrop-blur-[2px]">
                    <div className="animate-fade-in-scale w-full max-w-[440px]">
                      <ActionForm
                        action={pending!}
                        onSubmit={handleSubmitAction}
                        onDecline={handleDeclineAction}
                        submitting={actionBusy}
                      />
                    </div>
                  </div>
                )}

                {/* Non-blocking toast while we wait for the server to move on
                    after the buyer responded. */}
                {showProcessing && (
                  <div className="animate-fade-in absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs text-[#00150d]/60 shadow-lg">
                    <Loader2 className="size-3.5 animate-spin text-[#05B959]" />
                    Processing your response…
                  </div>
                )}
              </div>

              {terminal && <OutcomeCard checkout={checkout} />}
            </main>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

// Root gate: show the Stytch login until the user is authenticated, then render
// the checkout app. CheckoutApp's hooks only run once a user exists, so the
// gate must live in a separate component to keep hook order stable.
export default function Page() {
  const { user } = useStytchUser();
  if (!user) return <LoginScreen />;
  return <CheckoutApp />;
}
