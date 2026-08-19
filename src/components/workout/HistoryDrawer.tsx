"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { CorrectionTarget } from "@/components/catalog/ExerciseCorrectionSheet";
import type { ExerciseHistoryRow } from "@/lib/workout/historyProjection";
import { correctionTargetForRow, rowNeedsReview } from "@/lib/workout/historyCorrection";
import { textOf } from "@/lib/workout/historyUtils";
import { useFocusTrap } from "@/lib/workout/useFocusTrap";
import { classifyCell } from "./SetCell";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a local YYYY-MM-DD string as e.g. "Apr 22 (Wed)". Parse with local
 * Date components (new Date(y, m-1, d)); never `new Date(str)`, which parses as
 * UTC midnight and shifts the day/weekday in non-UTC zones.
 *
 * `performedDate` is typed `string` and `logLocalDate` guarantees one, but the
 * projection derives it from stored data (`historyProjection.ts:317`) and this
 * component has no error boundary above it: `localYmd.split is not a function`
 * unwound the entire day page rather than spoiling one row. `textOf` coerces
 * first so a value we cannot read costs a date label, not the drawer.
 */
function formatSessionDate(localYmd: unknown): string {
  const text = textOf(localYmd);
  const [y, m, d] = text.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return text;
  const dt = new Date(y, m - 1, d);
  return `${MONTHS[m - 1]} ${d} (${WEEKDAYS[dt.getDay()]})`;
}

type WorkoutGroup = {
  logId: string;
  performedDate: unknown;
  volumeLb: number;
  rows: ExerciseHistoryRow[];
};

/**
 * One block per workout log.
 *
 * Rows arrive sorted by `performedAt`, then `logId`, then `entryIndex`, so rows
 * from one workout are already adjacent and a single pass is enough — the same
 * property the projection's own session bucketing relies on
 * (`compareRowsChronologically`). `String(...)` on the id because a corrupt log
 * can hold a non-string there and two different non-strings must not compare
 * equal by coercion accident.
 */
function groupByWorkout(rows: readonly ExerciseHistoryRow[]): WorkoutGroup[] {
  const groups: WorkoutGroup[] = [];
  for (const row of rows) {
    const logId = String(row.logId);
    const current = groups[groups.length - 1];
    if (current && current.logId === logId) {
      current.rows.push(row);
      current.volumeLb += row.volumeLb;
      continue;
    }
    groups.push({ logId, performedDate: row.performedDate, volumeLb: row.volumeLb, rows: [row] });
  }
  return groups;
}

/** The version label to show for a row, current catalogue name preferred. */
function versionLabel(row: ExerciseHistoryRow): string {
  return textOf(row.currentVersionLabel) || textOf(row.performedName) || textOf(row.versionKey);
}

const rowLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--fg)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

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
  const entryCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
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
            groups.map((group, groupIndex) => (
              <div
                key={group.logId}
                data-testid="history-workout"
                style={{
                  padding: "8px 16px",
                  borderBottom: groupIndex < groups.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "baseline",
                  justifyContent: "space-between", marginBottom: 4,
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {formatSessionDate(group.performedDate)}
                  </span>
                  {group.volumeLb > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      <span style={{
                        color: "var(--fg-4)", textTransform: "uppercase",
                        letterSpacing: "0.08em", marginRight: 5,
                      }}>
                        vol
                      </span>
                      <span style={{ color: "var(--fg-3)" }}>{group.volumeLb.toLocaleString()}</span>
                    </span>
                  )}
                </div>
                {group.rows.map((row) => {
                  const isActive = activeVersionKey !== undefined && row.versionKey === activeVersionKey;
                  const performed = textOf(row.performedName);
                  const current = versionLabel(row);
                  // Only when the catalogue now calls it something else. The
                  // performed label is never rewritten; the badge is the only
                  // thing a correction moves.
                  const showBadge = current !== "" && current.toLowerCase() !== performed.toLowerCase();
                  const needsReview = onCorrect && rowNeedsReview(row);
                  return (
                    <div
                      key={`${group.logId}#${row.entryIndex}`}
                      data-testid="history-row"
                      data-version-key={row.versionKey}
                      data-active-version={isActive ? "true" : "false"}
                      style={{
                        padding: "3px 0 3px 7px",
                        // A left rule rather than a filled block: the active
                        // version is emphasized without inflating the row.
                        borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                      }}
                    >
                      <div style={{
                        display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, marginBottom: 3,
                      }}>
                        <span style={rowLabelStyle}>{performed}</span>
                        {showBadge && (
                          <span
                            data-testid="history-row-current-version"
                            style={{
                              fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-4)",
                              textTransform: "uppercase", letterSpacing: "0.06em",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}
                          >
                            {current}
                          </span>
                        )}
                        {needsReview && (
                          <button
                            type="button"
                            className="btn ghost tap"
                            onClick={() => onCorrect(correctionTargetForRow(row))}
                            aria-label={`Fix identity for ${performed}`}
                            style={{
                              marginLeft: "auto", padding: 0, fontSize: 10,
                              fontFamily: "var(--font-mono)", color: "var(--fg-4)",
                            }}
                          >
                            fix
                          </button>
                        )}
                      </div>
                      {row.sets.length > 0 ? (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {row.sets.map((s, j) => (
                            <span
                              key={j}
                              className={`cell ${classifyCell(s)}`}
                              style={{ cursor: "default", pointerEvents: "none", height: 24, fontSize: 12 }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        // A row exists only because the entry carried data, so
                        // no labels means the stored sets were unreadable (a
                        // note-only entry shows its note below instead). A blank
                        // line here reads as a rendering bug and invites the
                        // user to delete work that is still recorded.
                        !row.note && (
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-4)",
                            fontStyle: "italic",
                          }}>
                            sets could not be read
                          </span>
                        )
                      )}
                      {row.note && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-2)", lineHeight: 1.4 }}>
                          {row.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
