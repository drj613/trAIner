"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftRight, CheckCircle, ChevronLeft, ChevronRight, History, Pencil, Plus, Sparkles } from "lucide-react";
import { logRepo } from "@/lib/storage/logRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { trackWorkoutEvent } from "@/lib/analytics/analyticsSeam";
import { serialiseSets, hydrateFromLog, applyEntryNotes } from "@/lib/workout/sessionState";
import { localDateString, logLocalDate, sessionLogId } from "@/lib/workout/localDate";
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
import { useDebouncedAutoSave } from "@/lib/workout/useDebouncedAutoSave";
import { BodyweightWidget } from "./BodyweightWidget";

function cellId(exId: string, i: number) {
  return `cell-${exId}-${i}`;
}

// ─── ExerciseRow (identical to TodayClient) ────────────────────────────────

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  cells,
  note,
  readOnly,
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
  readOnly: boolean;
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
              readOnly={readOnly}
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
        {!readOnly && (
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
        )}
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
          readOnly={readOnly}
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

// ─── SectionCard (identical to TodayClient) ────────────────────────────────

function SectionCard({
  section,
  cells,
  notes,
  readOnly,
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
  readOnly: boolean;
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

      {section.groups.map((group) => (
        <GroupRail key={group.id} type={group.type} notes={group.notes}>
          {group.exercises.map((ex) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              cells={cells[ex.id] ?? [""]}
              note={notes[ex.id] ?? ""}
              readOnly={readOnly}
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

// ─── WorkoutBottomBar ──────────────────────────────────────────────────────

function WorkoutBottomBar({
  cells,
  onFinish,
  saved,
  autoSaveStatus,
  dayNote,
  onDayNoteChange,
  noteExpanded,
  onToggleNote,
  skipMode,
  onSkipDay,
  onSkipConfirm,
  onSkipCancel,
  alreadyComplete,
}: {
  cells: CellMap;
  onFinish: () => void;
  saved: boolean;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
  dayNote: string;
  onDayNoteChange: (v: string) => void;
  noteExpanded: boolean;
  onToggleNote: () => void;
  skipMode: boolean;
  onSkipDay: () => void;
  onSkipConfirm: (reason: string) => void;
  onSkipCancel: () => void;
  alreadyComplete: boolean | undefined;
}) {
  const [skipReason, setSkipReason] = useState("");
  const locked = alreadyComplete === true || alreadyComplete === undefined;

  // Reset reason when skip mode exits
  useEffect(() => {
    if (!skipMode) setSkipReason("");
  }, [skipMode]);

  let total = 0, done = 0;
  for (const vals of Object.values(cells)) {
    for (const v of vals) { total++; if (classifyCell(v) !== "empty") done++; }
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 4, background: "var(--bg-1)", borderTop: "1px solid var(--line)" }}>
      {/* Progress strip */}
      <div style={{ height: 2, background: "var(--bg-3)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--accent)", transition: "width .3s" }} />
      </div>

      {/* Day note textarea */}
      {noteExpanded && (
        <div style={{ padding: "8px 12px 0" }}>
          <textarea
            value={dayNote}
            onChange={(e) => onDayNoteChange(e.target.value)}
            rows={3}
            placeholder="Session note (optional)"
            style={{
              width: "100%",
              background: "var(--bg-2)",
              color: "var(--fg)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              padding: "4px 6px",
              fontFamily: "inherit",
              fontSize: 12,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Skip reason row */}
      {skipMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px 0" }}>
          <input
            type="text"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{
              flex: 1,
              background: "var(--bg-2)",
              color: "var(--fg)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={onSkipCancel}
            style={{ fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onSkipConfirm(skipReason)}
            aria-label="Skip →"
            style={{ fontSize: 12 }}
          >
            Skip →
          </button>
        </div>
      )}

      {/* Main action row */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 6 }}>
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
          type="button"
          className="btn ghost"
          onClick={onToggleNote}
          aria-label="Day note"
          style={{ fontSize: 11 }}
        >
          Day note {noteExpanded ? "▴" : "▾"}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={onSkipDay}
          disabled={locked}
          aria-label="Skip day"
          style={{ fontSize: 11 }}
        >
          Skip day
        </button>
        <button
          type="button"
          className={`btn ${pct === 100 && !locked ? "primary" : ""}`}
          onClick={onFinish}
          disabled={locked}
          aria-label={alreadyComplete === true ? "Completed" : "Finish workout"}
          style={{ fontSize: 12 }}
        >
          {alreadyComplete === true ? (
            <><CheckCircle size={13} /> Completed</>
          ) : saved ? (
            <><CheckCircle size={13} /> Saved</>
          ) : (
            "Finish workout"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Inner workout body (keyed by dayId for state reset) ──────────────────

function WorkoutBody({
  program,
  day,
  days,
  dayIndex,
  aiModalOpen,
  onAiModalClose,
}: {
  program: ProgramDocument;
  day: ProgramDay;
  days: ProgramDay[];
  dayIndex: number;
  aiModalOpen: boolean;
  onAiModalClose: () => void;
}) {
  const navigate = useNavigate();
  const { refresh } = useLocalData();

  const [cells, setCells] = useState<CellMap>(() => buildInitialCells(day));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dayNote, setDayNote] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [skipMode, setSkipMode] = useState(false);
  const logIdRef = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [alreadyComplete, setAlreadyComplete] = useState<boolean | undefined>(undefined);
  const saving = useRef(false);
  // "loading" until hydration resolves; "active" = an editable session
  // (today's, or a resumed in-progress one); "viewing" = read-only display of
  // the most recent completed/skipped session from an earlier date.
  const [sessionMode, setSessionMode] = useState<"loading" | "active" | "viewing">("loading");
  const sessionModeRef = useRef(sessionMode);
  sessionModeRef.current = sessionMode;
  const [viewedDate, setViewedDate] = useState<string | null>(null);

  const [historyDrawer, setHistoryDrawer] = useState<{
    exerciseName: string;
    rows: ExerciseSessionRow[];
  } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ProgramExercise | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  async function openHistoryFor(exerciseName: string, exerciseId: string) {
    try {
      // Resolve the slot's current canonical exercise id from the day template.
      let canonicalExerciseId: string | undefined;
      for (const section of day.sections) {
        for (const group of section.groups) {
          for (const ex of group.exercises) {
            if (ex.id === exerciseId) canonicalExerciseId = ex.canonicalExerciseId;
          }
        }
      }
      const logs = await logRepo.list();
      const rows = aggregateExerciseHistory(logs, exerciseId, canonicalExerciseId);
      setHistoryDrawer({ exerciseName, rows });
    } catch (e) {
      console.error("[history] failed to load exercise history", e);
    }
  }

  // Resolve which session this visit shows and hydrate from it.
  //
  //   1. A log for (program, day, today's local date) → that's today's
  //      session; resume it (locked when already completed/skipped today).
  //   2. Else, the most recent log for the day:
  //        - completed/skipped → read-only view of that historical session,
  //          with the option to start a fresh one;
  //        - in progress (e.g. started last night) → resume it.
  //   3. Else → fresh, empty, editable session.
  useEffect(() => {
    let cancelled = false;
    const today = localDateString();
    const prescribedSetsMap = new Map<string, number>();
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          prescribedSetsMap.set(ex.id, ex.sets ?? 1);
        }
      }
    }
    (async () => {
      const logs = (await logRepo.listForDay(day.id)).filter(
        (l) => l.programId === program.id,
      );
      if (cancelled) return;

      const sorted = [...logs].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
      const todayLog = sorted.find((l) => logLocalDate(l) === today);
      const target = todayLog ?? sorted[0];

      if (!target) {
        setAlreadyComplete(false);
        setSessionMode("active");
        return;
      }

      const hydrated: CellMap = {};
      const hydratedNotes: Record<string, string> = {};
      for (const entry of target.entries) {
        hydrated[entry.exerciseId] = hydrateFromLog(entry, prescribedSetsMap.get(entry.exerciseId));
        if (entry.notes) hydratedNotes[entry.exerciseId] = entry.notes;
      }
      setCells((prev) => ({ ...prev, ...hydrated }));
      setNotes((prev) => ({ ...prev, ...hydratedNotes }));
      if (target.dayNote) setDayNote(target.dayNote);

      const targetDone = !!target.completedAt || !!target.skippedAt;
      if (todayLog) {
        logIdRef.current = todayLog.id;
        setAlreadyComplete(targetDone);
        setSessionMode("active");
      } else if (targetDone) {
        setViewedDate(logLocalDate(target));
        setAlreadyComplete(true);
        setSessionMode("viewing");
      } else {
        logIdRef.current = target.id;
        setAlreadyComplete(false);
        setSessionMode("active");
      }
    })().catch((e) => console.error("[logRepo] session hydration failed", e));
    return () => { cancelled = true; };
  }, [program.id, day.id]);

  async function saveCells(
    { cells: c, notes: n, dayNote: dn }: { cells: CellMap; notes: Record<string, string>; dayNote: string },
    options?: { markCompleted?: boolean; skippedAt?: string; skipReason?: string },
  ) {
    // A read-only historical view (and the pre-hydration window) must never
    // write — autosave flushes fire on unmount for every visited day.
    if (sessionModeRef.current !== "active") return;
    const { markCompleted = false, skippedAt, skipReason } = options ?? {};
    const today = localDateString();
    const existing = logIdRef.current
      ? await logRepo.get(logIdRef.current)
      : await logRepo.getForDay(program.id, day.id, today);
    const exerciseNameMap = new Map<string, string>();
    const exerciseCanonicalMap = new Map<string, string | undefined>();
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const ex of group.exercises) {
          exerciseNameMap.set(ex.id, ex.name);
          exerciseCanonicalMap.set(ex.id, ex.canonicalExerciseId);
        }
      }
    }
    const entries = Object.entries(c).map(([exerciseId, vals]) => {
      const canonicalExerciseId = exerciseCanonicalMap.get(exerciseId);
      const base: {
        exerciseId: string;
        exerciseName?: string;
        canonicalExerciseId?: string;
        sets: ReturnType<typeof serialiseSets>;
      } = {
        exerciseId,
        exerciseName: exerciseNameMap.get(exerciseId),
        sets: serialiseSets(vals),
      };
      if (canonicalExerciseId) base.canonicalExerciseId = canonicalExerciseId;
      return applyEntryNotes(base, n[exerciseId] ?? "");
    });
    // Don't create a log for a session with nothing in it (merely opening a
    // day page is not a workout). Completing or skipping is always recorded.
    const isEmptySession =
      entries.every((e) => e.sets.length === 0 && !e.notes) && !dn.trim();
    if (!existing && isEmptySession && !markCompleted && !skippedAt) return;
    // Deterministic id: concurrent first-saves of the same (program, day,
    // local date) converge on one record instead of minting duplicates.
    logIdRef.current = existing?.id ?? logIdRef.current ?? sessionLogId(program.id, day.id, today);
    const shouldComplete = markCompleted || !!skippedAt;
    await logRepo.save({
      id: logIdRef.current,
      programId: program.id,
      dayId: day.id,
      performedAt: existing?.performedAt ?? new Date().toISOString(),
      performedDate: existing ? logLocalDate(existing) : today,
      completedAt: shouldComplete ? new Date().toISOString() : existing?.completedAt,
      skippedAt: skippedAt ?? existing?.skippedAt,
      skipReason: skipReason ?? existing?.skipReason,
      dayNote: dn || existing?.dayNote || undefined,
      entries,
    });
  }

  const autoSavePayload = useMemo(() => ({ cells, notes, dayNote }), [cells, notes, dayNote]);
  const { status: autoSaveStatus, flush } = useDebouncedAutoSave(autoSavePayload, saveCells, 1500);

  useEffect(() => {
    return () => { void flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigateToDay(idx: number) {
    navigate(`/programs/${program.id}/days/${days[idx].id}`);
  }

  async function finishWorkout() {
    if (saving.current) return;
    saving.current = true;
    setSaveError(null);
    try {
      await flush();
      await saveCells({ cells, notes, dayNote }, { markCompleted: true });
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
      const nextIdx = (dayIndex + 1) % days.length;
      setTimeout(() => navigateToDay(nextIdx), 800);
    } catch (e) {
      console.error("[finishWorkout] save failed", e);
      setSaveError("Failed to save workout. Please try again.");
    } finally {
      saving.current = false;
    }
  }

  async function handleSkip(reason: string) {
    try {
      await saveCells(
        { cells, notes, dayNote },
        { skippedAt: new Date().toISOString(), skipReason: reason || undefined },
      );
      setSkipMode(false);
      const nextIdx = (dayIndex + 1) % days.length;
      navigateToDay(nextIdx);
    } catch (e) {
      console.error("[handleSkip] save failed", e);
    }
  }

  // Leave the read-only historical view and begin a fresh session for today.
  function startNewSession() {
    logIdRef.current = null;
    setCells(buildInitialCells(day));
    setNotes({});
    setDayNote("");
    setViewedDate(null);
    setAlreadyComplete(false);
    setSessionMode("active");
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
        reason: "Edited from workout",
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

  async function handleApplyReplacement(replacement: ProgramDay) {
    await flush();
    const stored = storePendingDiff(program.id, day, replacement);
    if (!stored) {
      alert("Unable to store changes temporarily. Please try again or check your browser settings.");
      return;
    }
    onAiModalClose();
    navigate(`/programs/${program.id}/diff`);
  }

  async function handleReplaceConfirm(item: ExerciseCatalogItem) {
    if (!replaceTarget) return;
    const newDay = swapExercise(day, replaceTarget, item);
    setReplaceTarget(null);
    await handleApplyReplacement(newDay);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Historical session banner */}
      {sessionMode === "viewing" && viewedDate && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginBottom: 12,
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r)",
            fontSize: 12,
            color: "var(--fg-2)",
          }}
        >
          <span style={{ flex: 1, fontFamily: "var(--font-mono)" }}>
            Viewing completed session from {viewedDate}
          </span>
          <button
            type="button"
            className="btn"
            onClick={startNewSession}
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
          >
            Start new session
          </button>
        </div>
      )}

      {/* Sections */}
      {day.sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          cells={cells}
          notes={notes}
          readOnly={sessionMode === "viewing"}
          onCellChange={handleCellChange}
          onAddSet={handleAddSet}
          onOpenHistory={openHistoryFor}
          onReplaceExercise={handleReplaceExercise}
          onEdit={handleEditExercise}
          onNoteChange={handleNoteChange}
        />
      ))}

      <WorkoutBottomBar
        cells={cells}
        onFinish={finishWorkout}
        saved={saved}
        autoSaveStatus={autoSaveStatus}
        dayNote={dayNote}
        onDayNoteChange={setDayNote}
        noteExpanded={noteExpanded}
        onToggleNote={() => setNoteExpanded((v) => !v)}
        skipMode={skipMode}
        onSkipDay={() => setSkipMode(true)}
        onSkipConfirm={handleSkip}
        onSkipCancel={() => setSkipMode(false)}
        alreadyComplete={alreadyComplete}
      />

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
          onClose={onAiModalClose}
        />
      )}
    </div>
  );
}

