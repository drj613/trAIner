"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { CorrectionTarget } from "@/components/catalog/ExerciseCorrectionSheet";
import type { ExerciseHistoryRow } from "@/lib/workout/historyProjection";
import { useFocusTrap } from "@/lib/workout/useFocusTrap";
import { HistoryWorkoutList, countEntries, groupByWorkout, versionLabel } from "./HistoryRows";

type Props = {
  /** The family (or standalone exercise) this drawer is about. */
  exerciseName: string;
  /**
   * Every row for the whole movement family, newest first, straight from
   * `projectExerciseHistory`. The drawer does not group or classify — it only
   * displays what the shared projection already decided.
   */
  rows: ExerciseHistoryRow[];
  /**
   * The version the user tapped from, as `versionKeyForIdentity` computes it.
   *
   * A version key rather than a concrete exercise id, because the tapped slot
   * may resolve to a movement with no concrete version (key `movement:<id>`) or
   * to nothing at all (key `slot:<id>#<name>`), and those rows must be
   * emphasizable too. For a resolved version the two are the same string.
   */
  activeVersionKey?: string;
  onClose: () => void;
  /** Opens the shared correction sheet. Omitted where no sheet is hosted. */
  onCorrect?: (target: CorrectionTarget) => void;
};

/**
 * The drawer shows recent history, not all of it.
 *
 * Counted in WORKOUTS. The previous `limit = 8` sliced the entry list, so a user
 * who logs an exercise twice per workout saw four workouts under a "last 8"
 * label. Slicing whole workouts is what the label has always claimed.
 */
const WORKOUT_LIMIT = 8;

export function HistoryDrawer({ exerciseName, rows, activeVersionKey, onClose, onCorrect }: Props) {
  const trapRef = useFocusTrap(true);
  const filterId = useId();
  const [versionFilter, setVersionFilter] = useState("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Newest first, because `rows` already is: a version the user did most
  // recently is the one they are most likely to filter to.
  const versions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.versionKey)) seen.set(row.versionKey, versionLabel(row));
    }
    return [...seen].map(([key, label]) => ({ key, label }));
  }, [rows]);

  // A filter naming a version that is no longer present reads as "all", rather
  // than showing an empty drawer the user cannot explain. Reachable when the
  // rows change under an open drawer — a saved correction regroups them.
  const activeFilter = versions.some((v) => v.key === versionFilter) ? versionFilter : "";

  const visibleRows = activeFilter ? rows.filter((row) => row.versionKey === activeFilter) : rows;
  const allGroups = groupByWorkout(visibleRows);
  const groups = allGroups.slice(0, WORKOUT_LIMIT);
  const entryCount = countEntries(groups);
  const truncated = allGroups.length > groups.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        data-testid="history-drawer-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label={`History for ${exerciseName}`}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          maxHeight: "75vh", background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0", borderTop: "1px solid var(--line-2)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "var(--line-2)" }} />
        </div>
        <div style={{ padding: "0 16px 10px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
            {exerciseName}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
            {/* Workouts and entries are different numbers: one workout can log
                the same exercise twice, and calling four entries "4 sessions"
                is a straight mislabel. */}
            {groups.length} workout{groups.length === 1 ? "" : "s"}
            {" · "}
            {entryCount} {entryCount === 1 ? "entry" : "entries"}
            {truncated ? ` · last ${WORKOUT_LIMIT}` : ""}
          </p>
          {versions.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <label
                htmlFor={filterId}
                className="tx-up"
                style={{ fontSize: 9.5, color: "var(--fg-4)" }}
              >
                Filter by version
              </label>
              <select
                id={filterId}
                value={activeFilter}
                onChange={(e) => setVersionFilter(e.target.value)}
                style={{
                  flex: 1, minWidth: 0, background: "var(--bg-2)", color: "var(--fg)",
                  border: "1px solid var(--line)", borderRadius: 2, padding: "2px 4px",
                  fontFamily: "inherit", fontSize: 12,
                }}
              >
                {/* The family-wide view is the default and stays the default —
                    the filter narrows it, it does not replace it. */}
                <option value="">All versions</option>
                {versions.map((version) => (
                  <option key={version.key} value={version.key}>{version.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 0 16px" }}>
          {groups.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-3)" }}>
              No history yet for this exercise.
            </div>
          ) : (
            <HistoryWorkoutList
              groups={groups}
              activeVersionKey={activeVersionKey}
              onCorrect={onCorrect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
