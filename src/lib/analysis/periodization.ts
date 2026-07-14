import type { ProgramDay, ProgramExercise } from "@/lib/programs/types";
import type { PeriodizationResult, Warning } from "./types";
import { getEffectiveSets, repMidpoint } from "./muscles";
import { parseLoad } from "./parseLoad";
import { resolveCountsTowardVolume } from "./volumeRole";
import { effectiveWeekNumber } from "@/lib/programs/domain";

// Filters DURING traversal — section context is still in scope when the
// gate is applied, so warmup/mobility/cooldown/etc. exercises never reach
// the flattened ProgramExercise[] that every set-derived metric below reads.
function gatedExercises(days: ProgramDay[]): ProgramExercise[] {
  const out: ProgramExercise[] = [];
  for (const day of days)
    for (const section of day.sections)
      for (const group of section.groups)
        for (const exercise of group.exercises)
          if (resolveCountsTowardVolume(exercise, section.type)) out.push(exercise);
  return out;
}

/** The gated (working-set-only) population for a single program week. */
function getWorkingWeekExercises(days: ProgramDay[], weekNumber: number): ProgramExercise[] {
  return gatedExercises(days.filter((d) => effectiveWeekNumber(d) === weekNumber));
}

function exerciseIsHeavy(exercise: ProgramExercise): boolean {
  const load = parseLoad(exercise.load);
  if (load.pct1rm !== undefined && load.pct1rm >= 85) return true;
  if (load.repMax !== undefined && load.repMax <= 3) return true;
  if (load.rpe !== undefined && load.rpe >= 9) return true;
  // An explicit sub-85% load means not heavy even at low reps —
  // light triples in a deload must not read as heavy singles.
  if (load.pct1rm !== undefined) return false;
  const mid = repMidpoint(exercise.reps);
  if (mid !== null && mid <= 3) return true;
  return false;
}

/** Set-weighted share of heavy work (≥85% 1RM / ≤3RM / RPE ≥ 9 / reps ≤ 3). */
export function heavySetShare(days: ProgramDay[]): number {
  let totalSets = 0;
  let heavySets = 0;
  for (const exercise of gatedExercises(days)) {
    const sets = getEffectiveSets(exercise);
    totalSets += sets;
    if (exerciseIsHeavy(exercise)) heavySets += sets;
  }
  return totalSets === 0 ? 0 : heavySets / totalSets;
}

function weekIsHeavy(weekDays: ProgramDay[]): boolean {
  // Weigh by sets, not exercise count: in a volume-cut final week the heavy
  // main lifts carry most sets even when accessories outnumber them.
  return heavySetShare(weekDays) >= 0.5;
}

function weekAvgPct(weekDays: ProgramDay[]): number | null {
  const pcts = gatedExercises(weekDays)
    .map((e) => parseLoad(e.load).pct1rm)
    .filter((p): p is number => p !== undefined);
  if (pcts.length === 0) return null;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

function weekAvgReps(weekDays: ProgramDay[]): number | null {
  const mids = gatedExercises(weekDays)
    .map((e) => repMidpoint(e.reps))
    .filter((m): m is number => m !== null);
  if (mids.length === 0) return null;
  return mids.reduce((a, b) => a + b, 0) / mids.length;
}

function detectIntensityProgression(
  days: ProgramDay[],
  weeks: number[],
): PeriodizationResult["intensityProgression"] {
  const firstDays = days.filter((d) => effectiveWeekNumber(d) === weeks[0]);
  const lastDays = days.filter((d) => effectiveWeekNumber(d) === weeks[weeks.length - 1]);

  const p0 = weekAvgPct(firstDays);
  const p1 = weekAvgPct(lastDays);
  if (p0 !== null && p1 !== null) return p1 - p0 >= 5 ? "rising" : "flat";

  // Fallback when loads aren't expressed as %1RM: falling rep midpoints imply rising intensity.
  const r0 = weekAvgReps(firstDays);
  const r1 = weekAvgReps(lastDays);
  if (r0 !== null && r1 !== null) return r0 - r1 >= 2 ? "rising" : "flat";

  return "unknown";
}

export function analyzePeriodization(days: ProgramDay[]): PeriodizationResult {
  const weeks = [...new Set(days.map((d) => effectiveWeekNumber(d)))].sort((a, b) => a - b);
  const warnings: Warning[] = [];

  if (weeks.length <= 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Single-week program — no periodization detected. Consider adding progressive overload across 4-6 weeks with a deload.",
    });
    return {
      weeksDetected: 1,
      volumePattern: "static",
      deloadDetected: false,
      peakDetected: false,
      intensityProgression: "unknown",
      warnings,
    };
  }

  const weeklyVolumes = weeks.map((wk) => {
    let total = 0;
    for (const exercise of getWorkingWeekExercises(days, wk)) total += getEffectiveSets(exercise);
    return total;
  });

  const maxVolume = Math.max(...weeklyVolumes);
  const lastWeekVolume = weeklyVolumes[weeklyVolumes.length - 1];
  const lastWeekDays = days.filter((d) => effectiveWeekNumber(d) === weeks[weeks.length - 1]);

  // Positive-reference guard: with a zero-working-volume routine (e.g. pure
  // mobility, fully gated out), maxVolume is 0 and 0 <= 0 * 0.7 is
  // vacuously true — without this guard that reads as a spurious deload.
  const volumeDropped = maxVolume > 0 && lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;
  const lastWeekHeavy = weekIsHeavy(lastWeekDays);
  const deloadDetected = volumeDropped && !lastWeekHeavy;
  const peakDetected = volumeDropped && lastWeekHeavy;

  const volumePattern = detectPattern(weeklyVolumes);
  const intensityProgression = detectIntensityProgression(days, weeks);

  if (!deloadDetected && !peakDetected && weeks.length >= 4) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "No deload week detected — consider reducing volume by 30%+ in the final week every 4-6 weeks.",
    });
  }

  if (volumePattern === "static" && weeks.length > 1 && intensityProgression !== "rising") {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Volume is flat across all weeks — consider progressive overload (add 1 set/muscle/week).",
    });
  }

  return { weeksDetected: weeks.length, volumePattern, deloadDetected, peakDetected, intensityProgression, warnings };
}

function detectPattern(volumes: number[]): PeriodizationResult["volumePattern"] {
  if (volumes.length <= 1) return "static";

  const diffs: number[] = [];
  for (let i = 1; i < volumes.length; i++) {
    diffs.push(volumes[i] - volumes[i - 1]);
  }

  const allZero = diffs.every((d) => Math.abs(d) < 1);
  if (allZero) return "static";

  const increasing = diffs.every((d) => d >= 0);
  if (increasing) return "increasing";

  const decreasing = diffs.every((d) => d <= 0);
  if (decreasing) return "decreasing";

  return "wave";
}
