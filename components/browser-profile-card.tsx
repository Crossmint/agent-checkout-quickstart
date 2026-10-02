"use client";

import { useCallback, useState } from "react";
import { Check, Fingerprint, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  BrowserProfileExistsError,
  createBrowserProfile,
  deleteBrowserProfile,
  findBrowserProfile,
  updateBrowserProfile,
} from "@/lib/agent-checkout-api";
import type { ApiCall, BrowserProfile } from "@/lib/agent-checkout-types";

const BROWSER_PROFILES_PATH = "/api/unstable/agent-checkouts/browser-profiles";
const DOCS_URL = "https://docs.crossmint.com/agents/payment-flows/agent-checkouts-browser-profiles";

/**
 * The browser-profile half of step 1. Unlike buyer profiles this is not a
 * picker: a user holds at most one profile, so the card either offers to create
 * it or shows the one they have, with a toggle deciding whether this checkout
 * runs inside it (`browser.profileId`).
 */
export function BrowserProfileCard({
  getJwt,
  profile,
  loading,
  enabled,
  onToggle,
  onLoaded,
  onDeleted,
  logCall,
}: {
  getJwt: () => string;
  profile: BrowserProfile | null;
  loading: boolean;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onLoaded: (profile: BrowserProfile) => void;
  onDeleted: () => void;
  logCall: (call: Omit<ApiCall, "at">) => void;
}) {
  const [label, setLabel] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const body = label.trim() ? { label: label.trim() } : {};
      const created = await createBrowserProfile(getJwt(), body);
      logCall({ method: "POST", path: BROWSER_PROFILES_PATH, requestBody: body, response: created });
      onLoaded(created);
      setLabel("");
    } catch (err) {
      if (err instanceof BrowserProfileExistsError) {
        // Another tab (or an earlier run of this demo) already created it —
        // adopt that one instead of surfacing a conflict. The lookup can fail
        // in its own right (e.g. a key with create but not read scope), so it
        // falls through to the error below rather than rejecting unhandled.
        try {
          const existing = await findBrowserProfile(getJwt());
          logCall({ method: "GET", path: BROWSER_PROFILES_PATH, response: { data: existing ? [existing] : [] } });
          if (existing) {
            onLoaded(existing);
            return;
          }
          setError("This user already has a browser profile, but it couldn't be loaded");
          return;
        } catch (lookupErr) {
          setError(
            lookupErr instanceof Error
              ? lookupErr.message
              : "This user already has a browser profile, but it couldn't be loaded",
          );
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Failed to create browser profile");
    } finally {
      setBusy(false);
    }
  }, [getJwt, label, logCall, onLoaded]);

  const handleRename = useCallback(async () => {
    if (profile == null || !label.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    const body = { label: label.trim() };
    try {
      const updated = await updateBrowserProfile(getJwt(), profile.id, body);
      logCall({
        method: "PATCH",
        path: `${BROWSER_PROFILES_PATH}/${profile.id}`,
        requestBody: body,
        response: updated,
      });
      onLoaded(updated);
      setRenaming(false);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename browser profile");
    } finally {
      setBusy(false);
    }
  }, [getJwt, label, logCall, onLoaded, profile]);

  const handleDelete = useCallback(async () => {
    if (profile == null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteBrowserProfile(getJwt(), profile.id);
      logCall({ method: "DELETE", path: `${BROWSER_PROFILES_PATH}/${profile.id}` });
      onDeleted();
      setConfirmingDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete browser profile");
    } finally {
      setBusy(false);
    }
  }, [getJwt, logCall, onDeleted, profile]);

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-medium text-[#00150d]">
          Reuse your merchant logins
        </h2>
        <p className="mt-1 max-w-md text-sm text-[#00150d]/55">
          A browser profile is a saved browser identity. Sign in at the merchant once, inside the
          run, and later checkouts start already signed in — attached with{" "}
          <code className="font-mono text-xs">browser.profileId</code>.
        </p>
      </div>

      <div className="rounded-[12px] bg-white p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-[#00150d]/40">
            <Loader2 className="size-4 animate-spin" /> Loading your browser profile…
          </div>
        ) : profile == null ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optional) — e.g. My logins"
                maxLength={120}
                className="min-w-0 flex-1 rounded-[8px] border border-[rgba(0,0,0,0.12)] px-3 py-2 text-sm outline-none focus:border-[#05B959]"
              />
              <button
                onClick={handleCreate}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 rounded-[8px] bg-[#05B959] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create profile
              </button>
            </div>
            <p className="text-xs text-[#00150d]/45">
              A new profile is empty, so this checkout still asks the user to sign in — they do it
              in the embedded browser. The next one skips it.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAFA]">
                <Fingerprint className="size-4 text-[#00150d]/40" />
              </div>
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="New label"
                      maxLength={120}
                      autoFocus
                      className="min-w-0 flex-1 rounded-[8px] border border-[rgba(0,0,0,0.12)] px-2.5 py-1.5 text-sm outline-none focus:border-[#05B959]"
                    />
                    <button
                      onClick={handleRename}
                      disabled={busy || !label.trim()}
                      className="flex items-center text-[#00150d]/35 transition-colors hover:text-[#05B959] disabled:opacity-40"
                      title="Save label"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setRenaming(false);
                        setLabel("");
                      }}
                      className="flex items-center text-[#00150d]/35 transition-colors hover:text-[#00150d]/70"
                      title="Cancel"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-[family-name:var(--font-heading)] text-[15px] font-medium text-[#00150d]">
                        {profile.label || "Browser profile"}
                      </h3>
                      <p className="mt-0.5 font-mono text-[11px] text-[#00150d]/35">{profile.id}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => {
                          setLabel(profile.label ?? "");
                          setRenaming(true);
                        }}
                        disabled={busy}
                        className="flex items-center text-[#00150d]/35 transition-colors hover:text-[#05B959] disabled:opacity-50"
                        title="Rename profile"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(true)}
                        disabled={busy}
                        className="flex items-center text-[#00150d]/35 transition-colors hover:text-red-500 disabled:opacity-50"
                        title="Delete profile"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => onToggle(!enabled)}
              className="flex w-full items-center gap-2.5 border-t border-[rgba(0,0,0,0.06)] pt-3 text-left text-sm text-[#00150d]/70"
            >
              <span
                className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                  enabled ? "bg-[#05B959]" : "bg-[rgba(0,0,0,0.15)]"
                }`}
                aria-hidden
              >
                <span
                  className={`size-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : ""}`}
                />
              </span>
              Use this profile for this checkout
            </button>

            {confirmingDelete && (
              <div className="rounded-[8px] bg-red-50 px-3 py-2.5">
                <p className="text-sm text-red-700">
                  Deleting erases the saved browser state, not just our record of it. Every merchant
                  login in this profile is gone and the next checkout starts from a signed-out
                  browser.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-[6px] bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    Delete anyway
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="text-xs text-[#00150d]/50 transition-colors hover:text-[#00150d]"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-xs text-[#00150d]/45">
        <li>
          Crossmint stores metadata only — an id, your label, and timestamps. The browser state
          itself is an opaque blob Crossmint never reads, and no cookie or token comes back over
          the API.
        </li>
        <li>Its contents never reach a model: they load into that user&apos;s browser and nowhere else.</li>
        <li>
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="underline hover:text-[#00150d]/70">
            Browser profiles in the docs
          </a>
        </li>
      </ul>
    </div>
  );
}
