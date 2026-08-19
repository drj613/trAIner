"use client";

import type { CorrectionTarget } from "@/components/catalog/ExerciseCorrectionSheet";
import type { ExerciseHistoryRow } from "@/lib/workout/historyProjection";
import { correctionTargetForRow, rowNeedsReview } from "@/lib/workout/historyCorrection";
import { textOf } from "@/lib/workout/historyUtils";
import { classifyCell } from "./SetCell";

/**
 * The combined chronological history list, shared by the Today drawer and the
 * all-time family detail.
 *
 * One component rather than one per surface, because the spec requires the two
 * to behave identically — "the drawer and all-time history use the same identity
 * fallback behavior, so an unresolved record remains visible and correctable on
 * both surfaces" — and two copies of a display rule is how this plan's
 * set-level `notes` miss happened.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a local YYYY-MM-DD string as e.g. "Apr 22 (Wed)". Parse with local
 * Date components (new Date(y, m-1, d)); never `new Date(str)`, which parses as
 * UTC midnight and shifts the day/weekday in non-UTC zones.
 *
 * `performedDate` is typed `string` and `logLocalDate` guarantees one, but the
 * projection derives it from stored data (`historyProjection.ts:317`) and
 * neither surface has an error boundary above it: `localYmd.split is not a
 * function` unwound the entire day page rather than spoiling one row. `textOf`
 * coerces first, so a value we cannot read costs a date label, not the page.
 */
export function formatSessionDate(localYmd: unknown): string {
  const text = textOf(localYmd);
  const [y, m, d] = text.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return text;
  const dt = new Date(y, m - 1, d);
  return `${MONTHS[m - 1]} ${d} (${WEEKDAYS[dt.getDay()]})`;
}

export type WorkoutGroup = {
  /** The stored log id, compared as-is. Typed `string`; not always one. */
  logId: unknown;
  /** A React key that is unique whatever the stored ids turn out to be. */
  key: string;
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
 * (`compareRowsChronologically`).
 *
 * The id is compared AS STORED, deliberately not coerced. `logId` is typed
 * `string` but a hand-edited or foreign backup can hold anything, and every row
 * of one log carries the same value read from the same record — so `===`
 * answers "same workout" correctly even for a value we cannot read, while
 * `String(...)` would collapse two different unreadable logs into one block and
 * undercount the user's workouts. (The projection coerces in `logIdOrder` for a
 * different reason: `localeCompare` throws on a non-string receiver. `===`
 * cannot throw.)
 *
 * The React key carries the group's position rather than the id alone, because
 * two distinct logs sharing an id is out of contract but not prevented
 * anywhere, and a duplicate key silently drops a workout from the list.
 */
export function groupByWorkout(rows: readonly ExerciseHistoryRow[]): WorkoutGroup[] {
  const groups: WorkoutGroup[] = [];
  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (current && current.logId === row.logId) {
      current.rows.push(row);
      current.volumeLb += row.volumeLb;
      continue;
    }
    groups.push({
      logId: row.logId,
      key: `${groups.length}#${textOf(row.logId)}`,
      performedDate: row.performedDate,
      volumeLb: row.volumeLb,
      rows: [row],
    });
  }
  return groups;
}

/** The version label to show for a row, current catalogue name preferred. */
export function versionLabel(row: ExerciseHistoryRow): string {
  return textOf(row.currentVersionLabel) || textOf(row.performedName) || textOf(row.versionKey);
}

/** How many entries the given workout blocks hold between them. */
export function countEntries(groups: readonly WorkoutGroup[]): number {
  return groups.reduce((sum, group) => sum + group.rows.length, 0);
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--fg)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const badgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9.5,
  color: "var(--fg-4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function HistoryWorkoutList({
  groups,
  activeVersionKey,
  onCorrect,
}: {
  groups: readonly WorkoutGroup[];
  /** Version to emphasize, as `versionKeyForIdentity` computes it. */
  activeVersionKey?: string;
  /** Opens the shared correction sheet. Omitted where no sheet is hosted. */
  onCorrect?: (target: CorrectionTarget) => void;
}) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <div
          key={group.key}
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
            // Only when the catalogue now calls it something else. The performed
            // label is never rewritten; the badge is the only thing a correction
            // moves.
            const showBadge = current !== "" && current.toLowerCase() !== performed.toLowerCase();
            const needsReview = onCorrect && rowNeedsReview(row);
            return (
              <div
                key={`${group.key}#${row.entryIndex}`}
                data-testid="history-row"
                data-version-key={row.versionKey}
                data-active-version={isActive ? "true" : "false"}
                style={{
                  padding: "3px 0 3px 7px",
                  // A left rule rather than a filled block: the active version is
                  // emphasized without inflating the row.
                  borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                }}
              >
                <div style={{
                  display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, marginBottom: 3,
                }}>
                  <span style={labelStyle}>{performed}</span>
                  {showBadge && (
                    <span data-testid="history-row-current-version" style={badgeStyle}>
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
                  // A row exists only because the entry carried data, so no
                  // labels means the stored sets were unreadable (a note-only
                  // entry shows its note below instead). A blank line here reads
                  // as a rendering bug and invites the user to delete work that
                  // is still recorded.
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
      ))}
    </>
  );
}
