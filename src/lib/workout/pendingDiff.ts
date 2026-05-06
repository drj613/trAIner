import type { ProgramDay } from "@/lib/programs/types";

const SESSION_KEY = "trainer-pending-diff";

export type PendingDiff = {
  programId: string;
  original: ProgramDay;
  replacement: ProgramDay;
  scope: "week" | "day";
  weekNumber?: number;
  dayId?: string;
};

export function storePendingDiff(
  programId: string,
  original: ProgramDay,
  replacement: ProgramDay,
  scope: "week" | "day" = "day",
  weekNumber?: number,
  dayId?: string
): boolean {
  try {
    const payload: PendingDiff = {
      programId,
      original,
      replacement,
      scope,
      weekNumber,
      dayId: dayId ?? original.id,
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
