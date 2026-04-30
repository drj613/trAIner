import type { ProgramDay } from "@/lib/programs/types";
import type { PeriodizationResult, Warning } from "./types";
import { getEffectiveSets } from "./muscles";

export function analyzePeriodization(days: ProgramDay[]): PeriodizationResult {
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))].sort((a, b) => a - b);
  const warnings: Warning[] = [];

  if (weeks.length <= 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Single-week program — no periodization detected. Consider adding progressive overload across 4-6 weeks with a deload.",
    });
    return { weeksDetected: 1, volumePattern: "static", deloadDetected: false, warnings };
  }

  const weeklyVolumes = weeks.map((wk) => {
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    let total = 0;
    for (const day of weekDays) {
      for (const section of day.sections) {
        for (const group of section.groups) {
          for (const exercise of group.exercises) {
            total += getEffectiveSets(exercise);
          }
        }
      }
    }
    return total;
  });

  const maxVolume = Math.max(...weeklyVolumes);
  const lastWeekVolume = weeklyVolumes[weeklyVolumes.length - 1];
  const deloadDetected = lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;

  const volumePattern = detectPattern(weeklyVolumes);

  if (!deloadDetected && weeks.length >= 4) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "No deload week detected — consider reducing volume by 30%+ in the final week every 4-6 weeks.",
    });
  }

  if (volumePattern === "static" && weeks.length > 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Volume is flat across all weeks — consider progressive overload (add 1 set/muscle/week).",
    });
  }

  return { weeksDetected: weeks.length, volumePattern, deloadDetected, warnings };
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
