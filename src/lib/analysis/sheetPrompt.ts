import type { DisplayAnalysis } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS, SESSION_LIMITS, BALANCE_TARGETS } from "./thresholds";
import { MUSCLE_LABEL } from "./toDisplayAnalysis";
import { GOAL_LABELS } from "@/lib/programs/routineMeta";
import type { ProgressionRule } from "@/lib/programs/types";

export const SHEET_PROMPT_GRID_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["Volume landmarks", `${ALL_MUSCLE_GROUPS.length} muscle groups · MV/MEV/MAV/MRV`],
  ["Session limits", "Exercise count · set count · duration"],
  ["Balance targets", "Push:pull · upper:lower · quad:ham"],
  ["Pattern coverage", "6 movement patterns"],
  ["Computed scores", "For LLM to validate / dispute"],
  ["Requested output", "Verdict · corrections · top changes"],
];

function landmarkTable(): string {
  const header =
    "| Muscle | MV | MEV | MAV-Lo | MAV-Hi | MRV |\n|---|---|---|---|---|---|";
  const rows = ALL_MUSCLE_GROUPS.map((m) => {
    const lm = VOLUME_LANDMARKS[m];
    const label = MUSCLE_LABEL[m] ?? m;
    return `| ${label} | ${lm.mv} | ${lm.mev} | ${lm.mavLow} | ${lm.mavHigh} | ${lm.mrv} |`;
  });
  return [header, ...rows].join("\n");
}

export function buildSheetPrompt(analysis: DisplayAnalysis, programTitle: string, progression?: ProgressionRule[]): string {
  const s = SESSION_LIMITS;
  const bt = BALANCE_TARGETS;
  const infoNotes = analysis.warnings.filter((w) => w.severity === "info");
  const progressionSection = progression && progression.length > 0
    ? `\n## Intended progression scheme\n${progression.map((p) => `- ${p.applies}: ${p.rule}`).join("\n")}\n`
    : "";
  return `# Workout Routine Analysis: ${programTitle}

You are an evidence-based strength coach. Analyze this routine using the reference data below. The user's goal for this routine is **${GOAL_LABELS[analysis.goalScope.goal]}**. Judge it by that goal's standards. If the routine's content clearly doesn't fit this goal, say so before grading. The reference values below are calibrated for general/hypertrophy training${analysis.goalScope.partial ? " — dimensions outside this goal's scope are shown for reference and were excluded from the computed grade" : ""}.

## Working-volume semantics
Each exercise carries a \`countsTowardVolume\` boolean. \`true\` marks productive working strength/hypertrophy/conditioning/explosive volume; \`false\` marks ordinary warmups, activation drills, mobility work, cooldowns, rehab/prehab work, and low-fatigue practice.

Exclude exercises with \`countsTowardVolume: false\` from working-set, weekly muscle-volume, direct-muscle-set, movement-balance, and periodization calculations below — that excluded work still counts toward total exercise count and session duration.

Within each muscle-tag tier (primary, secondary, incidental), a canonical muscle is counted once at its largest applicable factor; a "full body" tag and an explicitly tagged muscle in the same tier take the larger of the two rather than stacking. Contributions across tiers (primary + secondary + incidental) remain additive.

The weekly volume ranges below are advisory default guardrails, not mandatory targets — deliberate, acknowledged athlete specialization above a preferred range is not automatically a fault.
${progressionSection}
## Reference: Volume Landmarks (effective sets/muscle/week)
${landmarkTable()}

Volume counting: primary muscles = 1.0 set, secondary = 0.5, incidental = 0.25; "full body" tags credit each covered muscle at half weight.

## Reference: Session Constraints
- ${s.exercises.greenMin}–${s.exercises.greenMax} exercises per session (${s.exercises.yellowMax + 1}+ excessive) — includes all warmup, mobility, conditioning, and cooldown work
- Preferred working-set range: ${s.totalSets.greenMin}-${s.totalSets.greenMax} — only exercises with \`countsTowardVolume: true\` count toward this
- Max ~${s.setsPerMuscle.greenMax} direct working sets per muscle per session, unless the athlete deliberately requests specialization
- Duration ≈ (total sets × 3) + 10 minutes, including all programmed work; ${s.durationMinutes.greenMin}–${s.durationMinutes.greenMax} min preferred

## Reference: Balance Targets (set-count ratios — volume-balance nudges, not injury metrics)
- Push:Pull ${bt.pushPull.idealMin}–${bt.pushPull.idealMax} (flag above ${bt.pushPull.warnMax})
- Upper:Lower ${bt.upperLower.idealMin}–${bt.upperLower.idealMax}
- Quad:Ham ${bt.quadHam.idealMin}–${bt.quadHam.idealMax}
- Chest:Back ${bt.chestBack.idealMin}–${bt.chestBack.idealMax}
- 6 movement patterns: horizontal/vertical push, horizontal/vertical pull, hinge, squat

## Computed Scores (validate or dispute)
${analysis.dimensions.map((d) => `- ${d.label}: ${d.grade} (${d.score}/100) — ${d.note}${d.graded ? "" : " [reference only — excluded from the grade for this goal]"}`).join("\n")}
${infoNotes.length ? `\n## Engine notes (weigh these before trusting the stated goal)\n${infoNotes.map((n) => `- ${n.msg}`).join("\n")}\n` : ""}
## Muscle Volumes
${analysis.muscles.map((m) => `- ${m.group}: ${m.sets} eff. sets (MEV ${m.mev}, MAV ${m.mavLo}–${m.mavHi}, MRV ${m.mrv}) [${m.status}]`).join("\n")}

## Balance Ratios
${analysis.ratios.map((r) => `- ${r.label}: ${r.value} (target ${r.target}) [${r.verdict}]`).join("\n")}

## Sessions
${analysis.sessions.map((sn) => `- ${sn.day}: ${sn.exercises} exercises. Total prescribed sets: ${sn.sets} / Working sets: ${sn.workingSets}, ~${sn.durationMin} min [${sn.status}]`).join("\n")}

## What to return
Plain markdown — this app does not ingest a machine-readable response:
1. **Verdict** — 2–3 sentences on overall quality for the stated goal.
2. **Corrections** — where you disagree with the computed scores above, and why.
3. **Top changes** — up to 5, prioritized, each with the specific edit and rationale.
4. **What's already good** — brief.`;
}
