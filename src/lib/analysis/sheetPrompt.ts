import type { DisplayAnalysis } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS, SESSION_LIMITS, BALANCE_TARGETS } from "./thresholds";
import { MUSCLE_LABEL } from "./toDisplayAnalysis";
import { GOAL_LABELS } from "@/lib/programs/routineMeta";

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

export function buildSheetPrompt(analysis: DisplayAnalysis, programTitle: string): string {
  const s = SESSION_LIMITS;
  const bt = BALANCE_TARGETS;
  return `# Workout Routine Analysis: ${programTitle}

You are an evidence-based strength coach. Analyze this routine using the reference data below. The user's goal for this routine is **${GOAL_LABELS[analysis.goalScope.goal]}**. Judge it by that goal's standards. The reference values below are calibrated for general/hypertrophy training${analysis.goalScope.partial ? " — dimensions outside this goal's scope are shown for reference and were excluded from the computed grade" : ""}.

## Reference: Volume Landmarks (effective sets/muscle/week)
${landmarkTable()}

Volume counting: primary muscles = 1.0 set, secondary = 0.5, incidental = 0.25; "full body" tags credit each covered muscle at half weight.

## Reference: Session Constraints
- ${s.exercises.greenMin}–${s.exercises.greenMax} exercises per session (${s.exercises.yellowMax + 1}+ excessive)
- ${s.totalSets.greenMin}–${s.totalSets.greenMax} productive sets per session
- Max ~${s.setsPerMuscle.greenMax} direct sets per muscle per session
- Duration ≈ (sets × 3) + 10 minutes; ${s.durationMinutes.greenMin}–${s.durationMinutes.greenMax} min preferred

## Reference: Balance Targets (set-count ratios — volume-balance nudges, not injury metrics)
- Push:Pull ${bt.pushPull.idealMin}–${bt.pushPull.idealMax} (flag above ${bt.pushPull.warnMax})
- Upper:Lower ${bt.upperLower.idealMin}–${bt.upperLower.idealMax}
- Quad:Ham ${bt.quadHam.idealMin}–${bt.quadHam.idealMax}
- Chest:Back ${bt.chestBack.idealMin}–${bt.chestBack.idealMax}
- 6 movement patterns: horizontal/vertical push, horizontal/vertical pull, hinge, squat

## Computed Scores (validate or dispute)
${analysis.dimensions.map((d) => `- ${d.label}: ${d.grade} (${d.score}/100) — ${d.note}`).join("\n")}

## Muscle Volumes
${analysis.muscles.map((m) => `- ${m.group}: ${m.sets} eff. sets (MEV ${m.mev}, MAV ${m.mavLo}–${m.mavHi}, MRV ${m.mrv}) [${m.status}]`).join("\n")}

## Balance Ratios
${analysis.ratios.map((r) => `- ${r.label}: ${r.value} (target ${r.target}) [${r.verdict}]`).join("\n")}

## Sessions
${analysis.sessions.map((sn) => `- ${sn.day}: ${sn.exercises} exercises, ${sn.sets} sets, ~${sn.durationMin} min [${sn.status}]`).join("\n")}

## What to return
Plain markdown — this app does not ingest a machine-readable response:
1. **Verdict** — 2–3 sentences on overall quality for the stated goal.
2. **Corrections** — where you disagree with the computed scores above, and why.
3. **Top changes** — up to 5, prioritized, each with the specific edit and rationale.
4. **What's already good** — brief.`;
}
