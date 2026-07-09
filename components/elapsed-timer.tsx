"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Counts elapsed time since `startedAt` (ms epoch) once per second while
 * `running` is true, then freezes on the last value when the checkout reaches a
 * terminal state. Purely presentational — the source of truth is still the poll.
 */
export function ElapsedTimer({ startedAt, running }: { startedAt: number; running: boolean }) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    if (!running) return;
    // Tick sub-second so the first update lands promptly after mount; the
    // interval callback (not the effect body) is what updates state.
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums text-[#00150d]/45">
      <Clock className={`size-3 ${running ? "text-[#05B959]" : ""}`} />
      {mm}:{ss}
    </span>
  );
}
