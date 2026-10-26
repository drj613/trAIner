import { useEffect, useRef } from "react";
import { CheckCircle } from "lucide-react";
import { classifyCell } from "./SetCell";
import "./workout.css";
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
    <div className="wk-stat">
      <span className={`wk-stat-value${tone ? ` ${tone}` : ""}`}>{value}</span>
      <span className="wk-stat-label">{label}</span>
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
      className="wk-summary"
    >
      <div className="wk-summary-scrim" onClick={onReview} />
      <div className="wk-summary-sheet">
        <h2 className="wk-summary-title">
          <CheckCircle size={20} aria-hidden />
          <span>{dayTitle} done</span>
        </h2>
        <p className="wk-summary-sub">
          {stats.setsDone} of {stats.setsTotal} sets logged · {pct}%
        </p>

        <div className="wk-summary-stats">
          <Stat label="Exercises" value={stats.exercises} />
          <Stat label="Sets" value={stats.setsDone} />
          {stats.prs > 0 && <Stat label={stats.prs === 1 ? "PR" : "PRs"} value={stats.prs} tone="pr" />}
          {stats.misses > 0 && <Stat label={stats.misses === 1 ? "Miss" : "Misses"} value={stats.misses} tone="bad" />}
        </div>

        <div className="wk-summary-actions">
          <button type="button" className="btn ghost wk-btn" onClick={onReview}>
            Review session
          </button>
          <button ref={nextRef} type="button" className="btn primary wk-btn" onClick={onNext} aria-label="Continue to next day">
            Next day →
          </button>
        </div>
      </div>
    </div>
  );
}
