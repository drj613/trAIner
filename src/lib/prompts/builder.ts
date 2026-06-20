import type { RecoveryReason } from "@/lib/import/sanitizeJson";

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

  const programRequirements = `## Program requirements
Every routine you emit must include:
- A concrete progressive-overload rule, stated numerically — e.g. double progression ("when all sets reach the top of the rep range at ≤1 RIR, add 2.5–5% load and return to the bottom of the range"), or a defined weekly load step. Avoid vague guidance like "increase over time".
- Periodization with a planned deload — organize multi-week programs into a mesocycle (accumulate volume/intensity across weeks, then a deload week at ~50% volume). Express week-to-week changes using \`weeks\` + \`overrides\`.
- A balanced week — cover the major movement patterns (horizontal/vertical push and pull, hinge, squat) across the week with a sane push:pull ratio; don't leave large gaps or pile redundant volume on one pattern.
- A warmup in every session (a dedicated warmup section or ramp-up sets before heavy work).`;

  const outputContract = `## Output contract (when emitting after GENERATE IT)
Output a single JSON object so the app can import it directly:
- The first character of your reply is \`{\` and the last is \`}\`.
- Use the exact field names and structure from the schema above.
- Use straight ASCII quotes.

Emit only the JSON object — no markdown code fences, no preamble, no commentary before or after.`;

  const conversationMode = `## Output mode

Default to conversational coaching. Ask clarifying questions, surface tradeoffs between approaches, and discuss programming choices with the athlete. Keep the routine JSON out of this phase entirely — discussing in prose keeps the design flexible and easy to revise.

Before the athlete asks for the final routine, make sure you have done the following in the conversation, in prose:
- Stated your key programming decisions: weekly volume per muscle group, intensity scheme (RIR/RPE or %1RM), the progression rule, and the deload plan.
- Run a quick self-audit and fixed any issues — is per-muscle weekly volume within the ranges below? Is the week balanced across movement patterns (push/pull, all major patterns)? Does every session include a warmup? Does every exercise respect the athlete's equipment and injuries?

When the athlete types \`GENERATE IT\` (exactly those words, all caps), switch to emit-only mode for that single response and output the routine JSON described below — and nothing else. Keep all reasoning, rationale, and audit notes in the conversation; the JSON itself carries only the program.

After emitting, return to conversational coaching for any follow-up. If the athlete asks for changes, discuss them in prose until they type \`GENERATE IT\` again.

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
    programRequirements,
    outputContract,
  ].join("\n");
}

export function buildRecoveryPrompt(reason: RecoveryReason, detail?: string): string {
  const contract = [
    "Re-emit ONLY the routine as raw JSON, matching the schema from earlier in this conversation:",
    "- The first character must be `{` and the last must be `}`.",
    "- Use straight ASCII quotes, no markdown code fences, no comments, and no trailing commas.",
    "- No preamble or commentary before or after the JSON.",
    "- Use the exact field names from the schema; do not rename or restructure.",
  ];

  let lead: string;
  switch (reason) {
    case "truncated":
      lead =
        "The previous JSON looks cut off (it ends mid-structure), so it could not be imported. Re-emit the COMPLETE program as a single minified JSON object (no pretty-printing) so it fits in one message.";
      break;
    case "not-object":
      lead =
        "The previous response parsed but was not a JSON object. The top level must be a single JSON object containing a `days` array.";
      break;
    case "no-days":
      lead =
        "The previous JSON had no workout days. The top level must include a `days` array, and each day must contain `sections`.";
      break;
    default:
      lead = detail
        ? `The previous response could not be imported (${detail}).`
        : "The previous response was not valid routine JSON.";
      break;
  }

  return [
    lead,
    "",
    ...contract,
    "",
    "If you need to discuss anything, do that in a separate message after this one — this message must contain only the JSON.",
  ].join("\n");
}

export function assemblePrompt(blocks: string[]): string {
  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
