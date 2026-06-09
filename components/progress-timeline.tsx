"use client";

import { Check, Hand } from "lucide-react";
import type { ProgressItem } from "@/lib/agentic-checkout-types";

function itemLabel(item: ProgressItem): string {
  return (
    item.message ??
    item.title ??
    (typeof item["label"] === "string" ? (item["label"] as string) : null) ??
    item.type ??
    "Step"
  );
}

export function ProgressTimeline({
  items,
  live,
}: {
  items: ProgressItem[];
  /** When true, the last item is the agent's current action (pulsing). */
  live: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[#00150d]/40">
        Waiting for the agent to start working…
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-[rgba(0,0,0,0.08)]">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const pending = live && isLast;
        const isUserAction = item.type === "user-action";
        return (
          <li key={i} className="relative flex gap-3 pl-0">
            <span className="relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {pending ? (
                <span className="size-3 animate-pulse rounded-full bg-[#2377FF]" />
              ) : isUserAction ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-[#b45309]/15">
                  <Hand className="size-2.5 text-[#b45309]" />
                </span>
              ) : (
                <span className="flex size-4 items-center justify-center rounded-full bg-[#05B959]/15">
                  <Check className="size-2.5 text-[#05B959] stroke-[3]" />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-5 text-[#00150d]">{itemLabel(item)}</p>
              {item.createdAt && (
                <p className="text-[11px] text-[#00150d]/35">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
