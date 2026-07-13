/**
 * Phase 12 — full working-volume integration coverage.
 *
 * Exercises analyzeProgram/the import pipeline end-to-end across everything
 * landed in phases 0-11: countsTowardVolume + resolveCountsTowardVolume
 * gating, gated volume/session/balance/periodization/coverage, within-tier
 * muscle dedup, total-vs-working session sets, base+override warning paths &
 * resolution, and override diagnostics.
 *
 * ONE mixed fixture (12.1/12.2) covers all 20 numbered assertions below; a
 * separate pure-mobility fixture (12.3) covers the "everything gated out"
 * edge case.
 */
import type {
  ProgramDocument,
  ProgramDay,
  ProgramExercise,
  ProgramGroup,
  ProgramSection,
  ProgramOverride,
  ImportWarning,
} from "@/lib/programs/types";
import { analyzeProgram } from "./analyze";
import { getRenderableDays } from "@/lib/programs/overrides";
import { countWeeklyVolume } from "./volume";
import { analyzeBalance } from "./balance";
import { heavySetShare } from "./periodization";
import {
  extractUnresolvedExercises,
  applyResolutions,
  type Resolution,
} from "@/lib/import/resolution";
import { baseExercisePath, overrideExercisePath } from "@/lib/import/paths";
import { diagnoseProgramOverrides } from "@/lib/programs/overrideDiagnostics";

// ---------------------------------------------------------------------------
// Local builder helpers (deliberately NOT sharing src/lib/analysis/fixtures.ts's
// `ex` helper — this fixture needs canonicalExerciseId/countsTowardVolume
// control per-exercise, which that helper doesn't expose).
// ---------------------------------------------------------------------------

type ExOpts = {
  canonicalExerciseId?: string;
  countsTowardVolume?: boolean;
};

function mkEx(
  id: string,
  name: string,
  sets: number,
  reps: string,
  primary: string[],
  secondary: string[] = [],
  incidental: string[] = [],
  opts: ExOpts = {},
): ProgramExercise {
  return {
    id,
    name,
    sets,
    reps,
    ...(opts.canonicalExerciseId !== undefined ? { canonicalExerciseId: opts.canonicalExerciseId } : {}),
    ...(opts.countsTowardVolume !== undefined ? { countsTowardVolume: opts.countsTowardVolume } : {}),
    tags: { primary, secondary, incidental, modifiers: [] },
  };
}

function mkGroup(id: string, ...exercises: ProgramExercise[]): ProgramGroup {
  return { id, type: "single", exercises };
}

function mkSection(
  id: string,
  type: ProgramSection["type"],
  name: string,
  ...groups: ProgramGroup[]
): ProgramSection {
  return { id, type, name, groups };
}

function mkDay(
  id: string,
  dayNumber: number,
  weekNumber: number,
  title: string,
  ...sections: ProgramSection[]
): ProgramDay {
  return { id, dayNumber, weekNumber, title, sections };
}

/** Clones `days` and force-sets countsTowardVolume on every exercise matching `name`. */
function forceExerciseCount(days: ProgramDay[], name: string, value: boolean): ProgramDay[] {
  return days.map((d) => ({
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        exercises: g.exercises.map((e) => (e.name === name ? { ...e, countsTowardVolume: value } : e)),
      })),
    })),
  }));
}

/** Recursively walks a value and fails if any number is NaN or non-finite. */
function assertNoNaNOrInfinity(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isNaN(value)).toBe(false);
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) assertNoNaNOrInfinity(v);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) assertNoNaNOrInfinity(v);
  }
}

// ---------------------------------------------------------------------------
// Mixed fixture — 4 weeks (weeks 1-3 progressive, week 4 real deload), days
// numbered 1, 3, 5.
//
// Non-volume (gated) sets are CONSTANT across all 4 weeks so that they don't
// themselves drop during the week-4 deload — this is what makes assertion 13
// ("warmup volume does not mask the deload") a real test rather than vacuous.
// ---------------------------------------------------------------------------

