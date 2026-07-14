import type { WeightUnit, WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";

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
 * Convert a WorkoutLogEntry back to cell strings for display.
 * Returns [""] when the entry has no sets.
 * Uses setNumber to restore sparse positions (e.g., set 2 skipped → empty string at index 1).
 * Pads to prescribedSets if provided, so the grid always shows enough cells.
 */
export function hydrateFromLog(entry: WorkoutLogEntry, prescribedSets?: number): string[] {
  if (!entry.sets || entry.sets.length === 0) {
    const count = Math.max(1, prescribedSets ?? 1);
    return Array<string>(count).fill("");
  }
  const maxSet = Math.max(...entry.sets.map((s) => s.setNumber));
  const count = Math.max(maxSet, prescribedSets ?? maxSet);
  const out = Array<string>(count).fill("");
  for (const s of entry.sets) {
    if (s.rawCell !== undefined) {
      out[s.setNumber - 1] = s.rawCell;
    } else {
      const suffix = s.unit === "kg" ? "kg" : "";
      const cell = s.weight === undefined
        ? (s.reps ? `BWx${s.reps}` : "")
        : s.reps ? `${s.weight}${suffix}x${s.reps}` : `${s.weight}${suffix}`;
      out[s.setNumber - 1] = cell;
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
