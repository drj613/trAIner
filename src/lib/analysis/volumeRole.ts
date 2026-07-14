import type { ProgramExercise, SectionType } from "@/lib/programs/types";

// Shared "does this exercise count toward working volume?" defaults and
// resolver. Consumed by the manual routine builder (assigns the default at
// construction time) and, in later phases, by the volume/session/balance/
// periodization analyzers (read the resolved value instead of assuming every
// exercise counts).
//
// This Record is intentionally exhaustive over SectionType so that adding a
// new section type without a default fails typecheck here rather than
// silently falling through at runtime.
export const DEFAULT_COUNTS_BY_SECTION: Record<SectionType, boolean> = {
  warmup: false,
  explosive: true,
  strength: true,
  power: true,
  hypertrophy: true,
  accessory: true,
  metcon: true,
  cardio: false,
  conditioning: true,
  rehab: false,
  mobility: false,
  cooldown: false,
  training: true,
};

// Exercise tag modifiers that always mean "does not count toward working
// volume" regardless of which section they appear in — an exact match
// (after trim + lowercase) short-circuits the section default.
export const NON_VOLUME_MODIFIERS = new Set([
  "warmup",
  "warm-up",
  "activation",
  "mobility",
  "cooldown",
  "cool-down",
  "rehab",
  "prehab",
]);

// Resolves whether an exercise counts toward working volume.
// Precedence: explicit boolean → exact modifier match → section default → true.
export function resolveCountsTowardVolume(exercise: ProgramExercise, sectionType: SectionType): boolean {
  if (typeof exercise.countsTowardVolume === "boolean") return exercise.countsTowardVolume;
  const modifiers = new Set(exercise.tags.modifiers.map((v) => v.trim().toLowerCase()));
  for (const modifier of modifiers) {
    if (NON_VOLUME_MODIFIERS.has(modifier)) return false;
  }
  return DEFAULT_COUNTS_BY_SECTION[sectionType] ?? true;
}
