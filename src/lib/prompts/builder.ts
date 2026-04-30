import type { ProfileDocument, ProgramDay, ProgramDocument, ProgramScope } from "@/lib/programs/types";

export function buildProfileBlock(profile: ProfileDocument): string {
  const lines = [
    "## Profile",
    `Name: ${profile.name}`,
    `Training age: ${profile.trainingAge ?? "unknown"}`,
    `Days per week: ${profile.defaultDaysPerWeek ?? "unknown"}`,
    `Goals: ${profile.goals.join(", ")}`,
    `Equipment: ${profile.equipment.join(", ")}`,
  ];
  return lines.join("\n");
}

export function buildConstraintsBlock(profile: ProfileDocument): string {
  if (!profile.constraints || profile.constraints.length === 0) return "";
  const lines = ["## Constraints", ...profile.constraints.map((c) => `- ${c}`)];
  return lines.join("\n");
}

export function buildRoutineBlock(program: ProgramDocument | undefined): string {
  if (!program) return "";
  const lines = [
    "## Current Routine",
    `Name: ${program.title}`,
  ];
  if (program.days && program.days.length > 0) {
    lines.push(`Days: ${program.days.length}`);
  }
  return lines.join("\n");
}

export function buildSchemaBlock(): string {
  return [
    "## Output schema",
    "Respond with valid JSON only. No markdown fences. No explanation.",
    "The JSON must conform to the ProgramDocument schema.",
  ].join("\n");
}

export function assemblePrompt(blocks: string[]): string {
  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}


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
