"use client";

import { Globe, Loader2 } from "lucide-react";

/**
 * Live view of the automated browser session. `browser.embedUrl` from the
 * checkout view is a hosted page showing the agent driving a real browser —
 * we just iframe it.
 */
export function BrowserFrame({ embedUrl }: { embedUrl?: string }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-[#1e1e1e]">
      {/* Fake chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="ml-2 flex flex-1 items-center gap-1.5 rounded-md bg-white/10 px-2 py-1">
          <Globe className="size-3 text-white/40" />
          <span className="truncate text-[11px] text-white/50">Agent browser session</span>
        </div>
      </div>

      <div className="relative aspect-[16/10] w-full bg-black">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="absolute inset-0 h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Agent browser session"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/40">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">Connecting to the browser session…</span>
          </div>
        )}
      </div>
    </div>
  );
}
