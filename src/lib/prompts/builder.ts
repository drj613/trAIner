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
  return lines.join("\n");
}

export function buildConstraintsBlock(profile: ProfileDocument): string {
  if (!profile.constraints || profile.constraints.length === 0) return "";
  const lines = ["## Constraints", ...profile.constraints.map((c) => `- ${c}`)];
  return lines.join("\n");
}

export function buildSchemaBlock(): string {
  const exDay = {
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
  };

  const skeleton = {
    title: "Program Name",
    weeks: "OPTIONAL integer — total number of weeks. Omit for single-week programs.",
    days: [exDay],
    overrides: [
      {
        scope: "week",
        weekNumber: 4,
        reason: "Deload — reduce volume by ~40%",
        days: ["OPTIONAL — same structure as base days above. Omit if all weeks are identical."]
      }
    ]
  };

  const constraints = `## Session and volume constraints
Design sessions to fit these evidence-based targets:
- Exercises per session: 4–8 total (across ALL sections — warmup counts, conditioning counts, everything counts)
- Total sets per session: 10–25
- Estimated session duration: 30–75 minutes
- Direct sets per muscle group per session: ≤ 8

Weekly volume targets (effective sets — primary × 1.0, secondary × 0.5, incidental × 0.25):
- Chest: productive range 6–16 sets/week, hard limit 24
- Lats: productive range 10–20 sets/week, hard limit 30
- Upper back / traps: productive range 10–20 sets/week, hard limit 30
- Front delts: productive range 4–8 sets/week, hard limit 12
- Side delts: productive range 8–24 sets/week, hard limit 30
- Rear delts: productive range 4–12 sets/week, hard limit 20
- Biceps: productive range 14–20 sets/week, hard limit 26
- Triceps: productive range 6–16 sets/week, hard limit 20
- Forearms: productive range 2–8 sets/week, hard limit 12
- Quads: productive range 6–14 sets/week, hard limit 18
- Hamstrings: productive range 4–8 sets/week, hard limit 14
- Glutes: productive range 8–24 sets/week, hard limit 30
- Calves: productive range 6–16 sets/week, hard limit 24
- Core: productive range 8–16 sets/week, hard limit 20
- Adductors/Abductors: productive range 4–10 sets/week, hard limit 16

IMPORTANT: incidental muscles (e.g. "core" on almost every compound, "forearms" on most pulling, "shoulders" on everything) accumulate quickly across many exercises. Tag incidental sparingly — only when the incidental recruitment is genuinely meaningful. "Core" should NOT be incidental on every exercise.`;

  const multiWeekInstructions = `## Multi-week programs
For programs longer than one week:
- Set \`weeks\` to the total number of weeks (integer).
- \`days\` is the base weekly template — the repeating pattern followed by most weeks.
- \`overrides\` lists only the weeks that deviate (e.g. deload week, peak week, test week). Weeks without an override automatically repeat the base template.
- Omit \`weeks\` and \`overrides\` for single-week programs.`;

  const conversationMode = `## Output mode

Default to conversational mode. Ask clarifying questions, surface tradeoffs between approaches, propose options, and discuss programming choices with the athlete. Do NOT emit the routine JSON during this phase — not as a preview, not partially, not wrapped in fences. Conversation only.

When the athlete types \`GENERATE IT\` (exactly those words, all caps) — and only then — switch to emit-only mode for that single response:
- Output ONLY the routine JSON described below.
- No markdown code fences. No preamble like "Here's your routine:". No commentary after the JSON.
- The first character of your response must be \`{\` and the last must be \`}\`.

After emitting the JSON, return to conversational mode for any follow-up messages. If the athlete asks for changes, discuss them conversationally until they type \`GENERATE IT\` again.

At the end of every conversational message, append one line: \`Say GENERATE IT (all caps) when you're ready for the final routine.\``;

  return [
    conversationMode,
    "## Routine JSON schema (used only when emitting after GENERATE IT)",
    "You MUST use the exact field names shown below. Do not rename or restructure the hierarchy.",
    "  - Top level: `title`, `days`, and optionally `weeks` + `overrides`",
    "  - Each day: `day` (number), `title`, `sections`",
    "  - Each section: `name`, `type`, `groups`",
    "  - Each group: `type`, `exercises`",
    `Valid section types: warmup, explosive, strength, power, hypertrophy, accessory, metcon, cardio, conditioning, rehab, mobility, cooldown, training`,
    `Valid group types: single, superset, circuit, giant-set`,
    multiWeekInstructions,
    constraints,
    "Structural skeleton (all real content should replace the placeholder strings):",
    JSON.stringify(skeleton, null, 2),
  ].join("\n");
}

export function buildRecoveryPrompt(errorMessage?: string): string {
  const reason = errorMessage
    ? `The previous response could not be imported. Error: ${errorMessage}`
    : "The previous response was not valid routine JSON.";
  return [
    reason,
    "",
    "Please re-emit ONLY the routine as raw JSON, matching the schema you were given earlier in this conversation. Strict rules:",
    "- No markdown code fences (no ```json, no ```).",
    "- No preamble, no commentary, no explanation outside the JSON.",
    "- First character must be `{`, last character must be `}`.",
    "- Use the exact field names from the schema. Do not rename or restructure.",
    "",
    "If you need to ask a question or discuss anything, do that in a separate message after this one — this message must contain only the JSON.",
  ].join("\n");
}

export function assemblePrompt(blocks: string[]): string {
  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
