import type { ProgramDay } from "@/lib/programs/types";
import type { BalanceResult, MuscleGroup, Warning } from "./types";
import { BALANCE_TARGETS, CORE_MOVEMENT_PATTERNS } from "./thresholds";
import {
  mapMuscleExpanded,
  getEffectiveSets,
  lookupCatalogExercise,
  classifyMovement,
  detectMovementPatterns,
} from "./muscles";

export function analyzeBalance(days: ProgramDay[]): BalanceResult {
  let pushSets = 0;
  let pullSets = 0;
  let legSets = 0;
  let upperSets = 0;
  let lowerSets = 0;
  let quadSets = 0;
  let hamSets = 0;
  let chestSets = 0;
  let backSets = 0;
  const patternsFound = new Set<string>();
  const warnings: Warning[] = [];

  const upper: MuscleGroup[] = [
    "chest", "lats", "upper_back", "lower_back",
    "front_delts", "side_delts", "rear_delts",
    "biceps", "triceps", "forearms",
  ];
  const lower: MuscleGroup[] = [
    "quads", "hamstrings", "glutes", "calves", "adductors", "abductors",
  ];

  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const sets = getEffectiveSets(exercise);
          const catalogItem = lookupCatalogExercise(exercise);
          const category = classifyMovement(catalogItem);

          if (category === "push") pushSets += sets;
          if (category === "pull") pullSets += sets;
          if (category === "legs") legSets += sets;

          // C10: dedup per-exercise so multiple primary muscles mapping to the
          // same bucket don't double-count sets. mapMuscleExpanded handles "full body"
          // by expanding it to multiple canonical muscles.
          const creditedBuckets = new Set<string>();
          for (const label of exercise.tags.primary) {
            const muscles = mapMuscleExpanded(label);
            for (const muscle of muscles) {
              if (upper.includes(muscle) && !creditedBuckets.has("upper")) {
                upperSets += sets;
                creditedBuckets.add("upper");
              }
              if (lower.includes(muscle) && !creditedBuckets.has("lower")) {
                lowerSets += sets;
                creditedBuckets.add("lower");
              }
              if (muscle === "quads" && !creditedBuckets.has("quads")) {
                quadSets += sets;
                creditedBuckets.add("quads");
              }
              if (muscle === "hamstrings" && !creditedBuckets.has("hamstrings")) {
                hamSets += sets;
                creditedBuckets.add("hamstrings");
              }
              if (muscle === "chest" && !creditedBuckets.has("chest")) {
                chestSets += sets;
                creditedBuckets.add("chest");
              }
              if ((muscle === "lats" || muscle === "upper_back") && !creditedBuckets.has("back")) {
                backSets += sets;
                creditedBuckets.add("back");
              }
            }
          }

          for (const pattern of detectMovementPatterns(catalogItem, exercise)) {
            patternsFound.add(pattern);
          }
        }
      }
    }
  }

  const pushPullRatio =
    pullSets > 0 ? pushSets / pullSets : pushSets > 0 ? Infinity : null;
  const upperLowerRatio =
    lowerSets > 0 ? upperSets / lowerSets : upperSets > 0 ? Infinity : null;
  const quadHamRatio =
    hamSets > 0 ? quadSets / hamSets : quadSets > 0 ? Infinity : null;
  const chestBackRatio =
    backSets > 0 ? chestSets / backSets : chestSets > 0 ? Infinity : null;

  const bt = BALANCE_TARGETS;

  if (pushPullRatio !== null && pushPullRatio > bt.pushPull.warnMax) {
    warnings.push({
      severity: "red",
      dimension: "balance",
      message: `Push:Pull ratio is ${pushPullRatio.toFixed(1)}:1 — significantly push-dominant (target: ≤1:1)`,
    });
  } else if (pushPullRatio !== null && pushPullRatio > bt.pushPull.idealMax) {
    warnings.push({
      severity: "yellow",
      dimension: "balance",
      message: `Push:Pull ratio is ${pushPullRatio.toFixed(1)}:1 — slightly push-dominant`,
    });
  }

  if (upperLowerRatio !== null && upperLowerRatio > bt.upperLower.warnMax) {
    warnings.push({
      severity: "red",
      dimension: "balance",
      message: `Upper:Lower ratio is ${upperLowerRatio.toFixed(1)}:1 — lower body significantly undertrained`,
    });
  } else if (upperLowerRatio !== null && upperLowerRatio > bt.upperLower.idealMax) {
    warnings.push({
      severity: "yellow",
      dimension: "balance",
      message: `Upper:Lower ratio is ${upperLowerRatio.toFixed(1)}:1 — upper-dominant`,
    });
  }

  if (lowerSets === 0 && upperSets > 0) {
    warnings.push({
      severity: "red",
      dimension: "balance",
      message: "No lower body training detected",
    });
  }

  if (quadHamRatio !== null && quadHamRatio > bt.quadHam.warnMax) {
    warnings.push({
      severity: "yellow",
      dimension: "balance",
      message: `Quad:Hamstring ratio is ${quadHamRatio.toFixed(1)}:1 — consider more hamstring work`,
    });
  }

  if (chestBackRatio !== null && chestBackRatio > bt.chestBack.warnMax) {
    warnings.push({
      severity: "yellow",
      dimension: "balance",
      message: `Chest:Back ratio is ${chestBackRatio.toFixed(1)}:1 — consider more back work`,
    });
  }

  const allPatterns = CORE_MOVEMENT_PATTERNS as readonly string[];
  const movementPatternsCovered = allPatterns.filter((p) => patternsFound.has(p));
  const movementPatternsMissing = allPatterns.filter((p) => !patternsFound.has(p));

  return {
    pushPullRatio,
    upperLowerRatio,
    quadHamRatio,
    chestBackRatio,
    movementPatternsCovered,
    movementPatternsMissing,
    warnings,
  };
}
