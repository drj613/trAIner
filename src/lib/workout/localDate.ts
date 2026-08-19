/**
 * Session-date helpers.
 *
 * A workout session belongs to the user's LOCAL calendar date (the date they
 * experienced at the gym), while timestamps like performedAt are stored as
 * UTC ISO strings. Every read and write that keys a session by date must go
 * through these helpers so both sides of a comparison use the same basis —
 * mixing a local query date with a UTC string prefix is how duplicate
 * sessions were born.
 */

/** Local calendar date (YYYY-MM-DD) of `d`, defaulting to now. */
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local calendar date of a stored ISO timestamp. */
export function localDateOf(iso: string): string {
  return localDateString(new Date(iso));
}

/**
 * The local calendar date a log belongs to: the explicit performedDate when
 * present (written at save time), else derived from performedAt.
 *
 * The parameter types describe what we *write*, not what we can *read*.
 * `src/lib/storage/appDb.ts:186-195` deliberately preserves a log whose fields
 * it cannot read, so a hand-edited or foreign backup reaches this function with
 * a `performedDate` or `performedAt` that is not a string. That value used to
 * pass straight through: `aggregateExerciseHistory` then sorted the rows with
 * `b.date.localeCompare(a.date)` and threw, which made the Today history drawer
 * an inert tap for *every* exercise, and `HistoryDrawer` threw again on
 * `localYmd.split` at render with no error boundary above it.
 *
 * The guard lives here rather than at each caller because every reader of a
 * log's local date goes through this one function — the history drawer, the
 * all-time history page, the projection, the day screen and `logRepo.getForDay`.
 *
 * Absent is not unreadable (the settled line: `unreadableValue`,
 * `src/lib/storage/migrations/v10Identity.ts:158`). An absent `performedDate` is
 * the ordinary shape of a log written before v7 and still falls back to
 * `performedAt`, exactly as `?? ` did — `null` behaved that way too. Only a
 * *present but non-string* `performedDate` changes: it is unreadable, and
 * `performedAt` is the authoritative value to fall back to. When that is
 * unreadable as well there is no date to report, so this returns `""` rather
 * than inventing one — `new Date(7)` would have produced a confident lie.
 */
export function logLocalDate(log: { performedDate?: string; performedAt: string }): string {
  if (typeof log.performedDate === "string") return log.performedDate;
  return typeof log.performedAt === "string" ? localDateOf(log.performedAt) : "";
}

/**
 * A stored timestamp as a sortable string, `""` when it is not text.
 *
 * `performedAt` and `completedAt` are typed `string` but nothing enforces it on
 * the way in: `src/lib/storage/appDb.ts:186-195` never inspects them, so a
 * hand-edited or foreign backup reaches the UI with a number or an object
 * there. `b.performedAt.localeCompare(a.performedAt)` then threw on the day
 * screen, and `(b.completedAt ?? b.performedAt).localeCompare(...)` threw
 * inside the program page's week grid, where there is no error boundary — a
 * render throw takes the whole page down.
 *
 * One function, not a guard per call site: two divergent copies of one rule is
 * how the set-level `notes` miss happened on this plan. Unreadable maps to `""`,
 * which is *last* in the descending orders both callers use, so a record we
 * cannot place in time never wins a "most recent" selection.
 */
export function sortableStamp(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Deterministic log id for the session of (program, day, local date).
 * Concurrent first-saves converge on the same key, so IndexedDB's upsert
 * semantics make duplicate sessions impossible by construction.
 */
export function sessionLogId(programId: string, dayId: string, date: string): string {
  return `session_${programId}_${dayId}_${date}`;
}
