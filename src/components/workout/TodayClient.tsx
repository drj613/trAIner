"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Download, History, Plus, Sparkles } from "lucide-react";
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

function ExerciseRow({
  exercise,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
  onOpenHistory: () => void;
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
}

function SectionCard({
  section,
  cells,
  onCellChange,
  onAddSet,
  onOpenHistory,
}: {
  section: ProgramSection;
  cells: CellMap;
  onCellChange: (exId: string, i: number, v: string) => void;
  onAddSet: (exId: string) => void;
  onOpenHistory: (exerciseName: string, exerciseId: string) => void;
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
  const saving = useRef(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const router = useRouter();

  const [historyDrawer, setHistoryDrawer] = useState<{
    exerciseName: string;
    rows: ExerciseSessionRow[];
  } | null>(null);

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
    const today = new Date().toISOString().slice(0, 10);
    logRepo
      .getForDay(program.id, day.id, today)
      .then((log) => {
        if (cancelled || !log) return;
        const hydrated: CellMap = {};
        for (const entry of log.entries) {
          hydrated[entry.exerciseId] = hydrateFromLog(entry);
        }
        setCells((prev) => ({ ...prev, ...hydrated }));
      })
      .catch((e) => console.error("[logRepo] hydration failed", e));
    return () => { cancelled = true; };
  }, [program.id, day.id]);

  async function finishWorkout() {
    if (saving.current) return;
    saving.current = true;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const existing = await logRepo.getForDay(program.id, day.id, today);
      const entries = Object.entries(cells).map(([exerciseId, vals]) => ({
        exerciseId,
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
    } finally {
      saving.current = false;
    }
  }

  const handleCellChange = (exId: string, i: number, v: string) => {
    setCells((prev) => updateCell(prev, exId, i, v));
  };

  const handleAddSet = (exId: string) => {
    setCells((prev) => addSet(prev, exId));
  };

  function handleApplyReplacement(replacement: ProgramDay) {
    storePendingDiff(program.id, day, replacement);
    setAiModalOpen(false);
    router.push(`/programs/${program.id}/diff`);
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
        />
      ))}

      <WorkoutProgress cells={cells} onFinish={finishWorkout} saved={saved} />

      {historyDrawer && (
        <HistoryDrawer
          exerciseName={historyDrawer.exerciseName}
          rows={historyDrawer.rows}
          onClose={() => setHistoryDrawer(null)}
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
  const { programs, loading, seedDemo } = useLocalData();
  const activeProgram = programs.find((p) => p.active) ?? programs[0];
  const day = activeProgram ? getRenderableDays(activeProgram)[0] : undefined;

  if (loading) {
    return (
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading…
      </p>
    );
  }

  if (!activeProgram || !day) {
    return (
      <div className="panel stack">
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Today</h1>
        <p style={{ color: "var(--fg-3)" }}>
          Import a program or seed the demo to start logging locally.
        </p>
        <button className="button" onClick={seedDemo}>
          <Download size={18} aria-hidden /> Seed demo program
        </button>
      </div>
    );
  }

  return <TodayWorkout program={activeProgram} day={day} />;
}