const MAIN_LIFT_SETS = [4, 5, 6, 2]; // weeks 1-4: progressive overload, then a real deload

function buildDay1(week: number): ProgramDay {
  const benchSets = MAIN_LIFT_SETS[week - 1];
  return mkDay(
    `d1-w${week}`,
    1,
    week,
    "Push Strength & Skills",
    // sections[0]: warmup — activation warmup, gated by section default (false)
    mkSection(
      `d1-w${week}-warmup`,
      "warmup",
      "Activation Warmup",
      mkGroup(`d1-w${week}-warmup-g`, mkEx(`d1-w${week}-rot`, "Band External Rotation", 3, "15", ["rotator cuff"])),
    ),
    // sections[1]: strength — groups[0] handstand (explicit non-volume, unmatched), groups[1] bench (working strength)
    mkSection(
      `d1-w${week}-strength`,
      "strength",
      "Push Strength",
      mkGroup(
        `d1-w${week}-handstand-g`,
        mkEx(`d1-w${week}-handstand`, "Handstand Hold Practice", 6, "20s hold", ["front delts"], [], [], {
          countsTowardVolume: false,
        }),
      ),
      mkGroup(`d1-w${week}-bench-g`, mkEx(`d1-w${week}-bench`, "Bench Press", benchSets, "6-8", ["chest", "front delts"], ["triceps"])),
    ),
    // sections[2]: hypertrophy — working accessory (also feeds the cross-tier-additive biceps test)
    mkSection(
      `d1-w${week}-hyp`,
      "hypertrophy",
      "Shoulder & Arm Accessory",
      mkGroup(`d1-w${week}-lat-g`, mkEx(`d1-w${week}-lat`, "Cable Lateral Raise", 3, "12-15", ["shoulders"])),
      mkGroup(`d1-w${week}-curl-g`, mkEx(`d1-w${week}-curl`, "Barbell Curl", 3, "10-12", ["biceps"])),
    ),
  );
}

function buildDay3(week: number): ProgramDay {
  const rowSets = MAIN_LIFT_SETS[week - 1];
  return mkDay(
    `d3-w${week}`,
    3,
    week,
    "Pull Strength & Conditioning",
    // sections[0]: mobility — gated by section default (false)
    mkSection(
      `d3-w${week}-mobility`,
      "mobility",
      "Mobility Prep",
      mkGroup(`d3-w${week}-hip-g`, mkEx(`d3-w${week}-hip`, "90/90 Hip Switch", 5, "8 each side", ["adductors"])),
    ),
    // sections[1]: strength — working pull
    mkSection(
      `d3-w${week}-strength`,
      "strength",
      "Pull Strength",
      mkGroup(`d3-w${week}-row-g`, mkEx(`d3-w${week}-row`, "Barbell Row", rowSets, "6-8", ["lats", "upper back"], ["biceps"])),
    ),
    // sections[2]: conditioning — working conditioning/metcon
    mkSection(
      `d3-w${week}-cond`,
      "conditioning",
      "Conditioning Finisher",
      mkGroup(`d3-w${week}-jump-g`, mkEx(`d3-w${week}-jump`, "Jump Rope Intervals", 4, "30s", ["calves"])),
    ),
  );
}

