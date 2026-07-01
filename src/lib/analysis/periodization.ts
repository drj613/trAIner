import type { ProgramDay, ProgramExercise } from "@/lib/programs/types";
import type { PeriodizationResult, Warning } from "./types";
import { getEffectiveSets, repMidpoint } from "./muscles";
import { parseLoad } from "./parseLoad";

function weekExercises(weekDays: ProgramDay[]): ProgramExercise[] {
  const out: ProgramExercise[] = [];
  for (const day of weekDays)
    for (const section of day.sections)
      for (const group of section.groups)
        for (const exercise of group.exercises) out.push(exercise);
  return out;
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

function weekIsHeavy(weekDays: ProgramDay[]): boolean {
  // Weigh by sets, not exercise count: in a volume-cut final week the heavy
  // main lifts carry most sets even when accessories outnumber them.
  let totalSets = 0;
  let heavySets = 0;
  for (const exercise of weekExercises(weekDays)) {
    const sets = getEffectiveSets(exercise);
    totalSets += sets;
    if (exerciseIsHeavy(exercise)) heavySets += sets;
  }
  if (totalSets === 0) return false;
  return heavySets / totalSets >= 0.5;
}

function weekAvgPct(weekDays: ProgramDay[]): number | null {
  const pcts = weekExercises(weekDays)
    .map((e) => parseLoad(e.load).pct1rm)
    .filter((p): p is number => p !== undefined);
  if (pcts.length === 0) return null;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

function weekAvgReps(weekDays: ProgramDay[]): number | null {
  const mids = weekExercises(weekDays)
    .map((e) => repMidpoint(e.reps))
    .filter((m): m is number => m !== null);
  if (mids.length === 0) return null;
  return mids.reduce((a, b) => a + b, 0) / mids.length;
}

function detectIntensityProgression(
  days: ProgramDay[],
  weeks: number[],
): PeriodizationResult["intensityProgression"] {
  const firstDays = days.filter((d) => (d.weekNumber ?? 1) === weeks[0]);
  const lastDays = days.filter((d) => (d.weekNumber ?? 1) === weeks[weeks.length - 1]);

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
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))].sort((a, b) => a - b);
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
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    let total = 0;
    for (const exercise of weekExercises(weekDays)) total += getEffectiveSets(exercise);
    return total;
  });

  const maxVolume = Math.max(...weeklyVolumes);
  const lastWeekVolume = weeklyVolumes[weeklyVolumes.length - 1];
  const lastWeekDays = days.filter((d) => (d.weekNumber ?? 1) === weeks[weeks.length - 1]);

  const volumeDropped = lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;
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
