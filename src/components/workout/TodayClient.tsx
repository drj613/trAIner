"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, CheckCircle, Download, History, Plus, Sparkles } from "lucide-react";
import { logRepo } from "@/lib/storage/logRepo";
import { trackWorkoutEvent } from "@/lib/analytics/analyticsSeam";
import { serialiseSets, hydrateFromLog } from "@/lib/workout/sessionState";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { SetCell, classifyCell } from "./SetCell";
import type { ProgramDocument, ProgramDay, ProgramSection } from "@/lib/programs/types";
import { buildInitialCells, updateCell, addSet, type CellMap } from "@/lib/workout/cellMap";
import { sectionKind } from "@/lib/workout/sectionKind";
import { aggregateExerciseHistory, type ExerciseSessionRow } from "@/lib/workout/historyUtils";
import { HistoryDrawer } from "./HistoryDrawer";
import { ModifyAiModal } from "./ModifyAiModal";
import { storePendingDiff } from "@/lib/workout/pendingDiff";
import { getRenderableDays } from "@/lib/programs/overrides";
import { ExerciseReplaceSheet } from "./ExerciseReplaceSheet";
import { swapExercise } from "@/lib/workout/exerciseSwap";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

function localDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function GroupRail({
  type,
  label,
  children,
}: {
  type: string;
  label?: string;
  children: React.ReactNode;
}) {
  if (type === "single") return <div>{children}</div>;
  const kindLabel =
    { superset: "SUPERSET", circuit: "CIRCUIT", "giant-set": "GIANT SET" }[type] ??
    type.toUpperCase();
  return (
    <div style={{ position: "relative", paddingLeft: 14, paddingTop: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.14em",
          color: "var(--fg-3)",
          textTransform: "uppercase",
          padding: "6px 10px 4px",
        }}
      >
        <span style={{ width: 8, height: 1, background: "var(--line-2)" }} />
        <span>
          {kindLabel}
          {label ? ` · ${label}` : ""}
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      {/* vertical bracket */}
      <div
        style={{
          position: "absolute",
          left: 6,
          top: 26,
          bottom: 12,
          width: 2,
          background: "var(--line-2)",
          borderRadius: 1,
        }}
      />
      <div>{children}</div>
    </div>
  );
}

