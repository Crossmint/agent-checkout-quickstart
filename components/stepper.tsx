"use client";

import { Check } from "lucide-react";

export type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Buyer profile" },
  { n: 2, label: "What to buy" },
  { n: 3, label: "Checkout" },
];

/**
 * The 1 → 2 → 3 progress header for the checkout flow. `current` is the active
 * step; already-completed steps render a check and, when `onStep` is provided,
 * are clickable so the buyer can jump back (disabled once the checkout is live).
 */
export function Stepper({
  current,
  onStep,
}: {
  current: Step;
  onStep?: (step: Step) => void;
}) {
  return (
    <ol className="mb-9 flex items-center gap-2">
      {STEPS.map(({ n, label }, i) => {
        const done = n < current;
        const active = n === current;
        const clickable = done && !!onStep;
        return (
          <li key={n} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onStep(n) : undefined}
              className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors ${
                clickable ? "cursor-pointer hover:bg-black/[0.04]" : "cursor-default"
              }`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-[#05B959] text-white"
                    : done
                      ? "bg-[#05B959]/15 text-[#05B959]"
                      : "bg-black/[0.06] text-[#00150d]/40"
                }`}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span
                className={`text-sm font-medium ${
                  active ? "text-[#00150d]" : "text-[#00150d]/45"
                }`}
              >
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="h-px w-6 bg-[rgba(0,0,0,0.12)]" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
