import type { WorkoutLogDocument, WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";
import { logLocalDate } from "./localDate";

export type ExerciseSessionRow = {
  date: string;
  sets: string[];
  note?: string;
  volume: number;
};

/**
 * Label a logged set for display. Returns the raw cell verbatim when the value
 * was unparseable free text (e.g. "2.5kg x10", "40s hold", "skip"); otherwise
 * formats the numeric weight/reps with `sep` between them ("x" in the drawer,
 * "×" on the analysis page).
 *
 * `rawCell` is read through `readableText` because a stored value that is not a
 * string is unreadable, not a label: dereferencing it threw out of both history
 * surfaces. Any readable weight and reps beside it still get their label.
 *
 * `weight` and `reps` are deliberately NOT guarded here, only in the arithmetic:
 * a label shows what is stored (an unreadable weight renders as its text, e.g.
 * `"[object Object]x5"`) while the volume refuses to invent a number and reads 0.
 * The one rough edge is a stored `NaN` weight, which `!s.weight` reads as absent
 * and labels `"BWx5"` — bodyweight it is not. Rendering a marker for unreadable
 * set content is a display decision and belongs to the history UI, not here.
 */
export function formatSetLabel(s: WorkoutSetLog, sep: string = "x"): string {
  const rawCell = readableText(s.rawCell);
  if (rawCell && rawCell.trim()) return rawCell;
  if (!s.weight) return s.reps ? `BW${sep}${s.reps}` : "";
  const w = s.unit === "kg" ? `${s.weight}kg` : `${s.weight}`;
  return s.reps ? `${w}${sep}${s.reps}` : w;
}

const KG_TO_LB = 2.2046226218;

/**
 * Logged weight normalized to lb, so kg and lb sets aggregate coherently.
 *
 * `setNumberField` rather than raw arithmetic: a stored weight we cannot read as
 * a number used to make this `NaN`, which then poisoned the whole entry's volume,
 * the version's session volumes and the trend derived from them — an unreadable
 * value removing a readable session's numbers from view.
 */
export function setWeightInLb(s: WorkoutSetLog): number {
  return setNumberField(s.weight) * (s.unit === "kg" ? KG_TO_LB : 1);
}

/** A set's reps as a number, `0` when absent or unreadable. */
export function setReps(s: WorkoutSetLog): number {
  return setNumberField(s.reps);
}

/** Tonnage of a set in lb (kg sets converted). */
export function setVolume(s: WorkoutSetLog): number {
  return setWeightInLb(s) * setReps(s);
}

/**
 * Whether a set carries anything the user actually recorded. `rpe` and set
 * notes count even though no current writer produces them alone: a set we can
 * read but do not display is still recorded work, and history must not drop it.
 */
export function setHasData(s: WorkoutSetLog): boolean {
  return Boolean(readableText(s.rawCell)?.trim())
    || textUnreadable(s.rawCell)
    || s.weight != null
    || s.reps != null
    || s.rpe != null
    || Boolean(readableText(s.notes)?.trim())
    || textUnreadable(s.notes);
}

/**
 * A stored value we can read as text, or `undefined`.
 *
 * `src/lib/storage/appDb.ts:186-195` never inspects the fields of a set record,
 * so whatever a hand-edited or foreign backup put in `rawCell` or a set-level
 * `notes` is preserved verbatim and reaches this module. Dereferencing it as a
 * string threw out of the whole projection *and* out of the drawer, so one
 * corrupt character removed every exercise's history from view.
 */
function readableText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Whether a stored text field is present but not text. Absent
 * (`undefined`/`null`) is the legitimate shape of a field nobody filled in, so it
 * is not unreadable — the settled line (`unreadableValue`,
 * `src/lib/storage/migrations/v10Identity.ts:158`, and the ledger's "the line is
 * between absent and unreadable"). Unreadable content is recorded work we cannot
 * render: it makes the set data-bearing without producing a label.
 */
function textUnreadable(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== "string";
}

/**
 * A stored numeric field as a finite number, `0` when absent or unreadable.
 *
 * `Number(...)` rather than a `typeof` check, because `weight * 1` has always
 * read a numeric string as its number and narrowing that would zero real logged
 * weight. The only behaviour that changes is the `NaN` case.
 */
function setNumberField(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Whether a stored value is a record whose fields we can inspect at all. Same
 * rule as `isRecord` in `src/lib/storage/migrations/v10Identity.ts:148`, arrays
 * excluded for the same reason. The duplication is forced by this lane's
 * no-storage-import seam (pinned by `historyProjection.test.ts`'s import scan),
 * not an oversight — the two definitions encode one rule.
 */
export function isRecordLike(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A log entry's readable sets. `sets` that is present but not an array, or an
 * array holding something that is not a set record, is data we cannot render and
 * must not drop: `src/lib/storage/appDb.ts:186-195` keeps such a log on purpose,
 * because it "may be standing in for real sets we have no way to recover", so
 * those entries reach this module and one of them must never remove another
 * exercise's readable history from view.
 */
export function readableSets(entry: WorkoutLogEntry): readonly WorkoutSetLog[] {
  if (!Array.isArray(entry.sets)) return [];
  return (entry.sets as unknown[]).filter((s): s is WorkoutSetLog => isRecordLike(s));
}

/**
 * Whether `sets` holds anything we cannot read. Absent (`undefined`/`null`) is
 * the legitimate shape of an entry with nothing logged, so it is not unreadable
 * — that is the settled line (`unreadableValue`,
 * `src/lib/storage/migrations/v10Identity.ts:158`). Anything else that is not
 * our array of records is unreadable, and therefore counts as data-bearing.
 */
function setsUnreadable(entry: WorkoutLogEntry): boolean {
  if (entry.sets === undefined || entry.sets === null) return false;
  if (!Array.isArray(entry.sets)) return true;
  return (entry.sets as unknown[]).some((s) => !isRecordLike(s));
}

/** The entry's note, when what is stored there is text we can read. */
export function entryNote(entry: WorkoutLogEntry): string | undefined {
  return readableText(entry.notes);
}

/**
 * A stored value rendered as text. Used for the last-resort row label, where the
 * row type promises a string but a corrupt log can hold anything: showing "7" is
 * a worse label than a real name and a better one than nothing.
 */
export function textOf(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/**
 * The name the user logged, when it is text we can read. A non-string reaches
 * `normalizeExerciseName` in the resolver otherwise, which throws.
 */
export function entryPerformedName(entry: WorkoutLogEntry): string | undefined {
  return readableText(entry.exerciseName);
}

/**
 * Whether a log entry belongs in exercise history: at least one recorded set,
 * or an exercise note. A note-only entry is history the user wrote by hand, so
 * it must survive; an entry with no sets and no note (a skipped placeholder)
 * has nothing to show. Sets we cannot read count as recorded work, so the entry
 * still earns a row (with no set labels and no volume) rather than vanishing.
 */
export function entryHasHistoryData(entry: WorkoutLogEntry): boolean {
  return setsUnreadable(entry)
    || readableSets(entry).some(setHasData)
    || Boolean(entryNote(entry)?.trim());
}

/** Display labels for an entry's sets, dropping labels with nothing in them. */
export function entrySetLabels(entry: WorkoutLogEntry, sep: string = "x"): string[] {
  return readableSets(entry).map((s) => formatSetLabel(s, sep)).filter(Boolean);
}

/** Tonnage of an entry in lb (kg sets converted). */
export function entryVolumeLb(entry: WorkoutLogEntry): number {
  return readableSets(entry).reduce((sum, s) => sum + setVolume(s), 0);
}

/** A log entry paired with its position in the stored `entries` array. */
export type IndexedLogEntry = { entry: WorkoutLogEntry; entryIndex: number };

/**
 * The entries of a log we can actually read, each keeping its stored position.
 *
 * `src/lib/storage/appDb.ts:186-195` deliberately retains a log whose `entries`
 * is not an array and whose elements are not records, and the plan's v7 ruling
 * retains a log whose only entry is `null` — in both cases because the
 * unreadable value may stand in for real sets. Those logs therefore exist in
 * storage by design, and one of them must never remove another workout's
 * readable history from view.
 *
 * The index is carried through rather than recomputed after filtering, because
 * a row's identity is `(logId, entryIndex)` against the stored array; skipping
 * an unreadable element must not renumber the ones after it.
 */
export function readableEntries(log: WorkoutLogDocument): IndexedLogEntry[] {
  if (!Array.isArray(log.entries)) return [];
  const readable: IndexedLogEntry[] = [];
  log.entries.forEach((entry, entryIndex) => {
    if (isRecordLike(entry)) {
      readable.push({ entry, entryIndex });
    }
  });
  return readable;
}

/**
 * Volume trend over chronologically ordered session volumes: the mean of the
 * last three sessions against the three before them, with a 3% dead band so
 * ordinary noise reads as flat.
 */
export function deriveVolumeTrend(volumes: readonly number[]): "up" | "flat" | "down" {
  if (volumes.length < 3) return "flat";
  const recent = volumes.slice(-3);
  const prior = volumes.slice(-6, -3);
  if (prior.length === 0) return "flat";
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const recentAverage = average(recent);
  const priorAverage = average(prior);
  if (recentAverage > priorAverage * 1.03) return "up";
  if (recentAverage < priorAverage * 0.97) return "down";
  return "flat";
}

export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  canonicalExerciseId?: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    // Every matching entry, never `find`: one workout can log the same
    // exercise twice (a top set plus a back-off block), and dropping the
    // second entry would silently lose recorded work.
    for (const { entry } of readableEntries(log)) {
      const matches = canonicalExerciseId && entry.canonicalExerciseId
        // Prefer canonical-id match when both sides supply one.
        ? entry.canonicalExerciseId === canonicalExerciseId
        // Legacy / pre-canonical fallback: slot-id match.
        : entry.exerciseId === exerciseId;
      if (!matches) continue;

      rows.push({
        date: logLocalDate(log),
        sets: entrySetLabels(entry),
        note: entryNote(entry),
        volume: entryVolumeLb(entry),
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
