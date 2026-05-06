import type { WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";

/**
 * Parse a cell string like "65x10", "BWx8", "+70x9" into a WorkoutSetLog.
 * Returns a WorkoutSetLog with rawCell for unrecognized/skip/pain strings.
 * Empty strings are still treated as empty (returns { setNumber, rawCell: "" }).
 */
export function parseCellToSet(cell: string, setNumber: number): WorkoutSetLog {
  if (!cell) return { setNumber, rawCell: cell };

  const lower = cell.trim().toLowerCase();
  if (lower === "skip" || lower === "pain") return { setNumber, rawCell: cell };

  // Strip leading PR marker
  const stripped = cell.startsWith("+") ? cell.slice(1) : cell;

  const match = /^(BW|\d+(?:\.\d+)?)x(\d+)$/i.exec(stripped);
  if (!match) return { setNumber, rawCell: cell };

  const weightPart = match[1];
  const reps = parseInt(match[2], 10);

  const weight =
    weightPart.toUpperCase() === "BW" ? undefined : parseFloat(weightPart);

  return { setNumber, weight, reps };
}

/**
 * Convert an array of cell strings to WorkoutSetLog[].
 * Skips empty cells. setNumber is 1-based original index.
 * Unrecognized strings (e.g., notes) are preserved via rawCell.
 */
export function serialiseSets(cells: string[]): WorkoutSetLog[] {
  const result: WorkoutSetLog[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].trim()) continue;
    result.push(parseCellToSet(cells[i], i + 1));
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
      const cell = s.weight === undefined
        ? (s.reps ? `BWx${s.reps}` : "")
        : s.reps ? `${s.weight}x${s.reps}` : `${s.weight}`;
      out[s.setNumber - 1] = cell;
    }
  }
  return out;
}
