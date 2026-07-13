import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, SessionResult, Warning } from "./types";
import { SESSION_LIMITS } from "./thresholds";
import { mapMuscle, getEffectiveSets } from "./muscles";
import { resolveCountsTowardVolume } from "./volumeRole";

export function analyzeSessions(days: ProgramDay[]): SessionResult[] {
  return days.map(analyzeDay);
}

function analyzeDay(day: ProgramDay): SessionResult {
  let exerciseCount = 0;
  let totalSets = 0;
  let workingSets = 0;
  const muscleSetCounts: Partial<Record<MuscleGroup, number>> = {};
  const warnings: Warning[] = [];

  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const exercise of group.exercises) {
        exerciseCount++;
        const sets = getEffectiveSets(exercise);
        totalSets += sets;

        // Only the resolved WORKING population accumulates toward workingSets
        // and the direct per-muscle cap — warmup/mobility/explicitly-excluded
        // exercises still count toward totalSets/duration above, but must not
        // inflate working-volume or direct-muscle accounting below.
        if (resolveCountsTowardVolume(exercise, section.type)) {
          workingSets += sets;

          for (const label of exercise.tags.primary) {
            const muscle = mapMuscle(label);
            if (muscle) muscleSetCounts[muscle] = (muscleSetCounts[muscle] ?? 0) + sets;
          }
        }
      }
    }
  }

  const estimatedMinutes = totalSets * 3 + 10;
  const lim = SESSION_LIMITS;

  if (exerciseCount > lim.exercises.yellowMax) {
    warnings.push({
      severity: "red",
      dimension: "session",
      message: `${day.title}: ${exerciseCount} exercises (recommended: ${lim.exercises.greenMin}-${lim.exercises.greenMax})`,
    });
  } else if (exerciseCount > lim.exercises.greenMax) {
    warnings.push({
      severity: "yellow",
      dimension: "session",
      message: `${day.title}: ${exerciseCount} exercises — on the high end`,
    });
  }

  // The 10-25(-30) range gates WORKING sets, not all prescribed activity —
  // warmup/mobility/excluded work must not push a session into this warning.
  if (workingSets > lim.totalSets.yellowMax) {
    warnings.push({
      severity: "red",
      dimension: "session",
      message: `${day.title}: working sets are above the preferred range.`,
    });
  } else if (workingSets > lim.totalSets.greenMax) {
    warnings.push({
      severity: "yellow",
      dimension: "session",
      message: `${day.title}: working sets are above the preferred range.`,
    });
  }

  if (estimatedMinutes > lim.durationMinutes.yellowMax) {
    warnings.push({
      severity: "red",
      dimension: "session",
      message: `${day.title}: estimated ${estimatedMinutes} min (recommended: ${lim.durationMinutes.greenMin}-${lim.durationMinutes.greenMax} min)`,
    });
  } else if (estimatedMinutes > lim.durationMinutes.greenMax) {
    warnings.push({
      severity: "yellow",
      dimension: "session",
      message: `${day.title}: estimated ${estimatedMinutes} min — long session`,
    });
  }

  for (const [muscle, count] of Object.entries(muscleSetCounts)) {
    if ((count ?? 0) > lim.setsPerMuscle.yellowMax) {
      warnings.push({
        severity: "red",
        dimension: "session",
        message: `${day.title}: ${count} direct sets for ${muscle} in one session (cap: ${lim.setsPerMuscle.greenMax})`,
      });
    } else if ((count ?? 0) > lim.setsPerMuscle.greenMax) {
      warnings.push({
        severity: "yellow",
        dimension: "session",
        message: `${day.title}: ${count} direct sets for ${muscle} — approaching session cap`,
      });
    }
  }

  return {
    dayId: day.id,
    dayTitle: day.title,
    exerciseCount,
    totalSets,
    workingSets,
    estimatedMinutes,
    muscleSetCounts,
    warnings,
  };
}
