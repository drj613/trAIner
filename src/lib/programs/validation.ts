import { getRenderableDays } from "@/lib/programs/overrides";
import type { ImportWarning, ProgramDocument } from "@/lib/programs/types";

export type ProgramDiagnostic = ImportWarning & {
  code: string;
  originalValue?: unknown;
  replacementValue?: unknown;
  targetId?: string;
  affectedWeeks?: number[];
};

export type NormalizedPrescription = {
  sets: number;
  reps?: string;
  diagnostics: ProgramDiagnostic[];
};

export function normalizePrescription(
  input: { sets?: unknown; reps?: unknown },
  path: string,
  targetId?: string,
): NormalizedPrescription {
  const diagnostics: ProgramDiagnostic[] = [];
  const setResult = normalizeSetCount(input.sets);
  if (setResult.corrected) {
    diagnostics.push({
      code: setResult.coerced ? "sets-coerced" : "sets-defaulted",
      path,
      ...(targetId ? { targetId } : {}),
      originalValue: input.sets,
      replacementValue: setResult.value,
      message: setResult.coerced
        ? `Set count ${String(input.sets)} was converted to ${setResult.value}.`
        : `Set count ${formatOriginal(input.sets)} is invalid; using ${setResult.value} sets.`,
    });
  }

  let reps: string | undefined;
  if (typeof input.reps === "string") {
    reps = input.reps.trim() || undefined;
  } else if (typeof input.reps === "number" && Number.isFinite(input.reps)) {
    reps = String(input.reps);
    diagnostics.push({
      code: "reps-coerced",
      path,
      ...(targetId ? { targetId } : {}),
      originalValue: input.reps,
      replacementValue: reps,
      message: `Rep prescription ${input.reps} was converted to text.`,
    });
  }
  return { sets: setResult.value, reps, diagnostics };
}

export function normalizeSetCount(value: unknown): { value: number; corrected: boolean; coerced: boolean } {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { value, corrected: false, coerced: false };
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return { value: parsed, corrected: true, coerced: true };
    }
  }
  return { value: 3, corrected: true, coerced: false };
}

export function validateProgram(program: ProgramDocument): ProgramDiagnostic[] {
  const diagnostics: ProgramDiagnostic[] = [];
  const effectiveDays = getRenderableDays(program);
  for (const day of effectiveDays) {
    for (const [sectionIndex, section] of day.sections.entries()) {
      for (const [groupIndex, group] of section.groups.entries()) {
        if (group.type !== "superset" || group.exercises.length < 2) continue;
        const exercises = group.exercises.map((exercise) => ({
          name: exercise.name,
          sets: normalizeSetCount(exercise.sets).value,
        }));
        const counts = new Set(exercises.map((exercise) => exercise.sets));
        if (counts.size < 2) continue;
        const week = day.weekNumber;
        diagnostics.push({
          code: "superset-set-mismatch",
          path: `days.${day.id}.sections.${sectionIndex}.groups.${groupIndex}`,
          targetId: group.id,
          ...(week !== undefined ? { affectedWeeks: [week] } : {}),
          message: `Superset set counts differ${week !== undefined ? ` in week ${week}` : ""}: ${exercises.map(({ name, sets }) => `${name} (${sets})`).join(", ")}.`,
        });
      }
    }
  }
  return diagnostics;
}

function formatOriginal(value: unknown): string {
  if (value === undefined) return "missing";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}
