import type { ProfileDocument, ProgramDay, ProgramDocument, ProgramScope } from "@/lib/programs/types";

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
