import { useEffect, useRef } from "react";
import { CheckCircle } from "lucide-react";
import { classifyCell } from "./SetCell";
import type { CellMap } from "@/lib/workout/cellMap";

export type SessionSummaryStats = {
  exercises: number;
  setsDone: number;
  setsTotal: number;
  prs: number;
  misses: number;
};

/** Derive a closing readout from the session's cells. Pure; no unit math so the
 *  numbers are unambiguous regardless of kg/lb mixing across exercises. */
export function computeSessionSummary(cells: CellMap): SessionSummaryStats {
  let setsDone = 0;
  let setsTotal = 0;
  let prs = 0;
  let misses = 0;
  const exercisesWithWork = new Set<string>();
  for (const [exId, vals] of Object.entries(cells)) {
    for (const v of vals) {
      setsTotal++;
      const state = classifyCell(v);
      if (state === "empty") continue;
      setsDone++;
      exercisesWithWork.add(exId);
      if (state === "pr") prs++;
      if (state === "miss") misses++;
    }
  }
  return { exercises: exercisesWithWork.size, setsDone, setsTotal, prs, misses };
}

type Props = {
  dayTitle: string;
  stats: SessionSummaryStats;
  onNext: () => void;
  onReview: () => void;
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: "pr" | "bad" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 64 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1,
          color: tone === "pr" ? "var(--pr)" : tone === "bad" ? "var(--bad)" : "var(--fg)",
        }}
      >
        {value}
      </span>
      <span
        className="tx-up"
        style={{ fontSize: 10, color: "var(--fg-3)" }}
      >
        {label}
      </span>
    </div>
  );
}

export function SessionSummary({ dayTitle, stats, onNext, onReview }: Props) {
  const nextRef = useRef<HTMLButtonElement>(null);
  const pct = stats.setsTotal > 0 ? Math.round((stats.setsDone / stats.setsTotal) * 100) : 0;

  // Move focus to the primary action so keyboard users land on the exit path.
  useEffect(() => {
    nextRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${dayTitle} complete`}
      style={{ position: "fixed", inset: 0, zIndex: 60 /* --z-overlay */, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={onReview}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", animation: "fade .16s" }}
      />
      <div
        style={{
          position: "relative",
          width: "min(100%, 480px)",
          margin: 12,
          background: "var(--bg-1)",
          border: "1px solid var(--line-2)",
          borderRadius: "var(--r-lg)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          padding: 18,
          animation: "slideup .18s cubic-bezier(.2,.7,.3,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <CheckCircle size={18} aria-hidden style={{ color: "var(--good)" }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
            {dayTitle} done
          </span>
        </div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)", margin: "0 0 16px" }}>
          {stats.setsDone} of {stats.setsTotal} sets logged · {pct}%
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 18 }}>
          <Stat label="Exercises" value={stats.exercises} />
          <Stat label="Sets" value={stats.setsDone} />
          {stats.prs > 0 && <Stat label={stats.prs === 1 ? "PR" : "PRs"} value={stats.prs} tone="pr" />}
          {stats.misses > 0 && <Stat label={stats.misses === 1 ? "Miss" : "Misses"} value={stats.misses} tone="bad" />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onReview} style={{ fontSize: 12 }}>
            Review session
          </button>
          <button ref={nextRef} type="button" className="btn primary" onClick={onNext} aria-label="Continue to next day" style={{ fontSize: 12 }}>
            Next day →
          </button>
        </div>
      </div>
    </div>
  );
}
