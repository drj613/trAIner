import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";

export function buildProfileBlock(profile: ProfileDocument): string {
  const lines = [
    "## Profile",
    `Name: ${profile.name}`,
    `Training age: ${profile.trainingAge ?? "unknown"}`,
    `Days per week: ${profile.defaultDaysPerWeek ?? "unknown"}`,
    `Goals: ${profile.goals.join(", ")}`,
    `Equipment: ${profile.equipment.join(", ")}`,
  ];
  if (profile.constraints && profile.constraints.length > 0) {
    lines.push("## Injuries & Constraints");
    for (const c of profile.constraints) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

export function buildConstraintsBlock(profile: ProfileDocument): string {
  if (!profile.constraints || profile.constraints.length === 0) return "";
  const lines = ["## Constraints", ...profile.constraints.map((c) => `- ${c}`)];
  return lines.join("\n");
}

export function buildRoutineBlock(program: ProgramDocument | undefined): string {
  if (!program) return "";
  const lines = ["## Current Routine", `Name: ${program.title}`];
  if (!program.days || program.days.length === 0) return lines.join("\n");
  for (const day of program.days) {
    lines.push(`\n### ${day.title}`);
    for (const section of day.sections) {
      lines.push(`**${section.name}** (${section.type})`);
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          const parts = [`- ${ex.name}`];
          if (ex.sets) parts.push(`${ex.sets} sets`);
          if (ex.reps) parts.push(`× ${ex.reps}`);
          if (ex.load) parts.push(`@ ${ex.load}`);
          lines.push(parts.join(" "));
        }
      }
    }
  }
  return lines.join("\n");
}

export function buildSchemaBlock(): string {
  const skeleton = {
    title: "Program Name",
    days: [
      {
        day: 1,
        title: "Day Name",
        sections: [
          {
            name: "Section Name",
            type: "strength",
            groups: [
              {
                type: "single",
                exercises: [
                  {
                    name: "Exercise Name",
                    sets: 3,
                    reps: "5-8",
                    load: "optional — e.g. '80% 1RM' or '60 kg'",
                    rest: "optional — e.g. '90s'",
                    notes: "optional",
                    tags: {
                      primary: ["quads"],
                      secondary: ["glutes"],
                      incidental: [],
                      modifiers: []
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  return [
    "## Output schema",
    "Respond with valid JSON only. No markdown fences. No explanation outside JSON.",
    "You MUST use the exact field names shown below. Do not rename or restructure the hierarchy.",
    "  - Top level: `title`, `days` — never use `sessions`, `weeks`, `blocks`, or any other name",
    "  - Each day: `day` (number), `title`, `sections`",
    "  - Each section: `name`, `type`, `groups`",
    "  - Each group: `type`, `exercises`",
    `Valid section types: warmup, explosive, strength, power, hypertrophy, accessory, metcon, cardio, conditioning, rehab, mobility, cooldown, training`,
    `Valid group types: single, superset, circuit, giant-set`,
    "Structural skeleton (all real content should replace the placeholder strings):",
    JSON.stringify(skeleton, null, 2),
  ].join("\n");
}

export function assemblePrompt(blocks: string[]): string {
  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
