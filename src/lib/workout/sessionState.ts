import type { WeightUnit, WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";
import { isRecordLike, readableSets, textOf } from "./historyUtils";

/**
 * Parse a cell string like "65x10", "BWx8", "+70x9", "10kg x10" into a
 * WorkoutSetLog. An explicit unit in the cell wins; otherwise the exercise's
 * `defaultUnit` applies. The unit field is only stamped for kg — absent = lb.
 * Returns a WorkoutSetLog with rawCell for unrecognized/skip/pain strings.
 * Empty strings are still treated as empty (returns { setNumber, rawCell: "" }).
 */
export function parseCellToSet(
  cell: string,
  setNumber: number,
  defaultUnit: WeightUnit = "lb",
): WorkoutSetLog {
  if (!cell) return { setNumber, rawCell: cell };

  const lower = cell.trim().toLowerCase();
  if (lower === "skip" || lower === "pain") return { setNumber, rawCell: cell };

  // Strip leading PR marker
  const stripped = cell.startsWith("+") ? cell.slice(1) : cell;

  const match = /^(BW|\d+(?:\.\d+)?)\s*(kg|lbs?)?\s*x\s*(\d+)$/i.exec(stripped.trim());
  if (!match) return { setNumber, rawCell: cell };

  const weightPart = match[1];
  const explicitUnit = match[2]?.toLowerCase().startsWith("kg")
    ? "kg"
    : match[2]
      ? "lb"
      : undefined;
  const reps = parseInt(match[3], 10);

  if (weightPart.toUpperCase() === "BW") return { setNumber, weight: undefined, reps };

  const weight = parseFloat(weightPart);
  const unit = explicitUnit ?? defaultUnit;
  return unit === "kg"
    ? { setNumber, weight, unit, reps }
    : { setNumber, weight, reps };
}

/**
 * Convert an array of cell strings to WorkoutSetLog[].
 * Skips empty cells. setNumber is 1-based original index.
 * Unrecognized strings (e.g., notes) are preserved via rawCell.
 */
export function serialiseSets(cells: string[], defaultUnit: WeightUnit = "lb"): WorkoutSetLog[] {
  const result: WorkoutSetLog[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].trim()) continue;
    result.push(parseCellToSet(cells[i], i + 1, defaultUnit));
  }
  return result;
}

/**
 * The largest set number the grid will lay out.
 *
 * `Array(count).fill("")` is allocated from the stored set number, so a log
 * carrying `setNumber: 1e9` — a shape storage preserves verbatim — used to
 * allocate a billion cells and abort the whole process with
 * "FATAL ERROR: invalid table size Allocation failed - JavaScript heap out of
 * memory". No workout has 500 sets of one exercise; a stored number above this
 * is not a position we can honour, so it is unreadable rather than large.
 */
const MAX_HYDRATED_SETS = 500;

/**
 * Whether a stored `setNumber` is a grid position we can lay out: a whole
 * number from 1 to `MAX_HYDRATED_SETS`. Anything else — absent, `0`, a
 * fraction, an object, a runaway magnitude — cannot index a cell.
 */
export function readableSetNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > MAX_HYDRATED_SETS) return undefined;
  return value;
}

/**
 * Whether the day grid can represent a stored entry without losing any of it.
 *
 * This is the line between an entry the grid owns and one it must leave alone.
 * The day screen rebuilds the whole `entries` array from the grid on every
 * autosave, so anything the grid cannot show is anything a rewrite would
 * delete — and "a record we cannot read is a record we must not rewrite" is a
 * settled rule on this plan. Entries that fail this check are hydrated by
 * nobody and re-emitted verbatim at their stored index instead.
 *
 * Every shape rejected here is one that previously *threw* out of hydration
 * (`entry.sets.map is not a function`, `Cannot read properties of null`,
 * `Invalid array length`, an out-of-memory abort on a runaway `setNumber`, or
 * `notes.trim is not a function` one step later in the save path), so nothing
 * that used to round-trip stops round-tripping. Absent is not unreadable
 * (`unreadableValue`, `src/lib/storage/migrations/v10Identity.ts:158`): an entry
 * with no `sets` and no `notes` is the ordinary shape of an untouched exercise
 * and stays fully hydratable.
 */