function cellId(exId: string, i: number) {
  return `cell-${exId}-${i}`;
}

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
  onReplaceExercise,
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
  onOpenHistory: () => void;
  onReplaceExercise: () => void;
}) {
  const prescription = [
    exercise.sets ? `${exercise.sets}×` : "",
    exercise.reps ?? "",
    exercise.load ?? "",
    exercise.rest ? `rest ${exercise.rest}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg-1)",
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)", flex: 1 }}>
            {exercise.name}
          </span>
          <button
            className="btn ghost"
            onClick={onOpenHistory}
            style={{ padding: "3px 6px", flexShrink: 0 }}
            aria-label={`History for ${exercise.name}`}
            title="History"
            type="button"
          >
            <History size={13} aria-hidden />
          </button>
          <button
            className="btn ghost"
            onClick={onReplaceExercise}
            style={{ padding: "3px 6px", flexShrink: 0 }}
            aria-label={`Replace ${exercise.name} from catalogue`}
            title="Replace from catalogue"
            type="button"
          >
            <ArrowLeftRight size={13} aria-hidden />
          </button>
        </div>
        {prescription && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
            {prescription}
          </div>
        )}
        {exercise.notes && (
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              fontFamily: "var(--font-mono)",
              marginTop: 3,
            }}
          >
            <span style={{ color: "var(--fg-4)" }}>note</span>{" "}
            <span>{exercise.notes}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {cells.map((val, i) => {
          const prescribedStr = i === 0 ? [
            exercise.sets ? `${exercise.sets}×` : "",
            exercise.reps ?? "",
            exercise.load ?? "",
          ].filter(Boolean).join(" ") : "";
          return (
            <SetCell
              key={i}
              id={cellId(exercise.id, i)}
              value={val}
              prescribed={prescribedStr}
              onChange={(v) => onCellChange(i, v)}
              onNext={() => {
                const nextEl = document.getElementById(cellId(exercise.id, i + 1));
                if (nextEl) {
                  (nextEl as HTMLInputElement).focus();
                  (nextEl as HTMLInputElement).select();
                }
              }}
            />
          );
        })}
        <button
          className="cell empty"
          onClick={onAddSet}
          style={{
            minWidth: 28,
            width: 28,
            padding: 0,
            cursor: "pointer",
            color: "var(--fg-3)",
            border: "1px dashed var(--line)",
          }}
          title="Add set"
          aria-label="Add set"
        >
          <Plus size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
});

function SectionCard({
  section,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
  onReplaceExercise,
}: {
  section: ProgramSection;
  cells: CellMap;
  onCellChange: (exId: string, i: number, v: string) => void;
  onAddSet: (exId: string) => void;
  onOpenHistory: (exerciseName: string, exerciseId: string) => void;
  onReplaceExercise: (exerciseId: string) => void;
}) {
  const { cls, glyph } = sectionKind(section.type);
  return (
    <div
      className={cls}
      style={{
        borderLeft: "3px solid var(--sec)",
        marginBottom: 12,
        background: "var(--bg-1)",
        borderRadius: "var(--r)",
        overflow: "hidden",
      }}
    >
      {/* section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span style={{ color: "var(--sec)", fontSize: 14, lineHeight: 1 }}>{glyph}</span>
        <span
          className="tx-up"
          style={{ color: "var(--fg-2)", fontWeight: 600, flex: 1 }}
        >
          {section.name}
        </span>
      </div>

      {/* groups */}
      {section.groups.map((group) => (
        <GroupRail key={group.id} type={group.type}>
          {group.exercises.map((ex) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              cells={cells[ex.id] ?? [""]}
              onCellChange={(i, v) => onCellChange(ex.id, i, v)}
              onAddSet={() => onAddSet(ex.id)}
              onOpenHistory={() => onOpenHistory(ex.name, ex.id)}
              onReplaceExercise={() => onReplaceExercise(ex.id)}
            />
          ))}
        </GroupRail>
      ))}
    </div>
  );
}

function WorkoutProgress({ cells, onFinish, saved }: { cells: CellMap; onFinish: () => void; saved: boolean }) {
  let total = 0, done = 0;
  for (const vals of Object.values(cells)) {
    for (const v of vals) { total++; if (classifyCell(v) !== "empty") done++; }
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 4, background: "var(--bg-1)", borderTop: "1px solid var(--line)" }}>
      <div style={{ height: 2, background: "var(--bg-3)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--accent)", transition: "width .3s" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)", flex: 1 }}>
          {done}/{total} <span style={{ color: "var(--fg-4)" }}>· {pct}%</span>
        </span>
        <button
          className={`btn ${pct === 100 ? "primary" : ""}`}
          onClick={onFinish}
          style={{ fontSize: 12 }}
        >
          {saved ? <><CheckCircle size={13} /> Saved</> : "Finish workout"}
        </button>
      </div>
    </div>
  );
}

function TodayWorkout({ program, day }: { program: ProgramDocument; day: ProgramDay }) {
  const [cells, setCells] = useState<CellMap>(() => buildInitialCells(day));
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const navigate = useNavigate();

  const [historyDrawer, setHistoryDrawer] = useState<{
    exerciseName: string;
    rows: ExerciseSessionRow[];
  } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  async function openHistoryFor(exerciseName: string, exerciseId: string) {
    try {
      const logs = await logRepo.listForProgram(program.id);
      const rows = aggregateExerciseHistory(logs, exerciseId);
      setHistoryDrawer({ exerciseName, rows });
    } catch (e) {
      console.error("[history] failed to load exercise history", e);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const today = localDateString();
    // Build prescribedSets lookup for H5 padding
    const prescribedSetsMap = new Map<string, number>();
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          prescribedSetsMap.set(ex.id, ex.sets ?? 1);
        }
      }
    }
    logRepo
      .getForDay(program.id, day.id, today)
      .then((log) => {
        if (cancelled || !log) return;
        const hydrated: CellMap = {};
        for (const entry of log.entries) {
          hydrated[entry.exerciseId] = hydrateFromLog(entry, prescribedSetsMap.get(entry.exerciseId));
        }
        setCells((prev) => ({ ...prev, ...hydrated }));
      })
      .catch((e) => console.error("[logRepo] hydration failed", e));
    return () => { cancelled = true; };
  }, [program.id, day.id]);

  async function finishWorkout() {
    if (saving.current) return;
    saving.current = true;
    setSaveError(null);
    try {
      const today = localDateString();
      const existing = await logRepo.getForDay(program.id, day.id, today);
      // Build a flat lookup of exerciseId -> name for H3
      const exerciseNameMap = new Map<string, string>();
      for (const section of day.sections) {
        for (const group of section.groups) {
          for (const ex of group.exercises) {
            exerciseNameMap.set(ex.id, ex.name);
          }
        }
      }
      const entries = Object.entries(cells).map(([exerciseId, vals]) => ({
        exerciseId,
        exerciseName: exerciseNameMap.get(exerciseId),
        sets: serialiseSets(vals),
      }));
      await logRepo.save({
        id: existing?.id ?? crypto.randomUUID(),
        programId: program.id,
        dayId: day.id,
        performedAt: new Date().toISOString(),
        entries,
      });

      const allCells = Object.values(cells).flat();
      const totalSets = allCells.length;
      const completedSets = allCells.filter((v) => classifyCell(v) !== "empty").length;
      const exerciseCount = Object.keys(cells).length;

      await trackWorkoutEvent({
        type: "workout_saved",
        programId: program.id,
        dayId: day.id,
        performedAt: new Date().toISOString(),
        exerciseCount,
        totalSets,
        completedSets,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error("[finishWorkout] save failed", e);
      setSaveError("Failed to save workout. Please try again.");
    } finally {
      saving.current = false;
    }
  }

  const handleCellChange = useCallback((exId: string, i: number, v: string) => {
    setCells((prev) => updateCell(prev, exId, i, v));
  }, []);

  const handleAddSet = useCallback((exId: string) => {
    setCells((prev) => addSet(prev, exId));
  }, []);

  const handleReplaceExercise = useCallback((exId: string) => setReplaceTarget(exId), []);

  function handleApplyReplacement(replacement: ProgramDay) {
    const stored = storePendingDiff(program.id, day, replacement);
    if (!stored) {
      // SessionStorage unavailable — show error to user
      alert("Unable to store changes temporarily. Please try again or check your browser settings.");
      return;
    }
    setAiModalOpen(false);
    navigate(`/programs/${program.id}/diff`);
  }

  function handleReplaceConfirm(item: ExerciseCatalogItem) {
    if (!replaceTarget) return;
    const newDay = swapExercise(day, replaceTarget, item);
    setReplaceTarget(null); // clear before navigate — keep sync if handleApplyReplacement ever becomes async
    handleApplyReplacement(newDay);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Day header */}
      <div
        style={{
          padding: "12px 0 16px",
          borderBottom: "1px solid var(--line)",
          marginBottom: 12,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--fg-3)",
            margin: "0 0 4px",
          }}
        >
          {program.title}
        </p>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            margin: 0,
            color: "var(--fg)",
          }}
        >
          {day.title}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <p style={{ fontSize: 12, color: "var(--fg-3)", margin: 0, fontFamily: "var(--font-mono)", flex: 1 }}>
            {day.sections.length} sections ·{" "}
            {day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0)}{" "}
            exercises
          </p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setAiModalOpen(true)}
            style={{ padding: "4px 8px", gap: 4, display: "flex", alignItems: "center" }}
            aria-label="Modify with AI"
            title="Modify with AI"
          >
            <Sparkles size={13} aria-hidden />
          </button>
        </div>
      </div>

      {/* Sections */}
      {day.sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          cells={cells}
          onCellChange={handleCellChange}
          onAddSet={handleAddSet}
          onOpenHistory={openHistoryFor}
          onReplaceExercise={handleReplaceExercise}
        />
      ))}

      <WorkoutProgress cells={cells} onFinish={finishWorkout} saved={saved} />
      {saveError && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 12, fontFamily: "var(--font-mono)", padding: "4px 12px", margin: 0 }}>
          {saveError}
        </p>
      )}

      {historyDrawer && (
        <HistoryDrawer
          exerciseName={historyDrawer.exerciseName}
          rows={historyDrawer.rows}
          onClose={() => setHistoryDrawer(null)}
        />
      )}
      {replaceTarget && (
        <ExerciseReplaceSheet
          onSelect={handleReplaceConfirm}
          onClose={() => setReplaceTarget(null)}
        />
      )}

      {aiModalOpen && (
        <ModifyAiModal
          currentDay={day}
          programId={program.id}
          onApply={handleApplyReplacement}
          onClose={() => setAiModalOpen(false)}
        />
      )}
    </div>
  );
}

export function TodayClient() {
  const { programs, profile, loading, refresh } = useLocalData();
  const [resolvedDay, setResolvedDay] = useState<import("@/lib/programs/types").ProgramDay | undefined>(undefined);
  const [dayResolving, setDayResolving] = useState(true);

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProgram = programs.find((p) => p.active) ?? programs[0];

  useEffect(() => {
    if (loading) return;
    if (!activeProgram) {
      setResolvedDay(undefined);
      setDayResolving(false);
      return;
    }

    const days = getRenderableDays(activeProgram);
    if (days.length === 0) {
      setResolvedDay(undefined);
      setDayResolving(false);
      return;
    }

    setDayResolving(true);
    const today = localDateString();
    let cancelled = false;

    logRepo
      .listForProgram(activeProgram.id)
      .then((logs) => {
        if (cancelled) return;

        // Check if there is already a log for today
        const todayLog = logs.find((l) => l.performedAt.slice(0, 10) === today);
        if (todayLog) {
          const todayDay = days.find((d) => d.id === todayLog.dayId);
          setResolvedDay(todayDay ?? days[0]);
          setDayResolving(false);
          return;
        }

        // Find the most recently logged day and advance to the next one,
        // walking back through sorted logs to handle cases where the last
        // logged day was removed from the program after editing.
        if (logs.length > 0) {
          const sortedLogs = [...logs].sort(
            (a, b) => b.performedAt.localeCompare(a.performedAt)
          );
          const dayIds = new Set(days.map((d) => d.id));
          const validLog = sortedLogs.find((log) => dayIds.has(log.dayId));
          if (validLog) {
            const idx = days.findIndex((d) => d.id === validLog.dayId);
            setResolvedDay(days[(idx + 1) % days.length]);
            setDayResolving(false);
            return;
          }
        }

        // No valid previous day found (no logs, or last day was removed from program) — start at day 0
        setResolvedDay(days[0]);
        setDayResolving(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[TodayClient] day resolution failed", e);
        setResolvedDay(days[0]);
        setDayResolving(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeProgram?.id]);

  const banner = !profile && !loading ? (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 14,
        background: "var(--accent-soft)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--r, 6px)",
        fontSize: 13,
        color: "var(--fg)",
      }}
    >
      <span style={{ flex: 1 }}>
        Welcome to trAIner — set up your Profile so the app can tailor your workouts.
      </span>
      <Link
        to="/profile"
        style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none" }}
      >
        Go to Profile →
      </Link>
    </div>
  ) : null;

  if (loading || dayResolving) {
    return (
      <>
        {banner}
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Loading…
        </p>
      </>
    );
  }

  if (!activeProgram || !resolvedDay) {
    return (
      <>
        {banner}
        <div className="panel stack">
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Today</h1>
          <p style={{ color: "var(--fg-3)" }}>
            Import a program to start logging workouts.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <TodayWorkout program={activeProgram} day={resolvedDay} />
    </>
  );
}
