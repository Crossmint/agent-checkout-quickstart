"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, RotateCcw, X } from "lucide-react";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import {
  createCheckout,
  getCheckout,
  listAllMessages,
  submitInput,
  declineInput,
  cancelCheckout,
  resolveEmbedUrl,
  listAllBuyerProfiles,
  findBrowserProfile,
} from "@/lib/agent-checkout-api";
import { LoginScreen } from "@/components/login-screen";
import {
  buildCreateCheckoutBody,
  isTerminal,
  type ApiCall,
  type BrowserProfile,
  type BuyerProfile,
  type CheckoutMessage,
  type CheckoutView,
  type CreateCheckoutInput,
  type InputResponse,
} from "@/lib/agent-checkout-types";
import { CheckoutForm } from "@/components/checkout-form";
import { StatusBadge } from "@/components/status-badge";
import { ProgressTimeline, timelineItems } from "@/components/progress-timeline";
import { BrowserFrame } from "@/components/browser-frame";
import { ActionForm } from "@/components/action-form";
import { OutcomeCard } from "@/components/outcome-card";
import { Footer } from "@/components/footer";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { ApiLogView } from "@/components/api-log-view";
import { BuyerProfilesView } from "@/components/buyer-profiles-view";
import { BrowserProfileCard } from "@/components/browser-profile-card";
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
  // The Stytch session JWT authorizes every Agent Checkouts call on behalf of
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

  // The user's browser profile (at most one), and whether this checkout should
  // run inside it. Reuse is the point of the profile, so it's on by default.
  const [browserProfile, setBrowserProfile] = useState<BrowserProfile | null>(null);
  const [browserProfileLoading, setBrowserProfileLoading] = useState(true);
  const [attachBrowserProfile, setAttachBrowserProfile] = useState(true);

  // Step 1's own "Code" log, shared by both profile cards.
  const [setupView, setSetupView] = useState<ViewMode>("ui");
  const [setupLog, setSetupLog] = useState<ApiCall[]>([]);
  const logSetupCall = useCallback((call: Omit<ApiCall, "at">) => {
    setSetupLog((prev) => [...prev, { ...call, at: new Date().toLocaleTimeString() }]);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await findBrowserProfile(getJwt());
        if (!cancelled) setBrowserProfile(loaded);
      } catch (err) {
        console.error("Failed to load browser profile:", err);
      } finally {
        if (!cancelled) setBrowserProfileLoading(false);
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
  // The run's conversation (GET /:id/messages): the run view itself only carries
  // status + outcome, so the timeline is built from these.
  const [messages, setMessages] = useState<CheckoutMessage[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Track the input request we've already answered so we don't re-render the
  // form while the next poll still reports the same requiredAction.
  const [respondedRequestId, setRespondedRequestId] = useState<string | null>(null);

  // "Code" view: a running log of the API calls the app makes.
  const [viewMode, setViewMode] = useState<ViewMode>("ui");
  const [apiLog, setApiLog] = useState<ApiCall[]>([]);
  const logCall = useCallback((call: Omit<ApiCall, "at">) => {
    setApiLog((prev) => [...prev, { ...call, at: new Date().toLocaleTimeString() }]);
  }, []);

  // Refresh both the run view and its messages. Used by the poll loop and right
  // after every write so the UI moves on without waiting for the next tick.
  const refresh = useCallback(
    async (runId: string) => {
      const [next, nextMessages] = await Promise.all([
        getCheckout(getJwt(), runId),
        listAllMessages(getJwt(), runId),
      ]);
      setCheckout(next);
      setMessages(nextMessages);
      return { next, nextMessages };
    },
    [getJwt],
  );

  // ── Polling loop ──────────────────────────────────────────────────────────
  // No webhooks: poll GET /:id and GET /:id/messages every ~1.5s until a
  // terminal state. (GET /:id/messages/stream offers the same over SSE; this
  // demo polls to keep the loop easy to read.) setCheckout returns a fresh
  // object each poll, re-running this effect.
  useEffect(() => {
    if (!checkout || isTerminal(checkout.status)) return;
    // While the agent is blocked on an *unanswered* input request, nothing
    // changes server-side until the buyer responds — so we stop polling
    // entirely. Once they've responded (respondedRequestId matches), we resume
    // so we can catch the server moving past awaiting_input.
    const waitingOnUser =
      checkout.status === "awaiting_input" &&
      !!checkout.requiredAction &&
      respondedRequestId !== checkout.requiredAction.requestId;
    if (waitingOnUser) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const before = { status: checkout.status, revision: checkout.revision, messages: messages.length };
        const { next, nextMessages } = await refresh(checkout.runId);
        if (cancelled) return;
        // Log a poll only when something changed, so the Code view stays readable.
        if (next.status !== before.status || next.revision !== before.revision) {
          logCall({ method: "GET", path: `${BASE_PATH}/${next.runId}`, response: next });
        }
        if (nextMessages.length !== before.messages) {
          logCall({
            method: "GET",
            path: `${BASE_PATH}/${next.runId}/messages`,
            response: { data: nextMessages.slice(before.messages) },
          });
        }
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
  }, [checkout, messages.length, respondedRequestId, logCall, refresh]);

  const handleCreate = useCallback(async (input: CreateCheckoutInput) => {
    setCreating(true);
    setError(null);
    setRespondedRequestId(null);
    setApiLog([]);
    setMessages([]);
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
    (startUrl: string, task: string, merchantGuidance: string) => {
      handleCreate({
        startUrl,
        task: task.trim() || undefined,
        merchantGuidance: merchantGuidance.trim() || undefined,
        maxCostAmount: HIGH_MAX_COST.amount,
        maxCostCurrency: HIGH_MAX_COST.currency,
        buyerProfileId: effectiveSelectedId ?? undefined,
        browserProfileId: attachBrowserProfile ? (browserProfile?.id ?? undefined) : undefined,
      });
    },
    [handleCreate, effectiveSelectedId, attachBrowserProfile, browserProfile],
  );

  const handleSubmitAction = useCallback(
    async (response: InputResponse) => {
      if (!checkout?.requiredAction) return;
      const { requestId } = checkout.requiredAction;
      setActionBusy(true);
      setError(null);
      try {
        const { body, ack } = await submitInput(getJwt(), checkout.runId, requestId, response);
        logCall({
          method: "POST",
          path: `${BASE_PATH}/${checkout.runId}/messages`,
          requestBody: body,
          response: ack,
        });
        setRespondedRequestId(requestId);
        await refresh(checkout.runId);
      } catch (err) {
        console.error("Submit input failed:", err);
        setError(err instanceof Error ? err.message : "Failed to submit your answer");
      } finally {
        setActionBusy(false);
      }
    },
    [checkout, logCall, getJwt, refresh],
  );

  const handleDeclineAction = useCallback(async () => {
    if (!checkout?.requiredAction) return;
    const { requestId } = checkout.requiredAction;
    setActionBusy(true);
    setError(null);
    try {
      const { body, ack } = await declineInput(getJwt(), checkout.runId, requestId);
      logCall({
        method: "POST",
        path: `${BASE_PATH}/${checkout.runId}/messages`,
        requestBody: body,
        response: ack,
      });
      setRespondedRequestId(requestId);
      await refresh(checkout.runId);
    } catch (err) {
      console.error("Decline input failed:", err);
      setError(err instanceof Error ? err.message : "Failed to decline");
    } finally {
      setActionBusy(false);
    }
  }, [checkout, logCall, getJwt, refresh]);

  const handleCancel = useCallback(async () => {
    if (!checkout) return;
    setCancelling(true);
    setError(null);
    try {
      const ack = await cancelCheckout(getJwt(), checkout.runId);
      logCall({ method: "POST", path: `${BASE_PATH}/${checkout.runId}/cancel`, response: ack });
      await refresh(checkout.runId);
    } catch (err) {
      console.error("Cancel checkout failed:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel checkout");
    } finally {
      setCancelling(false);
    }
  }, [checkout, logCall, getJwt, refresh]);

  const handleReset = () => {
    setCheckout(null);
    setMessages([]);
    setError(null);
    setRespondedRequestId(null);
    setApiLog([]);
    setViewMode("ui");
    // Back to "What to buy" — the buyer profile from step 1 stays selected.
    setStep("buy");
  };

  const status = checkout?.status;
  const terminal = status ? isTerminal(status) : false;

  // The required action drives a modal centered over the video.
  const pending = checkout?.requiredAction ?? null;
  const awaiting = status === "awaiting_input";
  // Only block the browser when there's a real, *unanswered* request. Once the
  // user has responded (or the agent is still acting without a concrete ask),
  // we keep the browser visible and show a small non-blocking indicator.
  const showActionForm = Boolean(awaiting && pending && respondedRequestId !== pending.requestId);
  const showProcessing = Boolean(awaiting && pending && respondedRequestId === pending.requestId);
  const timeline = timelineItems(messages);

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
              Agent Checkouts
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
              viewMode={setupView}
              onViewMode={setSetupView}
              apiLog={setupLog}
              logCall={logSetupCall}
            />
            {setupView === "ui" && (
              <div className="mx-auto max-w-[680px]">
                <BrowserProfileCard
                  getJwt={getJwt}
                  profile={browserProfile}
                  loading={browserProfileLoading}
                  enabled={attachBrowserProfile}
                  onToggle={setAttachBrowserProfile}
                  onLoaded={setBrowserProfile}
                  onDeleted={() => setBrowserProfile(null)}
                  logCall={logSetupCall}
                />
              </div>
            )}
            <div className="mx-auto mt-5 flex max-w-[680px] justify-end">
              <button
                onClick={() => setStep("buy")}
                disabled={!effectiveSelectedId || browserProfileLoading}
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
                {attachBrowserProfile && browserProfile && (
                  <> Running in your saved browser profile, so merchant logins carry over.</>
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
                  items={timeline}
                  live={status === "queued" || status === "running"}
                />
              </div>
            </aside>

            {/* Video + outcome — right (wide) */}
            <main className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 truncate text-xs text-[#00150d]/45">{checkout.input.request.startUrl}</p>
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
              {checkout.input.request.task && (
                <div className="rounded-[8px] bg-white px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#00150d]/40">
                    Task
                  </p>
                  <p className="mt-1 text-sm text-[#00150d]">“{checkout.input.request.task}”</p>
                  <p className="mt-1 font-mono text-[11px] text-[#00150d]/30">{checkout.runId}</p>
                </div>
              )}

              {/* Failed submit/decline/cancel calls land here. Rendered outside
                  the video wrapper so it stays visible under the action modal. */}
              {error && (
                <div
                  role="alert"
                  className="animate-fade-in flex items-start justify-between gap-3 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3"
                >
                  <p className="min-w-0 break-words text-sm text-red-700">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                    className="shrink-0 text-red-400 transition-colors hover:text-red-600"
                  >
                    <X className="size-3.5" />
                  </button>
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
                        jwt={getJwt()}
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

              {terminal && <OutcomeCard checkout={checkout} messages={messages} />}
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