function buildDay5(week: number): ProgramDay {
  const rdlSets = MAIN_LIFT_SETS[week - 1];
  return mkDay(
    `d5-w${week}`,
    5,
    week,
    "Legs, Core & Full-Body",
    // sections[0]: strength — groups[0] low-rep ramp (explicit non-volume), groups[1] RDL (working strength)
    mkSection(
      `d5-w${week}-strength`,
      "strength",
      "Legs Strength",
      mkGroup(
        `d5-w${week}-ramp-g`,
        mkEx(`d5-w${week}-ramp`, "Deadlift Ramp Singles", 5, "1", [], [], [], { countsTowardVolume: false }),
      ),
      mkGroup(`d5-w${week}-rdl-g`, mkEx(`d5-w${week}-rdl`, "Romanian Deadlift", rdlSets, "8-10", ["hamstrings", "glutes"], ["lower back"])),
    ),
    // sections[1]: accessory — groups[0] duplicate-alias dedup test, groups[1] full-body+quadriceps test,
    // groups[2] unmatched base exercise (non-sequential day 5)
    mkSection(
      `d5-w${week}-acc`,
      "accessory",
      "Core & Full-Body Accessory",
      mkGroup(`d5-w${week}-crunch-g`, mkEx(`d5-w${week}-crunch`, "Cable Crunch", 4, "12-15", ["abs", "core"])),
      mkGroup(`d5-w${week}-goblet-g`, mkEx(`d5-w${week}-goblet`, "Goblet Squat Carry", 2, "10-12", ["full body", "quadriceps"])),
      mkGroup(`d5-w${week}-zercher-g`, mkEx(`d5-w${week}-zercher`, "Zercher Good Morning Iso Hold", 3, "8", ["lower back"])),
    ),
  );
}

const WEEKS = [1, 2, 3, 4];
const baseDays: ProgramDay[] = WEEKS.flatMap((w) => [buildDay1(w), buildDay3(w), buildDay5(w)]);

// Override #0 (real): partial Week-4 override replacing ONLY Day 3 — carries
// its own mobility section (so gated volume stays present in week 4, keeping
// the deload-masking test meaningful) plus an unmatched working exercise.
const landmineEx = mkEx("landmine-ex", "Landmine Press Variant", 3, "10", ["chest", "front delts"], ["triceps"]);
const overrideDay3Week4 = mkDay(
  "override-d3-w4",
  3,
  4,
  "Deload Push Variation",
  mkSection(
    "ov-d3-w4-mobility",
    "mobility",
    "Mobility Prep",
    mkGroup("ov-d3-w4-hip-g", mkEx("ov-d3-w4-hip", "90/90 Hip Switch", 5, "8 each side", ["adductors"])),
  ),
  mkSection("ov-d3-w4-strength", "strength", "Deload Push", mkGroup("ov-d3-w4-landmine-g", landmineEx)),
);
const override0: ProgramOverride = {
  id: "ov-0",
  scope: "week",
  programId: "mixed-fixture",
  weekNumber: 4,
  replacement: [overrideDay3Week4],
  createdAt: "2026-01-01T00:00:00.000Z",
};