export function entryIsFullyHydratable(value: unknown): value is WorkoutLogEntry {
  if (!isRecordLike(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.exerciseId !== "string") return false;
  if (entry.notes !== undefined && entry.notes !== null && typeof entry.notes !== "string") {
    return false;
  }
  const sets = entry.sets;
  if (sets === undefined || sets === null) return true;
  if (!Array.isArray(sets)) return false;
  return (sets as unknown[]).every(
    (s) => isRecordLike(s) && readableSetNumber((s as WorkoutSetLog).setNumber) !== undefined,
  );
}

/**
 * Convert a WorkoutLogEntry back to cell strings for display.
 * Returns [""] when the entry has no sets.
 * Uses setNumber to restore sparse positions (e.g., set 2 skipped → empty string at index 1).
 * Pads to prescribedSets if provided, so the grid always shows enough cells.
 *
 * Every stored value is read through a guard because none of them is
 * type-checked on the way in: `src/lib/storage/appDb.ts:186-195` never inspects
 * the fields of an entry or a set, and the plan's v7 ruling keeps a log whose
 * only entry is `null` on purpose, because the unreadable value "may be
 * standing in for real sets we have no way to recover". Throwing here was not a
 * crash the user could see — it left `WorkoutDayClient`'s `sessionMode` at
 * `"loading"`, which made `saveCells` early-return for the rest of the visit
 * while the grid still rendered fully editable. A whole session typed into a
 * live-looking screen was discarded with nothing on screen to say so.
 *
 * Absent is not unreadable (`unreadableValue`,
 * `src/lib/storage/migrations/v10Identity.ts:158`): an entry with no sets is the
 * ordinary shape of an exercise nobody has logged yet and still yields an empty
 * grid. Sets we cannot place are skipped here so the readable ones beside them
 * survive; `WorkoutDayClient` keeps the unread originals out of the rewrite
 * separately, so skipping a cell never deletes stored work.
 */
export function hydrateFromLog(entry: WorkoutLogEntry, prescribedSets?: number): string[] {
  const sets = readableSets(entry)
    .map((s) => ({ set: s, setNumber: readableSetNumber(s.setNumber) }))
    .filter((s): s is { set: WorkoutSetLog; setNumber: number } => s.setNumber !== undefined);
  if (sets.length === 0) {
    const count = Math.max(1, prescribedSets ?? 1);
    return Array<string>(count).fill("");
  }
  const maxSet = Math.max(...sets.map((s) => s.setNumber));
  const count = Math.max(maxSet, prescribedSets ?? maxSet);
  const out = Array<string>(count).fill("");
  for (const { set: s, setNumber } of sets) {
    if (s.rawCell !== undefined) {
      // `textOf`, not the value: an unreadable rawCell handed to the grid became
      // an input `value` that is not a string, and `serialiseSets` then called
      // `.trim()` on it and threw out of the save path.
      out[setNumber - 1] = textOf(s.rawCell);
    } else {
      const suffix = s.unit === "kg" ? "kg" : "";
      // Template literals coerce a non-string weight/reps without throwing, so
      // they stay as they were: the label shows what is stored. Only `rawCell`
      // needed a guard, because it is written to the cell verbatim.
      const cell = s.weight === undefined
        ? (s.reps ? `BWx${s.reps}` : "")
        : s.reps ? `${s.weight}${suffix}x${s.reps}` : `${s.weight}${suffix}`;
      out[setNumber - 1] = cell;
    }
  }
  return out;
}

/**
 * Pull the free-text notes off a log entry, defaulting to "" when absent.
 */
export function extractEntryNotes(entry: { notes?: string }): string {
  return entry.notes ?? "";
}

/**
 * Return a copy of `entry` with `notes` applied. Empty / whitespace-only
 * strings drop the field entirely so we don't persist meaningless data.
 */
export function applyEntryNotes<T extends object>(entry: T, notes: string): T & { notes?: string } {
  if (!notes.trim()) {
    const { notes: _drop, ...rest } = entry as T & { notes?: string };
    return rest as T;
  }
  return { ...entry, notes };
}
