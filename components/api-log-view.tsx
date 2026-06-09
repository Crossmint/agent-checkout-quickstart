"use client";

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
 * Renders the live log of API calls the app makes through the checkout
 * lifecycle — request body + response for each, newest last.
 */
export function ApiLogView({ calls }: { calls: ApiCall[] }) {
  if (calls.length === 0) {
    return <p className="text-sm text-[#00150d]/40">No API calls yet.</p>;
  }

  return (
    <div className="space-y-4">
      {calls.map((call, i) => (
        <div key={i} className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white"
              style={{ backgroundColor: METHOD_COLOR[call.method] }}
            >
              {call.method}
            </span>
            <code className="truncate font-mono text-xs text-[#00150d]/70">{call.path}</code>
            <span className="ml-auto shrink-0 text-[11px] text-[#00150d]/30">{call.at}</span>
          </div>
          <div className="space-y-3">
            {call.requestBody !== undefined && <Block label="Request" value={call.requestBody} />}
            {call.response !== undefined && <Block label="Response" value={call.response} />}
          </div>
        </div>
      ))}
    </div>
  );
}