// Override #1 (inert, reason-only): targets a week that doesn't exist in this
// routine and has no replacement content — diagnosable, but never applies.
const override1: ProgramOverride = {
  id: "ov-1",
  scope: "week",
  programId: "mixed-fixture",
  weekNumber: 99,
  replacement: [],
  reason: "Reserved placeholder for a possible future rehab week; not yet actionable.",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const handstandPath = baseExercisePath(1, 1, 0, 0);
const zercherPath = baseExercisePath(5, 1, 2, 0);
const landminePath = overrideExercisePath(0, 3, 1, 0, 0);

const importWarnings: ImportWarning[] = [
  {
    path: handstandPath,
    rawName: "Handstand Hold Practice",
    message: "Handstand Hold Practice was imported without a catalog match.",
    sectionType: "strength",
  },
  {
    path: zercherPath,
    rawName: "Zercher Good Morning Iso Hold",
    message: "Zercher Good Morning Iso Hold was imported without a catalog match.",
    sectionType: "accessory",
  },
  {
    path: landminePath,
    rawName: "Landmine Press Variant",
    message: "Landmine Press Variant was imported without a catalog match.",
    sectionType: "strength",
  },
];

const mixedProgram: ProgramDocument = {
  id: "mixed-fixture",
  title: "Mixed Integration Fixture",
  source: "import",
  active: true,
  days: baseDays,
  overrides: [override0, override1],
  import: { rawJson: {}, warnings: importWarnings },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const HANDSTAND_CANONICAL = "handstand-hold-practice-canonical";
const ZERCHER_CANONICAL = "good-morning-iso-canonical";
const LANDMINE_CANONICAL = "landmine-press-variant-canonical";

const allResolutions: Resolution[] = [
  { path: handstandPath, canonicalId: HANDSTAND_CANONICAL },
  { path: zercherPath, canonicalId: ZERCHER_CANONICAL },
  { path: landminePath, canonicalId: LANDMINE_CANONICAL },
];

// ---------------------------------------------------------------------------
// 12.2 — the 20 assertions
// ---------------------------------------------------------------------------

describe("Phase 12 — full working-volume integration (mixed fixture)", () => {
  describe("import warnings & resolution pipeline", () => {
    it("extractUnresolvedExercises finds exactly the 3 unresolved exercises before resolution", () => {
      const items = extractUnresolvedExercises(mixedProgram.import!.warnings);
      expect(items.map((i) => i.rawName).sort()).toEqual(
        ["Handstand Hold Practice", "Landmine Press Variant", "Zercher Good Morning Iso Hold"].sort(),
      );
    });

    it("1. explicit volume-role booleans survive the resolution patch and the render", () => {
      const patched = applyResolutions(mixedProgram, allResolutions);
      const week1Day1 = patched.days.find((d) => d.dayNumber === 1 && d.weekNumber === 1)!;
      const handstand = week1Day1.sections[1].groups[0].exercises[0];
      expect(handstand.canonicalExerciseId).toBe(HANDSTAND_CANONICAL);
      expect(handstand.countsTowardVolume).toBe(false);

      // A never-unmatched exercise's explicit boolean must also survive through to the rendered days.
      const rendered = getRenderableDays(patched);
      const week1Day5 = rendered.find((d) => d.dayNumber === 5 && d.weekNumber === 1)!;
      const ramp = week1Day5.sections[0].groups[0].exercises[0];
      expect(ramp.countsTowardVolume).toBe(false);
    });

    it("2. base warning path resolves to the day whose DECLARED dayNumber matches (5), not its array index", () => {
      const warning = mixedProgram.import!.warnings.find((w) => w.rawName === "Zercher Good Morning Iso Hold")!;
      const match = /^days\.(\d+)\.sections\.(\d+)\.groups\.(\d+)\.exercises\.(\d+)$/.exec(warning.path)!;
      const [, dayNumStr, sectionIdxStr, groupIdxStr, exIdxStr] = match;
      expect(Number(dayNumStr)).toBe(5); // day 5 sits at array index 2 within each week's 3 days — not "2" or "3"
      const day = mixedProgram.days.find((d) => d.dayNumber === Number(dayNumStr) && d.weekNumber === 1)!;
      const exercise = day.sections[Number(sectionIdxStr)].groups[Number(groupIdxStr)].exercises[Number(exIdxStr)];
      expect(exercise.name).toBe("Zercher Good Morning Iso Hold");
    });

    it("3. override warning path resolves to the DECLARED replacement day number (3), using the override index prefix", () => {
      const warning = mixedProgram.import!.warnings.find((w) => w.rawName === "Landmine Press Variant")!;
      const match = /^overrides\.(\d+)\.days\.(\d+)\.sections\.(\d+)\.groups\.(\d+)\.exercises\.(\d+)$/.exec(warning.path)!;
      const [, overrideIdxStr, dayNumStr, sectionIdxStr, groupIdxStr, exIdxStr] = match;
      expect(Number(overrideIdxStr)).toBe(0);
      expect(Number(dayNumStr)).toBe(3);
      const override = mixedProgram.overrides[Number(overrideIdxStr)];
      const replacementDays = Array.isArray(override.replacement) ? override.replacement : [override.replacement];
      const day = replacementDays.find((d) => d.dayNumber === Number(dayNumStr))!;
      const exercise = day.sections[Number(sectionIdxStr)].groups[Number(groupIdxStr)].exercises[Number(exIdxStr)];
      expect(exercise.name).toBe("Landmine Press Variant");
    });

    it("4. base resolution patches the intended non-sequential day (5) only, leaving day 1 untouched", () => {
      const partial = applyResolutions(mixedProgram, [{ path: zercherPath, canonicalId: ZERCHER_CANONICAL }]);
      for (const d of partial.days.filter((d) => d.dayNumber === 5)) {
        expect(d.sections[1].groups[2].exercises[0].canonicalExerciseId).toBe(ZERCHER_CANONICAL);
      }
      for (const d of partial.days.filter((d) => d.dayNumber === 1)) {
        expect(d.sections[1].groups[0].exercises[0].canonicalExerciseId).toBeUndefined();
      }
    });

    it("5. [override-week-matching watch point] override resolution patches the replacement exercise, which renders in week 4 day 3", () => {
      const patched = applyResolutions(mixedProgram, allResolutions);
      const rendered = getRenderableDays(patched);
      const week4Day3 = rendered.find((d) => d.weekNumber === 4 && d.dayNumber === 3)!;
      // Confirms the override actually applied (not a base-content no-op).
      expect(week4Day3.title).toBe("Deload Push Variation");
      const landmine = week4Day3.sections[1].groups[0].exercises[0];
      expect(landmine.name).toBe("Landmine Press Variant");
      expect(landmine.canonicalExerciseId).toBe(LANDMINE_CANONICAL);
    });

    it("6. successfully resolved warnings disappear from import.warnings", () => {
      const patched = applyResolutions(mixedProgram, allResolutions);
      expect(patched.import!.warnings).toHaveLength(0);
    });
  });

  describe("analysis over the resolved, rendered program", () => {
    const patched = applyResolutions(mixedProgram, allResolutions);
    const rendered = getRenderableDays(patched);
    const result = analyzeProgram(patched);

    it("7. warmup and mobility contribute zero effective working volume", () => {
      const rotatorCuff = result.muscleVolumes.find((m) => m.muscle === "rotator_cuff")!;
      const adductors = result.muscleVolumes.find((m) => m.muscle === "adductors")!;
      expect(rotatorCuff.effectiveSets).toBe(0); // only source is the gated warmup exercise
      expect(adductors.effectiveSets).toBe(0); // only source is the gated mobility exercise
    });

    it("8. warmup and mobility remain in total prescribed sets", () => {
      const week1Day1 = rendered.find((d) => d.weekNumber === 1 && d.dayNumber === 1)!;
      const session = result.sessions.find((s) => s.dayId === week1Day1.id)!;
      // warmup(3) + handstand(6) + bench(4) + lateral(3) + curl(3) = 19
      expect(session.totalSets).toBe(19);
    });

    it("9. warmup and mobility remain in estimated duration", () => {
      const week1Day1 = rendered.find((d) => d.weekNumber === 1 && d.dayNumber === 1)!;
      const session = result.sessions.find((s) => s.dayId === week1Day1.id)!;
      expect(session.estimatedMinutes).toBe(session.totalSets * 3 + 10);
      expect(session.estimatedMinutes).toBe(67);
    });

    it("10. warmup and mobility are absent from working sets", () => {
      const week1Day1 = rendered.find((d) => d.weekNumber === 1 && d.dayNumber === 1)!;
      const session = result.sessions.find((s) => s.dayId === week1Day1.id)!;
      // bench(4) + lateral(3) + curl(3) = 10 — excludes warmup(3) + handstand(6)
      expect(session.workingSets).toBe(10);
      expect(session.totalSets - session.workingSets).toBe(9);
    });

    it("11. balance ignores warmup/mobility sets (counterfactual: forcing mobility to count changes the ratio)", () => {
      const actual = analyzeBalance(rendered);
      const forced = analyzeBalance(forceExerciseCount(rendered, "90/90 Hip Switch", true));
      // Forcing the gated mobility exercise (adductors, a "lower" muscle) to count
      // strictly increases lowerSets, which strictly decreases upper:lower.
      expect(forced.upperLowerRatio).toBeLessThan(actual.upperLowerRatio!);
    });

    it("12. low-repetition ramp sets do not inflate heavy-set share (counterfactual: forcing them to count raises it)", () => {
      const actualShare = heavySetShare(rendered);
      const forcedShare = heavySetShare(forceExerciseCount(rendered, "Deadlift Ramp Singles", true));
      // Ramp sets are reps=1 with no explicit %1RM — classified heavy by the low-rep fallback if ever counted.
      expect(actualShare).toBeLessThan(forcedShare);
    });

    it("13. warmup/mobility volume does not mask the deload", () => {
      expect(result.periodization.deloadDetected).toBe(true);

      const totalsByWeek = new Map<number, number>();
      const workingByWeek = new Map<number, number>();
      rendered.forEach((d, i) => {
        const session = result.sessions[i];
        const wk = d.weekNumber!;
        totalsByWeek.set(wk, (totalsByWeek.get(wk) ?? 0) + session.totalSets);
        workingByWeek.set(wk, (workingByWeek.get(wk) ?? 0) + session.workingSets);
      });

      const maxRaw = Math.max(...totalsByWeek.values());
      const rawRatioLastWeek = totalsByWeek.get(4)! / maxRaw;
      // If the raw (warmup/mobility-inclusive) totals were used, week 4's drop would
      // look too small (>70% of peak) to register as a deload — it would be masked.
      expect(rawRatioLastWeek).toBeGreaterThan(0.7);

      const maxWorking = Math.max(...workingByWeek.values());
      const workingRatioLastWeek = workingByWeek.get(4)! / maxWorking;
      // The gated (working-only) totals correctly show the >=30% drop.
      expect(workingRatioLastWeek).toBeLessThanOrEqual(0.7);
    });

    it("14. conditioning work remains included in effective volume", () => {
      const calves = result.muscleVolumes.find((m) => m.muscle === "calves")!;
      // Jump Rope Intervals: 4 sets/week in weeks 1-3, 0 in week 4 (its conditioning
      // section is dropped by the override) → median of [4,4,4,0] = 4.
      expect(calves.effectiveSets).toBe(4);
    });

    it("15. duplicate muscle aliases within one exercise's tier count once, not summed", () => {
      const week1Volume = countWeeklyVolume(rendered, 1);
      // Cable Crunch ["abs","core"] dedups to max(1.0,1.0)=1.0 factor → 4*1.0=4,
      // plus Goblet Squat Carry's full-body expansion (2*0.5=1) → 5.
      // A dedup bug (summing both aliases) would instead give 4+4+1=9.
      expect(week1Volume.get("core")).toBe(5);
      expect(result.muscleVolumes.find((m) => m.muscle === "core")!.effectiveSets).toBe(5);
    });

    it("16. full body plus explicit quadriceps retains the larger within-tier contribution for quads", () => {
      const week1Volume = countWeeklyVolume(rendered, 1);
      // Goblet Squat Carry ["full body","quadriceps"]: quadriceps' direct 1.0 beats
      // full-body's expanded 0.5 for quads specifically → 2*1.0=2, not 2*0.5=1.
      expect(week1Volume.get("quads")).toBe(2);
      expect(result.muscleVolumes.find((m) => m.muscle === "quads")!.effectiveSets).toBe(2);
    });

    it("17. the same muscle across primary and secondary tiers of different exercises remains additive", () => {
      const week1Volume = countWeeklyVolume(rendered, 1);
      // Barbell Curl (primary biceps, 3*1.0=3) + Barbell Row (secondary biceps, 4*0.5=2) = 5.
      expect(week1Volume.get("biceps")).toBe(5);
    });

    it("18. inert override warnings appear", () => {
      const diagnostics = diagnoseProgramOverrides(patched);
      const week99Warnings = diagnostics.filter((w) => w.path === "overrides.ov-1");
      expect(week99Warnings.length).toBeGreaterThanOrEqual(2);
      expect(week99Warnings.some((w) => /does not match any week/.test(w.message))).toBe(true);
      expect(week99Warnings.some((w) => /no replacement days/.test(w.message))).toBe(true);
    });

    it("19. reason-only overrides do not alter rendered base weeks", () => {
      const withoutInertOverride: ProgramDocument = {
        ...patched,
        overrides: patched.overrides.filter((o) => o.id !== "ov-1"),
      };
      expect(getRenderableDays(patched)).toEqual(getRenderableDays(withoutInertOverride));
    });

    it("20. analysis is deterministic across repeated runs", () => {
      const first = analyzeProgram(patched);
      const second = analyzeProgram(patched);
      expect(second).toEqual(first);
    });
  });
});

// ---------------------------------------------------------------------------
// 12.3 — pure-mobility fixture (everything gated out)
// ---------------------------------------------------------------------------

function buildMobilityWeek(week: number): ProgramDay {
  return mkDay(
    `mob-w${week}`,
    1,
    week,
    "Mobility & Recovery",
    mkSection(
      `mob-w${week}-s`,
      "mobility",
      "Mobility Flow",
      mkGroup(`mob-w${week}-g1`, mkEx(`mob-w${week}-e1`, "Couch Stretch", 3, "60s each side", ["hip flexors"])),
      mkGroup(`mob-w${week}-g2`, mkEx(`mob-w${week}-e2`, "Thoracic Rotation", 2, "10 each side", ["upper back"])),
    ),
  );
}

const pureMobilityProgram: ProgramDocument = {
  id: "pure-mobility",
  title: "Pure Mobility Block",
  source: "manual",
  active: true,
  days: [1, 2, 3, 4].map(buildMobilityWeek),
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Phase 12.3 — pure-mobility fixture (all excluded)", () => {
  it("does not throw", () => {
    expect(() => analyzeProgram(pureMobilityProgram)).not.toThrow();
  });

  const rendered = getRenderableDays(pureMobilityProgram);
  const result = analyzeProgram(pureMobilityProgram);

  it("totalSets > 0 but workingSets = 0 for every session, with finite duration", () => {
    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) {
      expect(session.totalSets).toBeGreaterThan(0);
      expect(session.workingSets).toBe(0);
      expect(Number.isFinite(session.estimatedMinutes)).toBe(true);
    }
  });

  it("effective muscle volume is zero for every muscle", () => {
    expect(result.muscleVolumes.length).toBeGreaterThan(0);
    expect(result.muscleVolumes.every((m) => m.effectiveSets === 0)).toBe(true);
  });

  it("working push/pull and upper/lower ratios are null/empty", () => {
    expect(result.balance.pushPullRatio).toBeNull();
    expect(result.balance.upperLowerRatio).toBeNull();
  });

  it("working movement coverage is absent", () => {
    expect(result.balance.movementPatternsCovered).toHaveLength(0);
    expect(result.balance.movementPatternsMissing.length).toBeGreaterThan(0);
  });

  it("peakDetected and deloadDetected are both false", () => {
    expect(result.periodization.peakDetected).toBe(false);
    expect(result.periodization.deloadDetected).toBe(false);
  });

  it("heavy-set share is not falsely positive", () => {
    expect(heavySetShare(rendered)).toBe(0);
  });

  it("contains no NaN or Infinity anywhere in the result (deep-walked, not JSON.stringify — which silently turns both into null)", () => {
    assertNoNaNOrInfinity(result);
  });

  it("repeated analysis is identical (deterministic)", () => {
    const again = analyzeProgram(pureMobilityProgram);
    expect(again).toEqual(result);
  });
});
