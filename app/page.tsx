"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, X, Store, ShoppingBag } from "lucide-react";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import {
  createCheckout,
  getCheckout,
  submitAction,
  declineAction,
  cancelCheckout,
  resolveEmbedUrl,
  getPack,
  PackNotFoundError,
} from "@/lib/agentic-checkout-api";
import { getStoredPackIds, addStoredPackId, removeStoredPackId } from "@/lib/pack-store";
import { LoginScreen } from "@/components/login-screen";
import {
  buildCreateCheckoutBody,
  isTerminal,
  type ApiCall,
  type CheckoutView,
  type CreateCheckoutInput,
  type PackManifest,
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
import { PacksView } from "@/components/packs-view";

const POLL_INTERVAL_MS = 1500;
const BASE_PATH = "/api/unstable/agentic-checkouts";

type Tab = "checkout" | "packs";

function CheckoutApp() {
  const stytch = useStytch();
  const { user } = useStytchUser();
  // The Stytch session JWT authorizes every Agentic Checkouts call on behalf of
  // the signed-in user. Read it fresh per call so a refreshed session is picked up.
  const getJwt = useCallback(() => stytch.session.getTokens()?.session_jwt ?? "", [stytch]);

  const userEmail = user?.emails?.[0]?.email ?? "";
  const userInitial = userEmail[0]?.toUpperCase() ?? "U";

  const [tab, setTab] = useState<Tab>("checkout");

  // Packs the agent can be guided by. There's no list endpoint, so we re-fetch
  // the ids this browser created (see lib/pack-store.ts) and prune any the API
  // reports gone. Shared between the Packs tab and the checkout form's selector.
  const [packs, setPacks] = useState<PackManifest[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = getStoredPackIds();
      const loaded = await Promise.all(
        ids.map(async (id) => {
          try {
            return await getPack(getJwt(), id);
          } catch (err) {
            // A 404 means the pack was deleted elsewhere — forget it.
            if (err instanceof PackNotFoundError) removeStoredPackId(id);
            return null;
          }
        }),
      );
      if (cancelled) return;
      setPacks(loaded.filter((p): p is PackManifest => p !== null));
      setPacksLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [getJwt]);

  const handlePackCreated = useCallback((pack: PackManifest) => {
    addStoredPackId(pack.id);
    setPacks((prev) => [pack, ...prev.filter((p) => p.id !== pack.id)]);
  }, []);

  const handlePackUpdated = useCallback((pack: PackManifest) => {
    setPacks((prev) => prev.map((p) => (p.id === pack.id ? pack : p)));
  }, []);

  const handlePackDeleted = useCallback((id: string) => {
    removeStoredPackId(id);
    setPacks((prev) => prev.filter((p) => p.id !== id));
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
      setCheckout(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout");
    } finally {
      setCreating(false);
    }
  }, [logCall, getJwt]);

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
          {tab === "checkout" && checkout && (
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

        {/* Tab nav: Checkout ↔ Packs */}
        <nav className="mb-9 flex items-center gap-1 border-b border-[rgba(0,0,0,0.08)]">
          <TabButton active={tab === "checkout"} onClick={() => setTab("checkout")}>
            <ShoppingBag className="size-3.5" />
            Checkout
          </TabButton>
          <TabButton active={tab === "packs"} onClick={() => setTab("packs")}>
            <Store className="size-3.5" />
            Merchants
            {packs.length > 0 && (
              <span className="rounded-full bg-black/[0.06] px-1.5 text-[11px] text-[#00150d]/50">
                {packs.length}
              </span>
            )}
          </TabButton>
        </nav>

        {tab === "packs" ? (
          <PacksView
            getJwt={getJwt}
            packs={packs}
            loading={packsLoading}
            onCreated={handlePackCreated}
            onUpdated={handlePackUpdated}
            onDeleted={handlePackDeleted}
          />
        ) : !checkout ? (
          /* ── Create form ──────────────────────────────────────────────── */
          <div key="form" className="animate-fade-in mx-auto max-w-[520px]">
            <div className="rounded-[12px] bg-white p-6">
              <h2 className="mb-1 font-[family-name:var(--font-heading)] text-[18px] font-medium text-[#00150d]">
                New checkout
              </h2>
              <p className="mb-5 text-sm text-[#00150d]/55">
                The agent will try to buy this item for you.
              </p>
              <CheckoutForm onSubmit={handleCreate} submitting={creating} error={error} packs={packs} />
            </div>
          </div>
        ) : viewMode === "code" ? (
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
              <div className="flex items-center justify-between">
                <p className="truncate text-xs text-[#00150d]/45">{checkout.target.url}</p>
                {!terminal && (
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex shrink-0 items-center gap-1.5 text-xs text-[#00150d]/40 transition-colors hover:text-red-500 disabled:opacity-50"
                  >
                    {cancelling ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                    Cancel
                  </button>
                )}
              </div>

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

              {checkout.target.request && (
                <div className="rounded-[8px] bg-white px-4 py-3">
                  <p className="text-sm text-[#00150d]">“{checkout.target.request}”</p>
                  <p className="mt-1 font-mono text-[11px] text-[#00150d]/30">{checkout.id}</p>
                </div>
              )}

              {/* Pack provenance: which pack (and phases) guided this run. */}
              {checkout.pack && (
                <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-white px-4 py-3 text-sm">
                  <Store className="size-4 shrink-0 text-[#05B959]" />
                  <span className="text-[#00150d]">
                    Guided by <span className="font-medium">{checkout.pack.merchantDisplayName}</span>
                  </span>
                  {checkout.pack.phasesUsed.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {checkout.pack.phasesUsed.map((id) => (
                        <span
                          key={id}
                          className="rounded-full bg-black/[0.04] px-2 py-0.5 font-mono text-[11px] text-[#00150d]/60"
                        >
                          {id}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              )}

              {terminal && <OutcomeCard checkout={checkout} />}
            </main>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-[#05B959] text-[#00150d]"
          : "border-transparent text-[#00150d]/45 hover:text-[#00150d]/70"
      }`}
    >
      {children}
    </button>
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
