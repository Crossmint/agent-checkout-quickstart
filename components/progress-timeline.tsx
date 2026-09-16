"use client";

import { useEffect, useRef } from "react";
import { Check, Hand } from "lucide-react";
import type { CheckoutMessage, MessagePart } from "@/lib/agent-checkout-types";

/** One row of the timeline, flattened from a message part. */
export type TimelineItem = {
  key: string;
  label: string;
  createdAt: string;
  /** The agent asked the buyer for something (or the buyer answered). */
  userAction: boolean;
};

function operationsLabel(part: Extract<MessagePart, { type: "activity" }>): string {
  const ops = part.operations.map((op) => `${op.kind.replace(/_/g, " ")} ×${op.count}`).join(", ");
  return ops ? `Browser activity: ${ops}` : "Browser activity";
}

function partLabel(part: MessagePart): string | null {
  switch (part.type) {
    case "text":
      return part.text;
    case "progress":
      return part.text;
    case "activity":
      return operationsLabel(part);
    case "input_request":
      return part.question;
    case "input_response":
      return part.action === "submit"
        ? "You answered the agent's question"
        : part.action === "decline"
          ? "You declined the agent's request"
          : "You suggested an alternative";
    case "result":
      return part.summary;
  }
}

/** Flatten the run's messages into rows: one per part that has something to show. */
export function timelineItems(messages: CheckoutMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const message of messages) {
    message.parts.forEach((part, i) => {
      const label = partLabel(part);
      if (label == null) return;
      items.push({
        key: `${message.id}:${i}`,
        label,
        createdAt: message.createdAt,
        userAction: part.type === "input_request" || part.type === "input_response",
      });
    });
  }
  return items;
}

export function ProgressTimeline({
  items,
  live,
}: {
  items: TimelineItem[];
  /** When true, the last item is the agent's current action (pulsing). */
  live: boolean;
}) {
  // Keep the newest step in view as the agent works, without forcing the whole
  // page to grow — the list scrolls inside a fixed-height box (so the browser
  // stays visible alongside it).
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[#00150d]/40">
        Waiting for the agent to start working…
      </p>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto pr-1">
    <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-[rgba(0,0,0,0.08)]">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const pending = live && isLast;
        return (
          <li key={item.key} className="relative flex gap-3 pl-0">
            <span className="relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {pending ? (
                <span className="size-3 animate-pulse rounded-full bg-[#2377FF]" />
              ) : item.userAction ? (
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
              <p className="text-sm leading-5 text-[#00150d]">{item.label}</p>
              <p className="text-[11px] text-[#00150d]/35">
                {new Date(item.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
      <div ref={endRef} />
    </div>
  );
}
