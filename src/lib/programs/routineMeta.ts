import type { ProgramDocument, TrainingGoal } from "./types";

export const GOAL_LABELS: Record<TrainingGoal, string> = {
  general: "General fitness",
  hypertrophy: "Hypertrophy",
  strength: "Strength (PL/OL)",
  endurance: "Endurance / conditioning",
  other: "Other / mixed",
};

export function programStatus(p: ProgramDocument): "active" | "draft" | "archived" {
  return p.status ?? "draft";
}

export function programDaysPerWeek(p: ProgramDocument): number {
  if (p.daysPerWeek != null) return p.daysPerWeek;
  if (!p.days.length) return 0;
  const weekNums = [...new Set(p.days.map((d) => d.weekNumber ?? 1))];
  const firstWeek = Math.min(...weekNums);
  return p.days.filter(
    (d) => (d.weekNumber ?? 1) === firstWeek && !d.title?.toLowerCase().includes("rest")
  ).length;
}

export function programLengthWeeks(p: ProgramDocument): number {
  if (p.lengthWeeks != null) return p.lengthWeeks;
  const weekNumbers = p.days.map((d) => d.weekNumber ?? 1);
  return Math.max(...weekNumbers, 1);
}
