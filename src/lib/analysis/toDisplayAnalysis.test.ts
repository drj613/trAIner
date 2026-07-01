import { toDisplayAnalysis } from "./toDisplayAnalysis";
import type { AnalysisResult } from "./types";
import { imbalancedProgram, multiWeekProgram, startingStrengthProgram } from "./fixtures";
import { analyzeProgram } from "./analyze";

const makeResult = (): AnalysisResult => ({
  overall: { name: "Overall", score: 82, grade: "B" },
  dimensions: {
    volume:        { name: "Volume",        score: 91, grade: "A" },
    session:       { name: "Structure",     score: 88, grade: "A" },
    balance:       { name: "Balance",       score: 78, grade: "B" },
    periodization: { name: "Periodization", score: 65, grade: "C" },
  },
  muscleVolumes: [{
    muscle: "chest", effectiveSets: 6.5, severity: "green",
    label: "Chest",
    landmarks: { mv: 3, mev: 5, mavLow: 6, mavHigh: 16, mrv: 24 },
  }],
  sessions: [{
    dayId: "d1", dayTitle: "Mon · Upper A",
    exerciseCount: 7, totalSets: 22, estimatedMinutes: 56,
    muscleSetCounts: {},
    warnings: [],
  }],
  balance: {
    pushPullRatio: 1.18, upperLowerRatio: 1.05,
    quadHamRatio: 1.55, chestBackRatio: 0.46,
    movementPatternsCovered: ["horizontal_push", "squat"],
    movementPatternsMissing: ["hip_hinge"],
    warnings: [],
  },
  periodization: {
    weeksDetected: 4, volumePattern: "increasing",
    deloadDetected: false, warnings: [],
  },
  warnings: [{
    severity: "yellow", dimension: "volume",
    message: "Rear delts below MEV",
  }],
  goalScope: {
    goal: "general" as const,
    partial: false,
    gradedDimensions: ["volume", "session", "balance", "periodization"] as ("volume" | "session" | "balance" | "periodization")[],
  },
  notes: [],
});

