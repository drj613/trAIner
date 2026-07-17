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
                countsTowardVolume: true,
                variants: [
                  {
                    weeks: [2, 4],
                    name: "A week-specific swap of this ONE exercise — omit any field to inherit it from the base exercise above",
                    load: "optional — only include fields that differ from the base"
                  }
                ],
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

  const overrideReplacementDay = {
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
                sets: 2,
                reps: "5-8",
                load: "optional — e.g. '65% 1RM' or '50 kg' (reduced vs base week)",
                rest: "optional — e.g. '90s'",
                notes: "deload — reduced volume vs the base week (approximately 50% of normal)",
                countsTowardVolume: true,
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

  const progressionExample = [
    {
      applies: "Primary compounds (squat, bench, deadlift)",
      rule: "Top set + 3 back-offs; when the top set stays <=RPE8 for all reps, add 2.5-5% load."
    },
    {
      applies: "Hypertrophy accessories",
      rule: "Double progression: add reps to the top of the range across all sets, then +5-10% load and reset."
    }
  ];

  const skeleton = {
    title: "Program Name",
    weeks: "OPTIONAL integer — total number of weeks. Omit for single-week programs.",
    progression: progressionExample,
    days: [exDay],
    overrides: [
      {
        scope: "week",
        weekNumber: 4,
        reason: "Deload — use approximately 50% of normal working-set volume",
        days: [overrideReplacementDay]
      }
    ]
  };

  const exerciseSchemaNotes = `## countsTowardVolume (required on every exercise)
Every exercise object must include a boolean \`countsTowardVolume\` field.

Set \`countsTowardVolume\` to \`true\` when the prescribed sets are intended to contribute to working strength, hypertrophy, muscular conditioning, or explosive training volume.

Set it to \`false\` for ordinary warmups, activation drills, mobility work, cooldowns, rehabilitation or prehabilitation work, and low-fatigue practice that is not intended as productive muscular working volume.

Muscle tags still describe anatomical involvement when \`countsTowardVolume\` is false. The boolean controls analysis, not anatomy.`;

  const overrideInstructions = `## Overrides
Only emit an override when at least one routine day actually changes.

Every override must contain one or more complete replacement day objects.

An override with omitted \`days\` or an empty \`days\` array does not alter the routine and must not be emitted.

If a week is identical to the base template, omit the entire override object.

The \`reason\` field is descriptive only. It does not alter sets, repetitions, loads, exercises, or effort targets.`;

  const constraints = `## Session and volume constraints
Design sessions using these default planning guardrails:
- Listed exercises or protocols per session: generally 4-8. All warmup, mobility, skill, conditioning, and cooldown exercises count toward this number.
- Working sets per session: generally 10-25. Only exercises with \`countsTowardVolume: true\` count toward this range.
- Estimated session duration: 30-75 minutes, including all programmed work.
- Direct working sets per muscle group per session: generally no more than 8, unless the athlete deliberately requests specialization and accepts the tradeoff.

The numeric \`sets\` value controls the number of workout logging rows. It must equal the complete prescription described in \`reps\`, \`load\`, and \`notes\`.
- One top set plus three back-off sets uses \`"sets": 4\`.
- One top set plus two back-off sets uses \`"sets": 3\`.

Unlogged ramp-up sets may be described in the heavy exercise's \`notes\` and must not be included in its numeric \`sets\` value. Listed warmup exercises must use \`countsTowardVolume: false\`.

Weekly volume targets (effective sets — primary × 1.0, secondary × 0.5, incidental × 0.25 — counting only exercises with \`countsTowardVolume: true\`):
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

IMPORTANT: incidental muscles (e.g. "core" on almost every compound, "forearms" on most pulling, "shoulders" on everything) accumulate quickly across many exercises. Tag incidental sparingly — only when the incidental recruitment is genuinely meaningful. "Core" should NOT be incidental on every exercise.

The weekly volume ranges are default programming guardrails, not mandatory targets for every muscle.

Prioritized hypertrophy muscles should generally fall within their productive ranges. Maintenance muscles may fall below them.

When the athlete explicitly requests specialization above a preferred range, preserve the decision when the recovery and session tradeoffs remain plausible. Acknowledge the tradeoff during conversation rather than automatically reducing the requested volume.

Hard limits are strong caution thresholds, not automatic reasons to reject an explicit athlete request.

Exclude exercises with \`countsTowardVolume: false\` from working-set, weekly muscle-volume, direct-muscle-set, movement-balance, and periodization calculations.

Do not classify an athlete-requested and acknowledged specialization as an audit failure merely because it departs from a preferred range.`;

  const multiWeekInstructions = `## Multi-week programs
For programs longer than one week:
- Set \`weeks\` to the total number of weeks (integer).
- \`days\` is the base weekly template — the repeating pattern followed by most weeks.
- \`overrides\` lists only the weeks that deviate (e.g. deload week, peak week, test week). Weeks without an override automatically repeat the base template.
- Use \`variants\` (an optional array on any exercise) to swap or retune ONE exercise on specific weeks while the rest of the day stays on the base template — e.g. \`"variants": [{"weeks": [2], "name": "Stiff-Leg Deadlift"}]\`. Each variant lists the 1-based \`weeks\` it applies to; any field you omit (\`sets\`, \`reps\`, \`load\`, \`name\`, \`tags\`, …) is inherited from the base exercise. Supply \`tags\` on a variant only when the muscle emphasis changes. Reserve \`overrides\` for weeks whose STRUCTURE differs (deload, test week, added/removed exercises); do not use an override just to swap one movement.
- Omit \`weeks\` and \`overrides\` for single-week programs.`;

  const programRequirements = `## Program requirements
Every routine you emit must include:
- State progression as a scoped list in the top-level \`progression\` field — one entry per movement class (e.g. primary barbell lifts, hypertrophy accessories, kettlebell/skill practice), each with \`applies\` (the class it governs) and \`rule\` (stated numerically, e.g. double progression: "when all sets reach the top of the rep range at ≤1 RIR, add 2.5–5% load and reset to the bottom", or a defined weekly load step). Scope each rule to the class it governs — do not apply one progression model to every exercise, and do not bury the rule in exercise notes. Exercise-specific tweaks may still go in that exercise's \`notes\`.
- For multi-week programs, include periodization with a planned deload — organize the mesocycle (accumulate volume/intensity across weeks, then a deload week at approximately 50% of normal working-set volume), expressed via \`weeks\` + \`overrides\`. Single-week routines are permitted only when the athlete explicitly requests a single standalone week.
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

Do not declare the program ready for export until you have stated the required programming decisions and completed the self-audit — in prose, in the conversation:
- Stated your key programming decisions: weekly volume per muscle group, intensity scheme (RIR/RPE or %1RM), the progression rule, and the deload plan.
- Run a quick self-audit and fixed any issues — is per-muscle weekly volume within the ranges below? Is the week balanced across movement patterns (push/pull, all major patterns)? Does every session include a warmup? Does every exercise respect the athlete's equipment and injuries?

When the athlete types \`GENERATE IT\` (exactly those words, all caps), switch to emit-only mode for that single response and output the routine JSON described below — and nothing else. Keep all reasoning, rationale, and audit notes in the conversation; the JSON itself carries only the program.

After emitting, return to conversational coaching for any follow-up. If the athlete asks for changes, discuss them in prose until they type \`GENERATE IT\` again.

At the end of every conversational message, append one line: \`Say GENERATE IT (all caps) when you're ready for the final routine.\``;

  return [
    conversationMode,
    "## Routine JSON schema (used only when emitting after GENERATE IT)",
    "You MUST use the exact field names shown below. Do not rename or restructure the hierarchy.",
    "  - Top level: `title`, `days`, and optionally `weeks` + `overrides` + `progression`",
    "  - Each day: `day` (number), `title`, `sections`",
    "  - Each section: `name`, `type`, `groups`",
    "  - Each group: `type`, `exercises`",
    "  - Each exercise: `name`, `sets`, `reps`, `countsTowardVolume`, `tags`, and optionally `load`, `rest`, `notes`, `variants`",
    `Valid section types: warmup, explosive, strength, power, hypertrophy, accessory, metcon, cardio, conditioning, rehab, mobility, cooldown, training`,
    `Valid group types: single, superset, circuit, giant-set`,
    exerciseSchemaNotes,
    multiWeekInstructions,
    constraints,
    "Structural skeleton (all real content should replace the placeholder strings):",
    JSON.stringify(skeleton, null, 2),
    overrideInstructions,
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
    "- Preserve any `variants` arrays exactly as in the schema — they encode week-specific single-exercise swaps.",
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
