"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, CheckCircle, Download, History, Pencil, Plus, Sparkles } from "lucide-react";
import { logRepo } from "@/lib/storage/logRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { trackWorkoutEvent } from "@/lib/analytics/analyticsSeam";
import { serialiseSets, hydrateFromLog, applyEntryNotes } from "@/lib/workout/sessionState";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { SetCell, classifyCell } from "./SetCell";
import type { ProgramDocument, ProgramDay, ProgramExercise, ProgramSection } from "@/lib/programs/types";
import { buildInitialCells, updateCell, addSet, type CellMap } from "@/lib/workout/cellMap";
import { sectionKind } from "@/lib/workout/sectionKind";
import { aggregateExerciseHistory, type ExerciseSessionRow } from "@/lib/workout/historyUtils";
import { HistoryDrawer } from "./HistoryDrawer";
import { ModifyAiModal } from "./ModifyAiModal";
import { storePendingDiff } from "@/lib/workout/pendingDiff";
import { getRenderableDays } from "@/lib/programs/overrides";
import { ExerciseReplaceSheet } from "./ExerciseReplaceSheet";
import { ExerciseEditSheet } from "./ExerciseEditSheet";
import { swapExercise } from "@/lib/workout/exerciseSwap";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";
import { toTitleCase } from "@/lib/catalog/normalize";
import { GroupRail } from "./GroupRail";
import { RestTimer } from "./RestTimer";
import { resolveNextDay } from "@/lib/workout/dayResolver";
import { useDebouncedAutoSave } from "@/lib/workout/useDebouncedAutoSave";
import { BodyweightWidget } from "./BodyweightWidget";

function localDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cellId(exId: string, i: number) {
  return `cell-${exId}-${i}`;
}

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  cells,
  note,
  onCellChange,
  onAddSet,
  onOpenHistory,
  onReplaceExercise,
  onEdit,
  onNoteChange,
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  note: string;
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
  onOpenHistory: () => void;
  onReplaceExercise: () => void;
  onEdit: () => void;
  onNoteChange: (v: string) => void;
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
            {toTitleCase(exercise.name)}
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
            onClick={onEdit}
            style={{ padding: "3px 6px", flexShrink: 0 }}
            aria-label={`Edit prescription for ${exercise.name}`}
            title="Edit prescription"
            type="button"
          >
            <Pencil size={13} aria-hidden />
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
            <span
              style={{
                color: "var(--fg-4)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontSize: 9,
                marginRight: 4,
              }}
            >
              prescribed
            </span>
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
      <RestTimer restText={exercise.rest} notes={exercise.notes} />
      <details style={{ marginTop: 6 }} open={!!note}>
        <summary
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-4)",
            cursor: "pointer",
            listStyle: "none",
            userSelect: "none",
          }}
        >
          {note ? "note ▾" : "+ add note"}
        </summary>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          placeholder="Your note about this set (felt good, ouch, etc.)"
          style={{
            width: "100%",
            marginTop: 4,
            background: "var(--bg-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
            borderRadius: 4,
            padding: "4px 6px",
            fontFamily: "inherit",
            fontSize: 12,
            resize: "vertical",
          }}
        />
      </details>
    </div>
  );
});

function SectionCard({
  section,
  cells,
  notes,
  onCellChange,
  onAddSet,
  onOpenHistory,
  onReplaceExercise,
  onEdit,
  onNoteChange,
}: {
  section: ProgramSection;
  cells: CellMap;
  notes: Record<string, string>;
  onCellChange: (exId: string, i: number, v: string) => void;
  onAddSet: (exId: string) => void;
  onOpenHistory: (exerciseName: string, exerciseId: string) => void;
  onReplaceExercise: (exerciseId: string) => void;
  onEdit: (exercise: ProgramExercise) => void;
  onNoteChange: (exId: string, v: string) => void;
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
        <GroupRail key={group.id} type={group.type} notes={group.notes}>
          {group.exercises.map((ex) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              cells={cells[ex.id] ?? [""]}
              note={notes[ex.id] ?? ""}
              onCellChange={(i, v) => onCellChange(ex.id, i, v)}
              onAddSet={() => onAddSet(ex.id)}
              onOpenHistory={() => onOpenHistory(ex.name, ex.id)}
              onReplaceExercise={() => onReplaceExercise(ex.id)}
              onEdit={() => onEdit(ex)}
              onNoteChange={(v) => onNoteChange(ex.id, v)}
            />
          ))}
        </GroupRail>
      ))}
    </div>
  );
}