describe("toDisplayAnalysis", () => {
  it("maps overall score", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.overall.score).toBe(82);
    expect(d.overall.grade).toBe("B");
  });

  it("maps fingerprint", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(typeof d.fingerprint.primary).toBe("string");
    expect(d.fingerprint.secondary).toBeNull();
  });

  it("produces 4 dimension entries", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.dimensions).toHaveLength(4);
    expect(d.dimensions[0].id).toBe("volume");
  });

  it("maps muscle volumes with display fields", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.muscles[0].group).toBe("Chest");
    expect(d.muscles[0].sets).toBe(6.5);
    expect(d.muscles[0].mev).toBe(5);
    expect(d.muscles[0].mavLo).toBe(6);
    expect(d.muscles[0].mavHi).toBe(16);
    expect(d.muscles[0].mrv).toBe(24);
    expect(d.muscles[0].status).toBe("green");
  });

  it("maps balance ratios", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    const pp = d.ratios.find((r) => r.id === "push_pull");
    expect(pp).toBeDefined();
    expect(pp!.value).toMatch(/1\.18/);
    expect(pp!.verdict).toBe("warn");
  });

  it("maps movement patterns", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.patterns.covered).toContain("horizontal_push");
    expect(d.patterns.missing).toContain("hip_hinge");
  });

  it("maps sessions", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.sessions[0].day).toBe("Mon · Upper A");
    expect(d.sessions[0].exercises).toBe(7);
    expect(d.sessions[0].durationMin).toBe(56);
  });

  it("maps warnings with display severity", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.warnings[0].severity).toBe("warn");
    expect(d.warnings[0].area).toBe("volume");
  });

  it("includes durationMs", () => {
    const d = toDisplayAnalysis(makeResult(), 184);
    expect(d.durationMs).toBe(184);
  });

  it("flags muscles above MRV as above_mrv and below MEV as below_mev", () => {
    const r = makeResult();
    // Patch in a muscle above MRV (mrv=24 for chest, so 25 sets)
    const aboveMrv = { muscle: "chest" as const, effectiveSets: 25, severity: "red" as const, label: "Excessive", landmarks: { mv: 3, mev: 5, mavLow: 6, mavHigh: 16, mrv: 24 } };
    // Below MEV (4 sets, mev=5)
    const belowMev = { muscle: "lats" as const, effectiveSets: 4, severity: "yellow" as const, label: "Below MEV", landmarks: { mv: 5, mev: 7, mavLow: 10, mavHigh: 20, mrv: 30 } };
    const result = { ...r, muscleVolumes: [aboveMrv, belowMev] };
    const d = toDisplayAnalysis(result, 0);
    expect(d.muscles[0].flag).toBe("above_mrv");
    expect(d.muscles[1].flag).toBe("below_mev");
  });

  it("marks zero-set muscles as 'untrained' (not red)", () => {
    const d = toDisplayAnalysis(analyzeProgram(imbalancedProgram), 0);
    const quads = d.muscles.find((m) => m.group === "Quads");
    expect(quads?.sets).toBe(0);
    expect(quads?.status).toBe("untrained");
    expect(quads?.flag).toBeUndefined();
  });

  it("volume note denominator counts only trained muscles", () => {
    const result = analyzeProgram(imbalancedProgram);
    const d = toDisplayAnalysis(result, 0);
    const trainedCount = result.muscleVolumes.filter((m) => m.effectiveSets > 0).length;
    const totalCount = result.muscleVolumes.length;
    expect(trainedCount).toBeLessThan(totalCount); // sanity: there ARE untrained muscles
    const volNote = d.dimensions.find((x) => x.id === "volume")?.note ?? "";
    expect(volNote).toContain(`of ${trainedCount} muscles`);
    expect(volNote).not.toContain(`of ${totalCount} muscles`);
  });

  it("fingerprint uses days per week, not total days across weeks", () => {
    // multiWeekProgram: 4 weeks × 1 day/week = 4 session entries, but 1 day/wk
    const d = toDisplayAnalysis(analyzeProgram(multiWeekProgram), 0);
    expect(d.fingerprint.primary).toBe("1d/wk");
    expect(d.fingerprint.label).toBe("1-day program");
  });

  it("fingerprint is unchanged for single-week programs", () => {
    const d = toDisplayAnalysis(analyzeProgram(imbalancedProgram), 0);
    expect(d.fingerprint.primary).toBe("2d/wk");
    expect(d.fingerprint.label).toBe("2-day program");
  });

  it("maps sessions with red warnings to 'bad' status", () => {
    const r = makeResult();
    const result = {
      ...r,
      sessions: [{
        ...r.sessions[0],
        warnings: [{ severity: "red" as const, dimension: "session", message: "too long" }],
      }],
    };
    const d = toDisplayAnalysis(result, 0);
    expect(d.sessions[0].status).toBe("bad");
  });

  it("flags the red warning message on bad sessions, not the first warning", () => {
    const r = makeResult();
    const result = {
      ...r,
      sessions: [{
        ...r.sessions[0],
        warnings: [
          { severity: "yellow" as const, dimension: "session", message: "9 exercises — on the high end" },
          { severity: "red" as const, dimension: "session", message: "32 total sets (recommended: 10-25)" },
        ],
      }],
    };
    const d = toDisplayAnalysis(result, 0);
    expect(d.sessions[0].status).toBe("bad");
    expect(d.sessions[0].flag).toBe("32 total sets (recommended: 10-25)");
  });

  it("threads goalScope and marks gated-out dimensions as not graded", () => {
    const program = { ...startingStrengthProgram, goal: "strength" as const };
    const d = toDisplayAnalysis(analyzeProgram(program), 0);
    expect(d.goalScope.goal).toBe("strength");
    expect(d.goalScope.partial).toBe(true);
    const byId = Object.fromEntries(d.dimensions.map((x) => [x.id, x.graded]));
    expect(byId).toEqual({ volume: false, balance: true, structure: true, periodization: false });
  });

  it("renders notes as info findings ahead of warnings", () => {
    const program = { ...startingStrengthProgram, goal: "strength" as const };
    const d = toDisplayAnalysis(analyzeProgram(program), 0);
    expect(d.warnings[0].severity).toBe("info");
    expect(d.warnings[0].area).toBe("goal");
    expect(d.warnings.some((w) => w.severity !== "info")).toBe(true);
  });

  it("full-scope programs mark every dimension graded", () => {
    const d = toDisplayAnalysis(analyzeProgram(imbalancedProgram), 0);
    expect(d.dimensions.every((x) => x.graded)).toBe(true);
    expect(d.goalScope.partial).toBe(false);
  });
});
