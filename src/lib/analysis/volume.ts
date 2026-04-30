import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, MuscleVolumeResult, Severity } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS } from "./thresholds";
import { mapMuscle, getEffectiveSets } from "./muscles";

export function countWeeklyVolume(
  days: ProgramDay[],
  weekNumber = 1,
): Map<MuscleGroup, number> {
  const volumes = new Map<MuscleGroup, number>();
  const weekDays = days.filter((d) => (d.weekNumber ?? 1) === weekNumber);

  for (const day of weekDays) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const sets = getEffectiveSets(exercise);
          addMuscleVolume(volumes, exercise.tags.primary, sets, 1.0);
          addMuscleVolume(volumes, exercise.tags.secondary, sets, 0.5);
          addMuscleVolume(volumes, exercise.tags.incidental, sets, 0.25);
        }
      }
    }
  }

  return volumes;
}

function addMuscleVolume(
  volumes: Map<MuscleGroup, number>,
  muscles: string[],
  sets: number,
  weight: number,
): void {
  for (const label of muscles) {
    const canonical = mapMuscle(label);
    if (!canonical) continue;
    volumes.set(canonical, (volumes.get(canonical) ?? 0) + sets * weight);
  }
}

export function scoreVolume(volumes: Map<MuscleGroup, number>): MuscleVolumeResult[] {
  return ALL_MUSCLE_GROUPS.map((muscle) => {
    const sets = volumes.get(muscle) ?? 0;
    const landmarks = VOLUME_LANDMARKS[muscle];
    const { severity, label } = classifyVolume(sets, landmarks);
    return { muscle, effectiveSets: Math.round(sets * 10) / 10, severity, label, landmarks };
  });
}

function classifyVolume(
  sets: number,
  lm: (typeof VOLUME_LANDMARKS)[MuscleGroup],
): { severity: Severity; label: string } {
  if (sets < lm.mv) return { severity: "red", label: "Below maintenance" };
  if (sets < lm.mev) return { severity: "yellow", label: "Maintenance only" };
  if (sets <= lm.mavHigh) return { severity: "green", label: "Productive range" };
  if (sets <= lm.mrv) return { severity: "yellow", label: "High — approaching limit" };
  return { severity: "red", label: "Excessive — recovery impaired" };
}
