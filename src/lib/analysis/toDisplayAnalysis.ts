import type {
  AnalysisResult, DisplayAnalysis, DimensionDisplay,
  MuscleDisplay, RatioDisplay, SessionDisplay, FindingDisplay,
} from "./types";
import { BALANCE_TARGETS } from "./thresholds";

const STATUS_COLOR: Record<string, "good" | "warn" | "bad"> = {
  green: "good", yellow: "warn", red: "bad",
};

const DIM_STATUS = (score: number): "good" | "warn" | "bad" =>
  score >= 80 ? "good" : score >= 60 ? "warn" : "bad";

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest", lats: "Lats", upper_back: "Back (upper)", lower_back: "Lower back",
  front_delts: "Front delts", side_delts: "Side delts", rear_delts: "Rear delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
  core: "Core", adductors: "Adductors", abductors: "Abductors",
  rotator_cuff: "Rotator cuff", neck: "Neck",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRatio(n: number | null): string {
  if (n === null) return "—";
  if (isNaN(n)) return "—";
  if (!isFinite(n)) return "∞ : 1";
  return `${n.toFixed(2)} : 1`;
}

function ratioVerdict(
  n: number | null,
  targets: { idealMin: number; idealMax: number; warnMax: number },
): "good" | "warn" | "bad" {
  if (n === null) return "good";
  if (n >= targets.idealMin && n <= targets.idealMax) return "good";
  if (n <= targets.warnMax) return "warn";
  return "bad";
}

export function toDisplayAnalysis(result: AnalysisResult, durationMs: number): DisplayAnalysis {
  const dims = result.dimensions;
  const b = result.balance;

  const dimNotes: Record<string, string> = {
    volume: `${result.muscleVolumes.filter((m) => m.severity === "green").length} of ${result.muscleVolumes.length} muscles in MAV range`,
    session: result.sessions.length > 0
      ? `Sessions ${Math.min(...result.sessions.map((s) => s.estimatedMinutes))}–${Math.max(...result.sessions.map((s) => s.estimatedMinutes))} min`
      : "No sessions",
    balance: `Push:pull ${b.pushPullRatio?.toFixed(2) ?? "—"}:1`,
    periodization: result.periodization.deloadDetected ? "Deload week detected" : "No deload week present",
  };

  const dimensions: DimensionDisplay[] = [
    { id: "volume",        label: "Volume",        score: dims.volume.score,        grade: dims.volume.grade,        status: DIM_STATUS(dims.volume.score),        note: dimNotes.volume },
    { id: "balance",       label: "Balance",       score: dims.balance.score,       grade: dims.balance.grade,       status: DIM_STATUS(dims.balance.score),       note: dimNotes.balance },
    { id: "structure",     label: "Structure",     score: dims.session.score,       grade: dims.session.grade,       status: DIM_STATUS(dims.session.score),       note: dimNotes.session },
    { id: "periodization", label: "Periodization", score: dims.periodization.score, grade: dims.periodization.grade, status: DIM_STATUS(dims.periodization.score), note: dimNotes.periodization },
  ];

  const muscles: MuscleDisplay[] = result.muscleVolumes.map((mv): MuscleDisplay => ({
    group: MUSCLE_LABEL[mv.muscle] ?? capitalize(mv.muscle.replace(/_/g, " ")),
    sets: mv.effectiveSets,
    mev: mv.landmarks.mev,
    mavLo: mv.landmarks.mavLow,
    mavHi: mv.landmarks.mavHigh,
    mrv: mv.landmarks.mrv,
    status: mv.severity,
    flag: mv.effectiveSets > mv.landmarks.mrv ? "above_mrv"
        : mv.effectiveSets < mv.landmarks.mev ? "below_mev"
        : undefined,
  }));

  const bt = BALANCE_TARGETS;
  const ratios: RatioDisplay[] = [
    {
      id: "push_pull", label: "Push : Pull",
      value: formatRatio(b.pushPullRatio),
      verdict: ratioVerdict(b.pushPullRatio, bt.pushPull),
      target: "0.67–1.0",
      detail: b.pushPullRatio !== null && b.pushPullRatio > bt.pushPull.idealMax
        ? "Slightly push-dominant. Add 2–3 sets of horizontal pull." : undefined,
    },
    {
      id: "upper_lower", label: "Upper : Lower",
      value: formatRatio(b.upperLowerRatio),
      verdict: ratioVerdict(b.upperLowerRatio, bt.upperLower),
      target: "0.8–1.2",
    },
    {
      id: "quad_ham", label: "Quad : Ham",
      value: formatRatio(b.quadHamRatio),
      verdict: ratioVerdict(b.quadHamRatio, bt.quadHam),
      target: "1.0–1.67",
    },
    {
      id: "chest_back", label: "Chest : Back",
      value: formatRatio(b.chestBackRatio),
      verdict: ratioVerdict(b.chestBackRatio, bt.chestBack),
      target: "0.67–1.0",
      detail: b.chestBackRatio !== null && b.chestBackRatio < bt.chestBack.idealMin
        ? "Back-emphasized — healthy for shoulder integrity." : undefined,
    },
  ];

  const sessions: SessionDisplay[] = result.sessions.map((s): SessionDisplay => ({
    day: s.dayTitle,
    exercises: s.exerciseCount,
    sets: s.totalSets,
    durationMin: s.estimatedMinutes,
    status: s.warnings.length === 0 ? "good" : "warn",
    flag: s.warnings[0]?.message,
  }));

  const warnings: FindingDisplay[] = result.warnings.map((w): FindingDisplay => ({
    severity: STATUS_COLOR[w.severity] ?? "good",
    area: w.dimension,
    msg: w.message,
  }));

  return {
    durationMs,
    overall: { score: result.overall.score, grade: result.overall.grade },
    fingerprint: {
      primary: `${result.sessions.length}d/wk`,
      secondary: null,
      label: `${result.sessions.length}-day program`,
    },
    dimensions,
    muscles,
    ratios,
    patterns: {
      covered: b.movementPatternsCovered,
      missing: b.movementPatternsMissing,
    },
    sessions,
    warnings,
    strengths: [],
  };
}
