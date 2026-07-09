"use client";

import { useCallback, useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import {
  createBuyerProfile,
  deleteBuyerProfile,
  updateBuyerProfile,
} from "@/lib/agentic-checkout-api";
import type {
  ApiCall,
  BuyerProfile,
  CreateBuyerProfileInput,
  UpdateBuyerProfileInput,
} from "@/lib/agentic-checkout-types";
import { buildCreateBuyerProfileBody } from "@/lib/agentic-checkout-types";
import { BuyerProfileForm } from "@/components/buyer-profile-form";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { ApiLogView } from "@/components/api-log-view";

const PROFILES_PATH = "/api/unstable/agent-checkouts/buyer-profiles";

/**
 * The Buyer profiles tab: a profile holds the buyer's name, contact, and
 * shipping (no payment). Create one, see all of yours (fetched from the list
 * endpoint), edit, and delete. A profile here shows up in the checkout form's
 * "Buyer profile" selector, where it's attached via `buyerProfileId`.
 */
export function BuyerProfilesView({
  getJwt,
  profiles,
  loading,
  onCreated,
  onUpdated,
  onDeleted,
  // When set, the list becomes a picker: cards are selectable and the chosen id
  // is highlighted. Used by step 1 of the checkout flow.
  selectable = false,
  selectedId = null,
  onSelect,
}: {
  getJwt: () => string;
  profiles: BuyerProfile[];
  loading: boolean;
  onCreated: (profile: BuyerProfile) => void;
  onUpdated: (profile: BuyerProfile) => void;
  onDeleted: (id: string) => void;
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("ui");
  const [showForm, setShowForm] = useState(false);
  // The profile being edited, or null when the form (if shown) is creating a new one.
  const [editing, setEditing] = useState<BuyerProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [apiLog, setApiLog] = useState<ApiCall[]>([]);
  const logCall = useCallback((call: Omit<ApiCall, "at">) => {
    setApiLog((prev) => [...prev, { ...call, at: new Date().toLocaleTimeString() }]);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  const handleCreate = useCallback(
    async (input: CreateBuyerProfileInput) => {
      setCreating(true);
      setError(null);
      try {
        const profile = await createBuyerProfile(getJwt(), input);
        logCall({
          method: "POST",
          path: PROFILES_PATH,
          requestBody: buildCreateBuyerProfileBody(input),
          response: profile,
        });
        onCreated(profile);
        closeForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create buyer profile");
      } finally {
        setCreating(false);
      }
    },
    [getJwt, logCall, onCreated, closeForm],
  );

  const handleUpdate = useCallback(
    async (id: string, input: CreateBuyerProfileInput) => {
      setCreating(true);
      setError(null);
      // The form yields a full CreateBuyerProfileInput; PATCH takes the same
      // fields but each is optional. We send the writable fields the form
      // gathered — shipping is sent in full.
      const body: UpdateBuyerProfileInput = {
        ...(input.label ? { label: input.label } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.contact ? { contact: input.contact } : {}),
        shipping: input.shipping,
      };
      try {
        const profile = await updateBuyerProfile(getJwt(), id, body);
        logCall({ method: "PATCH", path: `${PROFILES_PATH}/${id}`, requestBody: body, response: profile });
        onUpdated(profile);
        closeForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update buyer profile");
      } finally {
        setCreating(false);
      }
    },
    [getJwt, logCall, onUpdated, closeForm],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setError(null);
      try {
        await deleteBuyerProfile(getJwt(), id);
        logCall({ method: "DELETE", path: `${PROFILES_PATH}/${id}` });
        onDeleted(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete buyer profile");
      } finally {
        setDeletingId(null);
      }
    },
    [getJwt, logCall, onDeleted],
  );

  return (
    <div className="animate-fade-in mx-auto max-w-[680px]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-medium text-[#00150d]">
            {selectable ? "Choose a buyer profile" : "Buyer profiles"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-[#00150d]/55">
            {selectable ? (
              <>Pick the profile the agent will ship to and contact for this checkout, or add a new one.</>
            ) : (
              <>
                A profile saves the buyer&apos;s name, contact, and shipping (no payment). Attach
                one to a checkout with its{" "}
                <code className="font-mono text-xs">buyerProfileId</code>.
              </>
            )}
          </p>
        </div>
        <ViewSwitch view={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === "code" ? (
        <ApiLogView calls={apiLog} />
      ) : showForm ? (
        <div className="rounded-[12px] bg-white p-6">
          <h3 className="mb-4 font-[family-name:var(--font-heading)] text-[16px] font-medium text-[#00150d]">
            {editing ? "Edit buyer profile" : "New buyer profile"}
          </h3>
          <BuyerProfileForm
            // Remount when switching target so the form re-seeds its fields.
            key={editing?.id ?? "new"}
            initialProfile={editing ?? undefined}
            onSubmit={editing ? (input) => handleUpdate(editing.id, input) : handleCreate}
            onCancel={closeForm}
            submitting={creating}
            error={error}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => {
              setError(null);
              setEditing(null);
              setShowForm(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[rgba(0,0,0,0.18)] bg-white/40 py-3 text-sm font-medium text-[#00150d]/70 transition-colors hover:border-[#05B959]/50 hover:text-[#00150d]"
          >
            <Plus className="size-4" /> Add buyer profile
          </button>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#00150d]/40">
              <Loader2 className="size-4 animate-spin" /> Loading your profiles…
            </div>
          ) : profiles.length === 0 ? (
            <div className="rounded-[12px] bg-white px-5 py-10 text-center">
              <UserRound className="mx-auto mb-3 size-6 text-[#00150d]/20" />
              <p className="text-sm text-[#00150d]/55">No buyer profiles yet.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-[#00150d]/40">
                Add one and it&apos;s available to attach to any checkout from the selector on the
                create form.
              </p>
            </div>
          ) : (
            profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                deleting={deletingId === profile.id}
                selectable={selectable}
                selected={selectable && selectedId === profile.id}
                onSelect={selectable && onSelect ? () => onSelect(profile.id) : undefined}
                onEdit={() => {
                  setError(null);
                  setEditing(profile);
                  setShowForm(true);
                }}
                onDelete={() => handleDelete(profile.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function fullName(profile: BuyerProfile): string {
  const parts = [profile.name?.first, profile.name?.last].filter(Boolean);
  return parts.join(" ");
}

function shortAddress(profile: BuyerProfile): string {
  const s = profile.shipping;
  // administrativeAreaCode may be a prefixed code ("US-CA"), a bare code, or a
  // full name ("Florida"). Show the subdivision part of a prefixed code, else
  // the value as-is, falling back to the country.
  const region = s.administrativeAreaCode?.includes("-")
    ? s.administrativeAreaCode.split("-")[1]
    : s.administrativeAreaCode;
  return [s.addressLines[0], s.locality, region || s.countryCode].filter(Boolean).join(", ");
}

function ProfileCard({
  profile,
  deleting,
  selectable = false,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
}: {
  profile: BuyerProfile;
  deleting: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = fullName(profile);
  const title = profile.label || name || "Buyer profile";
  return (
    <div
      onClick={onSelect}
      className={`rounded-[12px] bg-white p-5 transition-shadow ${
        selectable ? "cursor-pointer" : ""
      } ${selected ? "shadow-[0_0_0_2px_#05B959]" : selectable ? "hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" : ""}`}
    >
      <div className="flex items-start gap-3.5">
        {selectable && (
          <span
            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
              selected ? "border-[#05B959] bg-[#05B959]" : "border-[rgba(0,0,0,0.25)]"
            }`}
            aria-hidden
          >
            {selected && <span className="size-1.5 rounded-full bg-white" />}
          </span>
        )}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAFA]">
          <UserRound className="size-4 text-[#00150d]/40" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate font-[family-name:var(--font-heading)] text-[15px] font-medium text-[#00150d]">
              {title}
              {profile.label && name && (
                <span className="ml-2 font-[family-name:var(--font-sans)] text-xs font-normal text-[#00150d]/45">
                  {name}
                </span>
              )}
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                disabled={deleting}
                className="flex items-center text-[#00150d]/35 transition-colors hover:text-[#05B959] disabled:opacity-50"
                title="Edit profile"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={deleting}
                className="flex items-center text-[#00150d]/35 transition-colors hover:text-red-500 disabled:opacity-50"
                title="Delete profile"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#00150d]/45">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{shortAddress(profile)}</span>
          </div>
          {profile.contact?.email && (
            <p className="mt-0.5 truncate text-xs text-[#00150d]/45">{profile.contact.email}</p>
          )}
        </div>
      </div>
    </div>
  );
}