function WorkoutProgress({
  cells,
  onFinish,
  saved,
  autoSaveStatus,
}: {
  cells: CellMap;
  onFinish: () => void;
  saved: boolean;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
}) {
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
        <span
          role="status"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color:
              autoSaveStatus === "error"
                ? "var(--bad)"
                : autoSaveStatus === "saving"
                ? "var(--fg-3)"
                : autoSaveStatus === "saved"
                ? "var(--good)"
                : "var(--fg-4)",
          }}
        >
          {autoSaveStatus === "saving" && "saving…"}
          {autoSaveStatus === "saved" && "saved"}
          {autoSaveStatus === "error" && "save failed"}
          {autoSaveStatus === "idle" && ""}
        </span>
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

function TodayWorkout({ program, day, onFinish }: { program: ProgramDocument; day: ProgramDay; onFinish: () => void }) {
  const [cells, setCells] = useState<CellMap>(() => buildInitialCells(day));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const logIdRef = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useLocalData();

  const [historyDrawer, setHistoryDrawer] = useState<{
    exerciseName: string;
    rows: ExerciseSessionRow[];
  } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ProgramExercise | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  async function openHistoryFor(exerciseName: string, exerciseId: string) {
    try {
      const logs = await logRepo.listForProgram(program.id);
      const rows = aggregateExerciseHistory(logs, exerciseId);
      setHistoryDrawer({ exerciseName, rows });
    } catch (e) {
      console.error("[history] failed to load exercise history", e);
    }
  }

  // Hydration only re-runs when program or day identity changes.
  // Day-scoped prescription edits keep both ids stable (see overrides.ts),
  // so the user's in-progress cells survive an edit.
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
        logIdRef.current = log.id;
        const hydrated: CellMap = {};
        const hydratedNotes: Record<string, string> = {};
        for (const entry of log.entries) {
          hydrated[entry.exerciseId] = hydrateFromLog(entry, prescribedSetsMap.get(entry.exerciseId));
          if (entry.notes) hydratedNotes[entry.exerciseId] = entry.notes;
        }
        setCells((prev) => ({ ...prev, ...hydrated }));
        setNotes((prev) => ({ ...prev, ...hydratedNotes }));
      })
      .catch((e) => console.error("[logRepo] hydration failed", e));
    return () => { cancelled = true; };
  }, [program.id, day.id]);

  async function saveCells(
    { cells: c, notes: n }: { cells: CellMap; notes: Record<string, string> },
    { markCompleted = false }: { markCompleted?: boolean } = {},
  ) {
    const today = localDateString();
    const existing = await logRepo.getForDay(program.id, day.id, today);
    logIdRef.current = existing?.id ?? logIdRef.current ?? crypto.randomUUID();
    const exerciseNameMap = new Map<string, string>();
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          exerciseNameMap.set(ex.id, ex.name);
        }
      }
    }
    const entries = Object.entries(c).map(([exerciseId, vals]) => {
      const base = {
        exerciseId,
        exerciseName: exerciseNameMap.get(exerciseId),
        sets: serialiseSets(vals),
      };
      return applyEntryNotes(base, n[exerciseId] ?? "");
    });
    await logRepo.save({
      id: logIdRef.current,
      programId: program.id,
      dayId: day.id,
      performedAt: existing?.performedAt ?? new Date().toISOString(),
      completedAt: markCompleted ? new Date().toISOString() : existing?.completedAt,
      entries,
    });
  }

  const autoSavePayload = useMemo(() => ({ cells, notes }), [cells, notes]);
  const { status: autoSaveStatus, flush } = useDebouncedAutoSave(autoSavePayload, saveCells, 1500);

  useEffect(() => {
    return () => { void flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishWorkout() {
    if (saving.current) return;
    saving.current = true;
    setSaveError(null);
    try {
      await flush();
      await saveCells({ cells, notes }, { markCompleted: true });
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
      setTimeout(() => onFinish(), 800);
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

  const handleNoteChange = useCallback((exId: string, v: string) => {
    setNotes((prev) => ({ ...prev, [exId]: v }));
  }, []);

  const handleReplaceExercise = useCallback((exId: string) => setReplaceTarget(exId), []);

  const handleEditExercise = useCallback((ex: ProgramExercise) => setEditTarget(ex), []);

  async function applyExerciseEdit(patch: Partial<ProgramExercise>) {
    if (!editTarget) return;
    setEditError(null);
    try {
      const fresh = await programRepo.get(program.id);
      if (!fresh) return;
      const patchedDay: ProgramDay = {
        ...day,
        sections: day.sections.map((s) => ({
          ...s,
          groups: s.groups.map((g) => ({
            ...g,
            exercises: g.exercises.map((e) => e.id === editTarget.id ? { ...e, ...patch } : e),
          })),
        })),
      };
      const filteredOverrides = fresh.overrides.filter(
        (o) => !(o.scope === "day" && o.dayId === day.id),
      );
      const newOverride = {
        id: crypto.randomUUID(),
        scope: "day" as const,
        programId: program.id,
        dayId: day.id,
        replacement: patchedDay,
        reason: "Edited from Today",
        createdAt: new Date().toISOString(),
      };
      await programRepo.save({ ...fresh, overrides: [...filteredOverrides, newOverride] });
      await refresh();
      setEditTarget(null);
    } catch (e) {
      console.error("[applyExerciseEdit] save failed", e);
      setEditError("Failed to save. Please try again.");
    }
  }

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
        {/* Format guide */}
        <details style={{ marginTop: 6 }}>
          <summary
            style={{
              fontSize: 10, color: "var(--fg-4)", cursor: "pointer",
              fontFamily: "var(--font-mono)", userSelect: "none", listStyle: "none",
            }}
          >
            format guide
          </summary>
          <div
            style={{
              paddingTop: 5, fontSize: 10, color: "var(--fg-3)",
              fontFamily: "var(--font-mono)", lineHeight: 2,
            }}
          >
            {[
              ["70×8", "weight × reps (done)"],
              ["+70×8", "personal record"],
              ["bw×15", "bodyweight"],
              ["70×8!", "failed / missed rep"],
              ["skip", "skipped set"],
              ["pain", "pain noted"],
            ].map(([ex, desc]) => (
              <span key={ex} style={{ display: "inline-flex", gap: 4, marginRight: 14, alignItems: "baseline" }}>
                <code style={{ background: "var(--bg-3)", padding: "0 4px", borderRadius: 3 }}>{ex}</code>
                <span style={{ color: "var(--fg-4)", fontSize: 9 }}>{desc}</span>
              </span>
            ))}
          </div>
        </details>
      </div>

      <BodyweightWidget />

      {/* Sections */}
      {day.sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          cells={cells}
          notes={notes}
          onCellChange={handleCellChange}
          onAddSet={handleAddSet}
          onOpenHistory={openHistoryFor}
          onReplaceExercise={handleReplaceExercise}
          onEdit={handleEditExercise}
          onNoteChange={handleNoteChange}
        />
      ))}

      <WorkoutProgress cells={cells} onFinish={finishWorkout} saved={saved} autoSaveStatus={autoSaveStatus} />
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
      {editTarget && (
        <ExerciseEditSheet
          exercise={editTarget}
          onSave={applyExerciseEdit}
          onClose={() => { setEditTarget(null); setEditError(null); }}
          error={editError}
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
  const [resolvedDay, setResolvedDay] = useState<ProgramDay | undefined>(undefined);
  const [dayResolving, setDayResolving] = useState(true);

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProgram = programs.find((p) => p.active) ?? programs[0];

  const handleFinish = useCallback(() => {
    if (!activeProgram || !resolvedDay) return;
    const days = getRenderableDays(activeProgram);
    const idx = days.findIndex((d) => d.id === resolvedDay.id);
    if (idx === -1) return;
    setResolvedDay(days[(idx + 1) % days.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProgram?.id, resolvedDay?.id]);

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
    let cancelled = false;

    logRepo
      .listForProgram(activeProgram.id)
      .then((logs) => {
        if (cancelled) return;
        const today = localDateString();
        setResolvedDay(resolveNextDay(days, logs, today));
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
    const profileDone = !!profile;
    const steps: Array<{ label: string; to: string; done: boolean }> = [
      { label: "Fill out your Profile", to: "/profile", done: profileDone },
      { label: "Choose a coach on Prompts — copy the generated prompt", to: "/prompts", done: false },
      { label: "Paste the AI's JSON response on Import", to: "/import", done: false },
    ];
    return (
      <>
        {banner}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: "var(--fg)" }}>Today</h1>
            <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0 }}>
              No active program yet. Follow these steps to get started:
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {steps.map(({ label, to, done }, i) => (
              <Link
                key={to}
                to={to}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  background: done ? "var(--bg-2)" : "var(--bg-1)",
                  border: `1px solid ${done ? "var(--good)" : "var(--line)"}`,
                  borderRadius: "var(--r, 6px)",
                  textDecoration: "none", color: "var(--fg)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: done ? 12 : 11,
                    fontFamily: "var(--font-mono)", fontWeight: 700,
                    background: done ? "var(--good)" : "var(--bg-3)",
                    color: done ? "#fff" : "var(--fg-3)",
                    border: `1px solid ${done ? "var(--good)" : "var(--line)"}`,
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{label}</span>
                <span aria-hidden style={{ color: "var(--fg-4)", fontSize: 11 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <TodayWorkout key={resolvedDay.id} program={activeProgram} day={resolvedDay} onFinish={handleFinish} />
    </>
  );
}
