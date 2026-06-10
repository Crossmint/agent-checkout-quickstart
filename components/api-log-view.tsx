"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ApiCall } from "@/lib/agentic-checkout-types";

const METHOD_COLOR: Record<ApiCall["method"], string> = {
  POST: "#05B959",
  GET: "#2377FF",
  DELETE: "#dc2626",
};

function Block({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#00150d]/35">
        {label}
      </div>
      <pre className="overflow-auto rounded-[6px] bg-black/[0.03] p-3 font-mono text-xs leading-relaxed text-[#00150d]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * A single API call: a clickable summary header (method + path + time) that
 * expands to show the request/response.
 */
function CallRow({
  call,
  open,
  onToggle,
}: {
  call: ApiCall;
  open: boolean;
  onToggle: () => void;
}) {
  const hasBody = call.requestBody !== undefined || call.response !== undefined;

  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-[#00150d]/30 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span
          className="rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white"
          style={{ backgroundColor: METHOD_COLOR[call.method] }}
        >
          {call.method}
        </span>
        <code className="truncate font-mono text-xs text-[#00150d]/70">{call.path}</code>
        <span className="ml-auto shrink-0 text-[11px] text-[#00150d]/30">{call.at}</span>
      </button>

      {open && hasBody && (
        <div className="space-y-3 border-t border-[rgba(0,0,0,0.06)] p-4">
          {call.requestBody !== undefined && <Block label="Request" value={call.requestBody} />}
          {call.response !== undefined && <Block label="Response" value={call.response} />}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the live log of API calls the app makes through the checkout
 * lifecycle — newest last, each collapsible. The newest call is expanded by
 * default; older ones collapse as new calls arrive so the list stays scannable.
 * An explicit toggle sticks (overrides the auto behavior for that entry).
 */
export function ApiLogView({ calls }: { calls: ApiCall[] }) {
  // index → user's explicit open/closed choice. Absent ⇒ use the default
  // (only the newest entry is open).
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  if (calls.length === 0) {
    return <p className="text-sm text-[#00150d]/40">No API calls yet.</p>;
  }

  const last = calls.length - 1;

  return (
    <div className="space-y-2">
      {calls.map((call, i) => {
        const open = overrides[i] ?? i === last;
        return (
          <CallRow
            key={i}
            call={call}
            open={open}
            onToggle={() => setOverrides((prev) => ({ ...prev, [i]: !open }))}
          />
        );
      })}
    </div>
  );
}
