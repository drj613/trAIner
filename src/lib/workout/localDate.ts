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
 */
export function logLocalDate(log: { performedDate?: string; performedAt: string }): string {
  return log.performedDate ?? localDateOf(log.performedAt);
}

/**
 * Deterministic log id for the session of (program, day, local date).
 * Concurrent first-saves converge on the same key, so IndexedDB's upsert
 * semantics make duplicate sessions impossible by construction.
 */
export function sessionLogId(programId: string, dayId: string, date: string): string {
  return `session_${programId}_${dayId}_${date}`;
}
