import type { ProfileDocument, ProgramDay, ProgramDocument, ProgramScope } from "@/lib/programs/types";

// TODO: Add periodization instructions — prompt should request multi-week programs
// with progressive overload across weeks (e.g., increasing volume or intensity)
// and deload weeks every 4-6 weeks. Currently we generate a single week and 4×
// duplicate it, but the prompt should support true mesocycle structure.
// See docs/research/program-analysis-research/01-volume-landmarks.md for volume
// progression guidelines and 04-goal-signatures.md for goal-specific periodization.
export function buildInitialProgramPrompt(profile: ProfileDocument) {
  return [
    "Create a structured workout program for this profile.",
    "",
    "Profile:",
    JSON.stringify(profile, null, 2),
    "",
    "Return only JSON. Use a top-level program_name and days array. Each day must include title, sections, exercise_groups, and exercises.",
    "Preserve sections such as warmup, explosive, strength, metcon, hypertrophy, circuit, and superset when appropriate."
  ].join("\n");
}

export function buildModificationPrompt(program: ProgramDocument, scope: ProgramScope, current: ProgramDocument | ProgramDay | ProgramDay[]) {
  return [
    `Modify the selected ${scope} scope for this workout program.`,
    "Return a full JSON replacement for only the selected scope.",
    "Do not explain the changes outside JSON.",
    "",
    "Program context:",
    JSON.stringify({ id: program.id, title: program.title }, null, 2),
    "",
    "Current JSON:",
    JSON.stringify(current, null, 2)
  ].join("\n");
}
