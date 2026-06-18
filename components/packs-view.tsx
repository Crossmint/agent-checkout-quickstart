"use client";

import { useCallback, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Store } from "lucide-react";
import { createPack, deletePack, updatePack } from "@/lib/agentic-checkout-api";
import type {
  ApiCall,
  CreatePackInput,
  PackManifest,
  UpdatePackInput,
} from "@/lib/agentic-checkout-types";
import { buildCreatePackBody } from "@/lib/agentic-checkout-types";
import { PackForm } from "@/components/pack-form";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { ApiLogView } from "@/components/api-log-view";

const PACKS_PATH = "/api/unstable/agentic-checkouts/packs";

/**
 * The Merchants tab: a pack *is* a merchant — its identity plus the phases the
 * agent follows on that store. Create one, see the ones this browser created
 * (re-fetched on load — there's no list endpoint), and delete them. A merchant
 * you add here shows up in the checkout form's "Use a pack" selector.
 */
export function PacksView({
  getJwt,
  packs,
  loading,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  getJwt: () => string;
  packs: PackManifest[];
  loading: boolean;
  onCreated: (pack: PackManifest) => void;
  onUpdated: (pack: PackManifest) => void;
  onDeleted: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("ui");
  const [showForm, setShowForm] = useState(false);
  // The pack being edited, or null when the form (if shown) is creating a new one.
  const [editing, setEditing] = useState<PackManifest | null>(null);
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
    async (input: CreatePackInput) => {
      setCreating(true);
      setError(null);
      try {
        const pack = await createPack(getJwt(), input);
        logCall({ method: "POST", path: PACKS_PATH, requestBody: buildCreatePackBody(input), response: pack });
        onCreated(pack);
        closeForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create pack");
      } finally {
        setCreating(false);
      }
    },
    [getJwt, logCall, onCreated, closeForm],
  );

  const handleUpdate = useCallback(
    async (id: string, original: PackManifest, input: CreatePackInput) => {
      setCreating(true);
      setError(null);
      // The form yields a full CreatePackInput; PATCH takes the same fields but
      // each is optional. Phases replace the stored record wholesale. Clearing a
      // description that was set needs an explicit null — an absent field is a no-op.
      const body: UpdatePackInput = {
        description: input.description ?? (original.description ? null : undefined),
        merchant: input.merchant,
        phases: input.phases,
      };
      try {
        const pack = await updatePack(getJwt(), id, body);
        logCall({ method: "PATCH", path: `${PACKS_PATH}/${id}`, requestBody: body, response: pack });
        onUpdated(pack);
        closeForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update pack");
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
        await deletePack(getJwt(), id);
        logCall({ method: "DELETE", path: `${PACKS_PATH}/${id}` });
        onDeleted(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete pack");
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
            Merchants
          </h2>
          <p className="mt-1 max-w-md text-sm text-[#00150d]/55">
            Each merchant is a pack: a store plus the phases the agent follows there. Attach one
            to a checkout with its <code className="font-mono text-xs">packId</code>.
          </p>
        </div>
        <ViewSwitch view={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === "code" ? (
        <ApiLogView calls={apiLog} />
      ) : showForm ? (
        <div className="rounded-[12px] bg-white p-6">
          <h3 className="mb-4 font-[family-name:var(--font-heading)] text-[16px] font-medium text-[#00150d]">
            {editing ? "Edit merchant" : "New merchant"}
          </h3>
          <PackForm
            // Remount when switching target so the form re-seeds its fields.
            key={editing?.id ?? "new"}
            initialPack={editing ?? undefined}
            onSubmit={
              editing ? (input) => handleUpdate(editing.id, editing, input) : handleCreate
            }
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
            <Plus className="size-4" /> Add merchant
          </button>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#00150d]/40">
              <Loader2 className="size-4 animate-spin" /> Loading your packs…
            </div>
          ) : packs.length === 0 ? (
            <div className="rounded-[12px] bg-white px-5 py-10 text-center">
              <Store className="mx-auto mb-3 size-6 text-[#00150d]/20" />
              <p className="text-sm text-[#00150d]/55">No merchants yet.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-[#00150d]/40">
                Merchants you add here are remembered in this browser — the API has no list
                endpoint, so a real app would track pack ids in its own database.
              </p>
            </div>
          ) : (
            packs.map((pack) => (
              <MerchantCard
                key={pack.id}
                pack={pack}
                deleting={deletingId === pack.id}
                onEdit={() => {
                  setError(null);
                  setEditing(pack);
                  setShowForm(true);
                }}
                onDelete={() => handleDelete(pack.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MerchantCard({
  pack,
  deleting,
  onEdit,
  onDelete,
}: {
  pack: PackManifest;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const phaseIds = Object.keys(pack.phases);
  return (
    <div className="rounded-[12px] bg-white p-5">
      <div className="flex items-start gap-3.5">
        <MerchantFavicon domain={pack.merchant.domains[0]} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate font-[family-name:var(--font-heading)] text-[15px] font-medium text-[#00150d]">
              {pack.merchant.displayName}
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onEdit}
                disabled={deleting}
                className="flex items-center text-[#00150d]/35 transition-colors hover:text-[#05B959] disabled:opacity-50"
                title="Edit merchant"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="flex items-center text-[#00150d]/35 transition-colors hover:text-red-500 disabled:opacity-50"
                title="Delete merchant"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#00150d]/45">
            <span className="truncate">{pack.merchant.domains.join(", ")}</span>
            <span>·</span>
            <span className="shrink-0">used {pack.timesUsed}×</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {phaseIds.map((id) => (
              <span
                key={id}
                className="rounded-full bg-black/[0.04] px-2 py-0.5 font-mono text-[11px] text-[#00150d]/60"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Merchant avatar: the store's favicon, falling back to a storefront glyph when
 * the domain has none (or the request is blocked). Keeps the list reading as a
 * row of stores rather than abstract "packs".
 */
function MerchantFavicon({ domain }: { domain?: string }) {
  const [failed, setFailed] = useState(false);
  const base =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAFA]";

  if (!domain || failed) {
    return (
      <div className={base}>
        <Store className="size-4 text-[#00150d]/30" />
      </div>
    );
  }
  return (
    <div className={base}>
      {/* eslint-disable-next-line @next/next/no-img-element -- favicon for an arbitrary merchant domain; next/image would need every host whitelisted. */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={24}
        height={24}
        className="size-6 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
