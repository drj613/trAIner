import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, SessionResult, Warning } from "./types";
import { SESSION_LIMITS } from "./thresholds";
import { mapMuscle, getEffectiveSets } from "./muscles";

export function analyzeSessions(days: ProgramDay[]): SessionResult[] {
  return days.map(analyzeDay);
}

function analyzeDay(day: ProgramDay): SessionResult {
  let exerciseCount = 0;
  let totalSets = 0;
  const muscleSetCounts: Partial<Record<MuscleGroup, number>> = {};
  const warnings: Warning[] = [];

  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const exercise of group.exercises) {
        exerciseCount++;
        const sets = getEffectiveSets(exercise);
        totalSets += sets;

        for (const label of exercise.tags.primary) {
          const muscle = mapMuscle(label);
          if (muscle) muscleSetCounts[muscle] = (muscleSetCounts[muscle] ?? 0) + sets;
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

  if (totalSets > lim.totalSets.yellowMax) {
    warnings.push({
      severity: "red",
      dimension: "session",
      message: `${day.title}: ${totalSets} total sets (recommended: ${lim.totalSets.greenMin}-${lim.totalSets.greenMax})`,
    });
  } else if (totalSets > lim.totalSets.greenMax) {
    warnings.push({
      severity: "yellow",
      dimension: "session",
      message: `${day.title}: ${totalSets} total sets — high volume`,
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
    estimatedMinutes,
    muscleSetCounts,
    warnings,
  };
}