// ─── Public component ──────────────────────────────────────────────────────

export function WorkoutDayClient() {
  const { id: programId, dayId } = useParams<{ id: string; dayId: string }>();
  const navigate = useNavigate();
  const { programs } = useLocalData();
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const program = programs.find((p) => p.id === programId);
  const days = program ? getRenderableDays(program) : [];
  const dayIndex = days.findIndex((d) => d.id === dayId);
  const day = dayIndex >= 0 ? days[dayIndex] : undefined;

  if (!program || !day) {
    return (
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading…
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 0 16px",
          borderBottom: "1px solid var(--line)",
          marginBottom: 12,
        }}
      >
        {/* Back link + prev/next nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Link
            to={`/programs/${program.id}`}
            style={{ color: "var(--fg-3)", fontSize: 11, fontFamily: "var(--font-mono)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}
          >
            ← Routines
          </Link>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn ghost"
            aria-label="Previous day"
            disabled={dayIndex === 0}
            onClick={() => navigate(`/programs/${program.id}/days/${days[dayIndex - 1].id}`)}
            style={{ padding: "3px 6px" }}
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
            Day {dayIndex + 1} of {days.length}
          </span>
          <button
            type="button"
            className="btn ghost"
            aria-label="Next day"
            disabled={dayIndex === days.length - 1}
            onClick={() => navigate(`/programs/${program.id}/days/${days[dayIndex + 1].id}`)}
            style={{ padding: "3px 6px" }}
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>

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

      {!!program.progression?.length && (
        <div
          style={{
            padding: "8px 10px",
            marginBottom: 12,
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm, 4px)",
            fontSize: 11,
            color: "var(--fg-3)",
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
            Progression
          </div>
          {program.progression.map((p, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>
              <strong style={{ color: "var(--fg-2)", fontWeight: 500 }}>{p.applies}</strong> → {p.rule}
            </div>
          ))}
        </div>
      )}

      <BodyweightWidget />

      {/* Workout body — keyed by dayId so state resets on navigation */}
      <WorkoutBody
        key={day.id}
        program={program}
        day={day}
        days={days}
        dayIndex={dayIndex}
        aiModalOpen={aiModalOpen}
        onAiModalClose={() => setAiModalOpen(false)}
      />
    </div>
  );
}
