import type { ProgramDay } from "@/lib/programs/types";
import type { ImportWarning } from "@/lib/programs/types";
import type { EditScope, ProgramEdit } from "@/lib/programs/edits";

const SESSION_KEY = "trainer-pending-diff";

export type PendingDiff = {
  programId: string;
  original: ProgramDay;
  replacement: ProgramDay;
  // "week" and "day" are accepted only for pending data written by older builds.
  scope?: EditScope | "week" | "day";
  weekNumber?: number;
  dayId?: string;
  warnings?: ImportWarning[];
  edit?: ProgramEdit;
};

export function resolvePendingDiffScope(pending: PendingDiff): EditScope | null {
  if (pending.scope === "week") return null;
  if (pending.scope === "day" || pending.scope === undefined) return "occurrence";
  return pending.scope;
}

export function storePendingDiff(
  programId: string,
  original: ProgramDay,
  replacement: ProgramDay,
  scope: EditScope | "week" | "day" = "occurrence",
  weekNumber?: number,
  dayId?: string,
  warnings?: ImportWarning[],
  edit?: ProgramEdit,
): boolean {
  try {
    const payload: PendingDiff = {
      programId,
      original,
      replacement,
      scope,
      weekNumber,
      dayId: dayId ?? original.id,
      warnings,
      edit,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingDiff(): PendingDiff | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingDiff;
  } catch {
    return null;
  }
}

export function clearPendingDiff() {
  sessionStorage.removeItem(SESSION_KEY);
}
