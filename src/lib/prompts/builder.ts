import type { RecoveryReason } from "@/lib/import/sanitizeJson";

export function buildRequiredContract(): string {
  const example = {
    title: "Program Name",
    weeks: 8,
    progression: [{ applies: "Movement class", rule: "Add load when all sets reach the top of the rep range." }],
    days: [{ day: 1, title: "Day Name", sections: [{ name: "Strength", type: "strength", groups: [{ type: "single", exercises: [{ name: "Exercise", sets: 3, reps: "5-8", load: "100", unit: "lb", rest: "2 min", tempo: "3-1-1", notes: "Stop with two reps in reserve.", countsTowardVolume: true, tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] }, variants: [{ weeks: [2, 4], name: "Variation", sets: 3, reps: "5-8", load: "95 lb" }] }] }] }] }],
    overrides: [{ scope: "week", weekNumber: 4, reason: "Changed day structure", days: [{ day: 1, title: "Day Name", sections: [{ name: "Strength", type: "strength", groups: [{ type: "single", exercises: [{ name: "Exercise", sets: 3, reps: "5-8", countsTowardVolume: true, tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] } }] }] }] }] }],
  };

  return [
    "## Routine JSON contract",
    "When you provide a final routine, return one JSON object with no fences or commentary. Discussion and questions are fine before the final routine. Use the field names and hierarchy in this example; use straight ASCII quotes.",
    "Plan no more than 8 weeks. `days` is the repeating weekly template. Use sparse `variants` for exercise-level changes and sparse `overrides` with complete replacement days for structural changes; omit unchanged weeks.",
    "Within each superset, every exercise must have the same effective set count. Do not impose this rule on circuits or giant-sets. Valid section types: warmup, explosive, strength, power, hypertrophy, accessory, metcon, cardio, conditioning, rehab, mobility, cooldown, training. Valid group types: single, superset, circuit, giant-set.",
    "Every exercise needs `name`, numeric `sets`, `reps`, `countsTowardVolume` and muscle `tags` (primary, secondary, incidental, modifiers). `load`, `unit`, `rest`, `tempo`, and `notes` are optional. Mark productive work true; ordinary warmup, mobility, rehab, cooldown, and low-fatigue practice false. `sets` is the number of logged sets.",
    "Variants can change the exercise name or its `sets`, `reps`, and `load`; use `weeks` to list only affected weeks. Include progression rules scoped to movement classes. Respect goals, equipment, injuries, schedule, and explicit constraints.",
    JSON.stringify(example),
    "The example is illustrative; replace its values with the requested routine.",
  ].join("\n\n");
}

export function buildPersonaSynthesis(personas: readonly { name: string; text: string }[]): string {
  const synthesisBlock = personas.length > 1
    ? "## Multi-Coach Synthesis\nUse each coach's methods where they fit and keep their contributions distinct. Explain material tradeoffs. Resolve conflicts with explicit rules that follow the athlete's stated priorities."
    : "";
  const precedenceBlock = personas.length > 0
    ? "Coach personas are advisory methodologies. Athlete constraints, explicit goals, injuries, session limits, output rules, and the synthesized plan override any absolute statement inside an individual coach persona."
    : "";
  const personaBlocks = personas.map(({ name, text }) => `## Coach: ${name}\n${text}`);
  return assemblePrompt([synthesisBlock, precedenceBlock, ...personaBlocks]);
}

export function buildSchemaBlock(): string {
  return buildRequiredContract();
}

export function buildCoachingBlock(): string {
  return [
    "## Optional coaching",
    "Default to conversational coaching. Ask focused questions when goals, experience, equipment, schedule, injuries, or preferences are unclear. Explain choices and tradeoffs in plain language; do not turn every answer into a program.",
    "When programming, build around the athlete's stated goal, training age, available days, time, equipment, and recovery. Choose exercises they can perform safely and consistently. Give each movement an appropriate role and count only productive work toward volume.",
    "Set weekly volume and frequency by muscle group and training experience. Distribute hard sets across sessions, leave room to recover, and avoid changing several major variables at once. Use practical rep ranges, rest periods, and progression methods suited to the exercise and goal.",
    "Progress gradually. Prefer adding reps within a range before adding load when that fits the lift; increase load in small steps while keeping technique and effort appropriate. State what counts as a successful progression and what to do when targets are missed.",
    "Use deloads when fatigue, performance, or the planned block calls for them. Reduce stress deliberately, usually by reducing sets, load, or both, while keeping movement practice. Explain the reason and how normal training resumes.",
    "Before presenting a routine, self-audit it for schedule fit, progression, recovery, muscle coverage, equipment, injury constraints, realistic session length, and internal consistency. Check that every superset has equal effective set counts, that volume roles are accurate, and that weekly changes match their intended weeks.",
    "When a final routine is requested, follow the required JSON contract exactly. Keep coaching discussion outside the JSON and never put comments or markdown fences inside it.",
  ].join("\n\n");
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
