"use client";

import { LayoutList, Code2 } from "lucide-react";

export type ViewMode = "ui" | "code";

export function ViewSwitch({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-[2px] rounded-[6px] border border-[rgba(0,0,0,0.12)] p-[4px]">
      <button
        onClick={() => onChange("ui")}
        className={`flex items-center justify-center rounded-[4px] p-[4px] transition-colors ${
          view === "ui" ? "bg-[rgba(0,0,0,0.08)]" : "hover:bg-[rgba(0,0,0,0.04)]"
        }`}
        title="App view"
      >
        <LayoutList className="size-4 text-[#00150d]" />
      </button>
      <button
        onClick={() => onChange("code")}
        className={`flex items-center justify-center rounded-[4px] p-[4px] transition-colors ${
          view === "code" ? "bg-[rgba(0,0,0,0.08)]" : "hover:bg-[rgba(0,0,0,0.04)]"
        }`}
        title="API calls"
      >
        <Code2 className="size-4 text-[#00150d]" />
      </button>
    </div>
  );
}
