import type { WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";

/**
 * Parse a cell string like "65x10", "BWx8", "+70x9" into a WorkoutSetLog.
 * Returns null for empty/skip/pain cells.
 */
export function parseCellToSet(cell: string, setNumber: number): WorkoutSetLog | null {
  if (!cell || cell === "skip" || cell === "pain") return null;

  // Strip leading PR marker
  const stripped = cell.startsWith("+") ? cell.slice(1) : cell;

  const match = /^(BW|\d+(?:\.\d+)?)x(\d+)$/i.exec(stripped);
  if (!match) return null;

  const weightPart = match[1];
  const reps = parseInt(match[2], 10);

  const weight =
    weightPart.toUpperCase() === "BW" ? undefined : parseFloat(weightPart);

  return { setNumber, weight, reps };
}

/**
 * Convert an array of cell strings to WorkoutSetLog[].
 * Skips empty/invalid cells. setNumber is 1-based original index.
 */
export function serialiseSets(cells: string[]): WorkoutSetLog[] {
  const result: WorkoutSetLog[] = [];
  for (let i = 0; i < cells.length; i++) {
    const set = parseCellToSet(cells[i], i + 1);
    if (set !== null) result.push(set);
  }
  return result;
}

/**
 * Convert a WorkoutLogEntry back to cell strings for display.
 * Returns [""] when the entry has no sets.
 * Uses setNumber to restore sparse positions (e.g., set 2 skipped → empty string at index 1).
 */
export function hydrateFromLog(entry: WorkoutLogEntry): string[] {
  if (!entry.sets || entry.sets.length === 0) return [""];
  const maxSet = Math.max(...entry.sets.map((s) => s.setNumber));
  const out = Array<string>(maxSet).fill("");
  for (const s of entry.sets) {
    const cell = s.weight === undefined
      ? (s.reps ? `BWx${s.reps}` : "")
      : s.reps ? `${s.weight}x${s.reps}` : `${s.weight}`;
    out[s.setNumber - 1] = cell;
  }
  return out;
}
