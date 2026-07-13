import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, MuscleVolumeResult, Severity } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS } from "./thresholds";
import { mapMuscleExpanded, getEffectiveSets } from "./muscles";
import { resolveCountsTowardVolume } from "./volumeRole";

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
          if (!resolveCountsTowardVolume(exercise, section.type)) {
            continue;
          }
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

const FULL_BODY_DISCOUNT = 0.5;

function addMuscleVolume(
  volumes: Map<MuscleGroup, number>,
  muscles: string[],
  sets: number,
  weight: number,
): void {
  // Within a single tier, each canonical muscle is credited once, retaining the
  // LARGEST expansion factor rather than summing duplicates. A direct label
  // gives its canonical factor 1.0; "full body" expands to 6 muscles at half
  // credit (FULL_BODY_DISCOUNT) so one exercise can't generate 6× its sets. A
  // muscle named both directly and via full-body keeps max(1.0, 0.5) = 1.0.
  // Cross-tier addition is preserved: each tier is a separate call, so the
  // shared `volumes` map accumulates across tiers.
  const contributions = new Map<MuscleGroup, number>();
  for (const label of muscles) {
    const canonicals = mapMuscleExpanded(label);
    const factor = canonicals.length > 1 ? FULL_BODY_DISCOUNT : 1.0;
    for (const canonical of canonicals) {
      const previous = contributions.get(canonical) ?? 0;
      contributions.set(canonical, Math.max(previous, factor));
    }
  }
  for (const [canonical, factor] of contributions) {
    volumes.set(canonical, (volumes.get(canonical) ?? 0) + sets * factor * weight);
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
  if (sets < lm.mavLow) return { severity: "green", label: "Productive — lower end" };
  if (sets <= lm.mavHigh) return { severity: "green", label: "Productive range" };
  if (sets <= lm.mrv) return { severity: "yellow", label: "High — approaching limit" };
  return { severity: "red", label: "Excessive — recovery impaired" };
}
