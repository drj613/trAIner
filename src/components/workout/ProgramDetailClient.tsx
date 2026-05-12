"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, ChevronLeft, Map, Sparkles, Trash2 } from "lucide-react";
import { getRenderableDays } from "@/lib/programs/overrides";
import { buildWeekGrid } from "@/lib/workout/programGrid";
import { sectionKind } from "@/lib/workout/sectionKind";
import { diffDays } from "@/lib/workout/programDiff";
import { swapExercise, addExercise } from "@/lib/workout/exerciseSwap";
import { programRepo } from "@/lib/storage/programRepo";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { RoutineAnalysisCard } from "@/components/analysis/RoutineAnalysisCard";
import { LlmAnalysisSheet } from "@/components/analysis/LlmAnalysisSheet";
import { ModifyAiModal } from "./ModifyAiModal";
import { ExerciseReplaceSheet } from "./ExerciseReplaceSheet";
import { DiffReview } from "./DiffReview";
import type { ProgramDay, ProgramDocument, ProgramSection } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReplaceTarget =
  | { kind: "swap"; day: ProgramDay; exId: string }
  | { kind: "add"; day: ProgramDay; sectionId: string };

type PendingChange = { original: ProgramDay; replacement: ProgramDay };

// ── WeekTabStrip ──────────────────────────────────────────────────────────────

function WeekTabStrip({
  weeks,
  activeWeek,
  onSelect,
}: {
  weeks: ReturnType<typeof buildWeekGrid>;
  activeWeek: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        padding: "0 12px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg)",
        flexShrink: 0,
      }}
    >
      {weeks.map((wk, i) => {
        const isCurrent = i === activeWeek;
        const allDone = wk.days.every((d) => d.sections.length === 0);
        return (
          <button
            key={wk.weekNumber}
            onClick={() => onSelect(i)}
            aria-label={`WK ${wk.weekNumber}`}
            style={{
              flex: 1,
              padding: "8px 4px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${isCurrent ? "var(--accent)" : "transparent"}`,
              color: isCurrent ? "var(--accent)" : "var(--fg-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>
              WK {wk.weekNumber}
            </span>
            <div style={{ display: "flex", gap: 2 }}>
              {wk.days.map((d) => {
                const isRest = d.sections.length === 0;
                return (
                  <span
                    key={d.id}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: isRest ? "transparent" : "var(--line-2)",
                      border: isRest ? "1px dashed var(--line-2)" : "none",
                      opacity: isRest ? 0.5 : 1,
                    }}
                  />
                );
              })}
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.08em",
                color: allDone ? "var(--good)" : isCurrent ? "var(--accent)" : "var(--fg-4)",
              }}
            >
              {isCurrent ? "CURRENT" : allDone ? "DONE" : i < activeWeek ? "PAST" : "UPCOMING"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ section }: { section: ProgramSection }) {
  const { glyph } = sectionKind(section.type);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 10px 4px",
        borderBottom: "1px dashed var(--line)",
        background: "color-mix(in oklab, var(--bg-3) 50%, transparent)",
      }}
    >
      <span style={{ color: "var(--accent)", fontSize: 11, flexShrink: 0 }}>{glyph}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          flex: 1,
        }}
      >
        {section.name}
      </span>
    </div>
  );
}

// ── ExerciseRow ───────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise,
  index,
  last,
  onSwap,
  onAi,
  onDelete,
  onCommitName,
}: {
  exercise: ProgramDay["sections"][0]["groups"][0]["exercises"][0];
  index: string;
  last: boolean;
  onSwap: () => void;
  onAi: () => void;
  onDelete: () => void;
  onCommitName: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(exercise.name);
  const cancelledRef = useRef(false);

  useEffect(() => { setName(exercise.name); }, [exercise.name]);

  function commitName() {
    if (cancelledRef.current) { cancelledRef.current = false; setEditing(false); return; }
    setEditing(false);
    if (name.trim() && name !== exercise.name) onCommitName(name.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      cancelledRef.current = true;
      setName(exercise.name);
      setEditing(false);
      e.currentTarget.blur();
    }
  }

  const prescription = [
    exercise.sets ? `${exercise.sets}×` : "",
    exercise.reps ?? "",
    exercise.load ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-4)", width: 24, flexShrink: 0 }}>
        {index}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              background: "var(--bg-3)",
              color: "var(--fg)",
              border: "1px solid var(--accent)",
              borderRadius: 2,
              padding: "1px 5px",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 500,
              outline: "none",
            }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            style={{ fontSize: 12.5, fontWeight: 500, cursor: "text", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {exercise.name}
          </span>
        )}
        {prescription && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)", marginTop: 1 }}>
            {prescription}
            {exercise.rest && <span style={{ color: "var(--fg-4)", marginLeft: 6 }}>rest {exercise.rest}</span>}
          </div>
        )}
      </div>
      <button className="btn ghost" title="Swap from catalogue" onClick={onSwap} style={{ padding: "3px 5px" }}>
        <ArrowLeftRight size={11} aria-hidden />
      </button>
      <button className="btn ghost" title="Modify with AI" onClick={onAi} style={{ padding: "3px 5px" }}>
        <Sparkles size={11} aria-hidden />
      </button>
      <button className="btn ghost" title="Remove exercise" onClick={onDelete} style={{ padding: "3px 5px", color: "var(--fg-3)" }}>
        <Trash2 size={11} aria-hidden />
      </button>
    </div>
  );
}

// ── DayCard ───────────────────────────────────────────────────────────────────

function DayCard({
  day,
  expanded,
  onToggle,
  onSwapEx,
  onAiEx,
  onDeleteEx,
  onAddEx,
  onCommitName,
  onModifyDay,
  onStart,
}: {
  day: ProgramDay;
  expanded: boolean;
  onToggle: () => void;
  onSwapEx: (exId: string) => void;
  onAiEx: () => void;
  onDeleteEx: (sectionId: string, exId: string) => void;
  onAddEx: (sectionId: string) => void;
  onCommitName: (sectionId: string, exId: string, name: string) => void;
  onModifyDay: () => void;
  onStart: () => void;
}) {
  const isRest = day.sections.length === 0;
  const exCount = day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0);
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const label = DAY_LABELS[(day.dayNumber - 1) % 7] ?? `D${day.dayNumber}`;

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--line)",
        borderRadius: "var(--r)",
        marginBottom: 8,
        overflow: "hidden",
        opacity: isRest ? 0.65 : 1,
      }}
    >
      {/* Header */}
      <div
        onClick={() => !isRest && onToggle()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 10px",
          cursor: isRest ? "default" : "pointer",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", width: 28, flexShrink: 0, letterSpacing: "0.06em" }}>
          {label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {day.title}
          </div>
          {!isRest && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>
              {exCount} ex · {day.sections.length} section{day.sections.length !== 1 ? "s" : ""}
            </div>
          )}
          {isRest && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)" }}>rest</div>
          )}
        </div>
        {!isRest && (
          <span style={{ color: "var(--fg-3)", fontSize: 12 }}>{expanded ? "▾" : "▸"}</span>
        )}
      </div>

      {/* Expanded body */}
      {expanded && !isRest && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {day.sections.map((section, si) => (
            <div key={section.id}>
              <SectionHeader section={section} />
              {section.groups.flatMap((group, gi) =>
                group.exercises.map((ex, ei) => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    index={`${si + 1}.${ei + 1}`}
                    last={gi === section.groups.length - 1 && ei === group.exercises.length - 1}
                    onSwap={() => onSwapEx(ex.id)}
                    onAi={onAiEx}
                    onDelete={() => onDeleteEx(section.id, ex.id)}
                    onCommitName={(name) => onCommitName(section.id, ex.id, name)}
                  />
                ))
              )}
              <button
                className="btn ghost"
                onClick={() => onAddEx(section.id)}
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  padding: "6px 10px",
                  borderRadius: 0,
                  borderBottom: si < day.sections.length - 1 ? "1px solid var(--line)" : "none",
                  color: "var(--fg-3)",
                  fontSize: 11,
                }}
              >
                + Add to {section.name.toLowerCase()}
              </button>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: 8,
              background: "var(--bg-2)",
              borderTop: "1px solid var(--line)",
            }}
          >
            <button
              className="btn"
              onClick={onModifyDay}
              style={{ flex: 1, justifyContent: "center", padding: "6px 8px", fontSize: 11.5 }}
            >
              <Sparkles size={11} aria-hidden /> Modify day
            </button>
            <button
              className="btn primary"
              onClick={onStart}
              style={{ flex: 1, justifyContent: "center", padding: "6px 8px", fontSize: 11.5 }}
            >
              Start →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RoutineConfirmModal ───────────────────────────────────────────────────────

function RoutineConfirmModal({
  pending,
  scope,
  onScopeChange,
  onAccept,
  onDiscard,
  saveError,
}: {
  pending: PendingChange;
  scope: "base" | "week";
  onScopeChange: (s: "base" | "week") => void;
  onAccept: () => void;
  onDiscard: () => void;
  saveError: string | null;
}) {
  const diffs = diffDays(pending.original, pending.replacement);
  const weekDisabled = pending.original.weekNumber === undefined;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div onClick={onDiscard} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review changes"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "85vh",
          background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--line-2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Scope selector */}
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 16px 8px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", alignSelf: "center" }}>
            Apply to
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 12, cursor: "pointer" }}>
            <input
              type="radio"
              name="routine-scope"
              value="base"
              checked={scope === "base"}
              onChange={() => onScopeChange("base")}
              style={{ accentColor: "var(--accent)" }}
            />
            Whole routine
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              cursor: weekDisabled ? "not-allowed" : "pointer",
              opacity: weekDisabled ? 0.4 : 1,
            }}
          >
            <input
              type="radio"
              name="routine-scope"
              value="week"
              checked={scope === "week"}
              disabled={weekDisabled}
              onChange={() => onScopeChange("week")}
              style={{ accentColor: "var(--accent)" }}
            />
            This week (Wk {pending.original.weekNumber ?? "?"})
          </label>
        </div>

        {/* Diff */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <DiffReview
            diffs={diffs}
            replacement={pending.replacement}
            onAccept={onAccept}
            onDiscard={onDiscard}
          />
        </div>

        {saveError && (
          <p style={{ margin: 0, padding: "4px 16px", fontSize: 12, color: "var(--bad)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ProgramDetailClient ───────────────────────────────────────────────────────

export function ProgramDetailClient({ id }: { id: string }) {
  const navigate = useNavigate();
  const { saveProgram } = useLocalData();

  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [activeWeek, setActiveWeek] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragDX, setDragDX] = useState(0);
  const [aiModalDay, setAiModalDay] = useState<ProgramDay | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [scope, setScope] = useState<"base" | "week">("base");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    programRepo.get(id).then(setProgram).catch(() => undefined);
  }, [id]);

  const displayAnalysis = useMemo(() => {
    if (!program) return null;
    const start = performance.now();
    const result = analyzeProgram(program);
    const durationMs = Math.round(performance.now() - start);
    return toDisplayAnalysis(result, durationMs);
  }, [program]);

  const weeks = useMemo(
    () => (program ? buildWeekGrid(getRenderableDays(program)) : []),
    [program],
  );

  // Pointer drag for week pager
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, dx: 0, dragging: false, width: 0 });

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
    dragRef.current = { startX: e.clientX, dx: 0, dragging: true, width: scrollerRef.current?.clientWidth ?? 375 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    dragRef.current.dx = e.clientX - dragRef.current.startX;
    setDragDX(dragRef.current.dx);
  }
  function onPointerUp() {
    if (!dragRef.current.dragging) return;
    const { dx, width } = dragRef.current;
    dragRef.current.dragging = false;
    setDragDX(0);
    if (Math.abs(dx) > width * 0.2) {
      setActiveWeek((w) => Math.max(0, Math.min(weeks.length - 1, w + (dx < 0 ? 1 : -1))));
    }
  }

  // ── Mutation helpers ────────────────────────────────────────────────────────

  function openConfirm(original: ProgramDay, replacement: ProgramDay) {
    setScope("base");
    setSaveError(null);
    setPendingChange({ original, replacement });
  }

  function buildDeleteDay(day: ProgramDay, sectionId: string, exId: string): ProgramDay {
    return {
      ...day,
      sections: day.sections.map((s) =>
        s.id !== sectionId ? s : {
          ...s,
          groups: s.groups
            .map((g) => ({ ...g, exercises: g.exercises.filter((e) => e.id !== exId) }))
            .filter((g) => g.exercises.length > 0),
        }
      ),
    };
  }

  function buildRenameDay(day: ProgramDay, sectionId: string, exId: string, name: string): ProgramDay {
    return {
      ...day,
      sections: day.sections.map((s) =>
        s.id !== sectionId ? s : {
          ...s,
          groups: s.groups.map((g) => ({
            ...g,
            exercises: g.exercises.map((e) => e.id === exId ? { ...e, name } : e),
          })),
        }
      ),
    };
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleAccept() {
    if (!pendingChange || !program) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { original, replacement } = pendingChange;
      let updated: ProgramDocument;
      if (scope === "base") {
        updated = { ...program, days: program.days.map((d) => d.id === replacement.id ? replacement : d) };
      } else {
        const override = {
          id: crypto.randomUUID(),
          scope: "week" as const,
          programId: program.id,
          weekNumber: original.weekNumber,
          replacement,
          reason: "Modified from routine view",
          createdAt: new Date().toISOString(),
        };
        updated = { ...program, overrides: [...program.overrides, override] };
      }
      await saveProgram(updated);
      setProgram(updated);
      setPendingChange(null);
    } catch (e) {
      setSaveError("Failed to save changes. Please try again.");
      console.error("[RoutineV2] save failed", e);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!program) return <p className="muted">Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 12px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Link
            to="/programs"
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textDecoration: "none" }}
          >
            <ChevronLeft size={12} /> Routines
          </Link>
          <span style={{ flex: 1 }} />
          <Link to={`/programs/${id}/map`} className="btn ghost" style={{ padding: "3px 8px", fontSize: 10.5 }}>
            <Map size={11} aria-hidden /> Map
          </Link>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{program.title}</div>
        {program.description && (
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 1 }}>{program.description}</div>
        )}
        {displayAnalysis && (
          <div style={{ marginTop: 8 }}>
            <RoutineAnalysisCard analysis={displayAnalysis} onOpenPrompt={() => setPromptOpen(true)} />
          </div>
        )}
      </div>

      {/* Week tabs */}
      <WeekTabStrip weeks={weeks} activeWeek={activeWeek} onSelect={setActiveWeek} />

      {/* Week panels */}
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      >
        <div
          style={{
            height: "100%",
            transform: `translateX(${dragDX}px)`,
            transition: dragDX ? "none" : "transform .25s cubic-bezier(.2,.7,.3,1)",
          }}
        >
          {weeks[activeWeek] && (
            <div
              key={weeks[activeWeek].weekNumber}
              style={{ width: "100%", height: "100%", overflowY: "auto", overflowX: "hidden", padding: "10px 12px 14px" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Week {weeks[activeWeek].weekNumber}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
                  {weeks[activeWeek].days.filter((d) => d.sections.length > 0).length} training days
                </span>
              </div>
              {weeks[activeWeek].days.map((day) => (
                <DayCard
                  key={day.id}
                  day={day}
                  expanded={!!expanded[day.id]}
                  onToggle={() => setExpanded((s) => ({ ...s, [day.id]: !s[day.id] }))}
                  onSwapEx={(exId) => setReplaceTarget({ kind: "swap", day, exId })}
                  onAiEx={() => setAiModalDay(day)}
                  onDeleteEx={(sectionId, exId) => openConfirm(day, buildDeleteDay(day, sectionId, exId))}
                  onAddEx={(sectionId) => setReplaceTarget({ kind: "add", day, sectionId })}
                  onCommitName={(sectionId, exId, name) => openConfirm(day, buildRenameDay(day, sectionId, exId, name))}
                  onModifyDay={() => setAiModalDay(day)}
                  onStart={() => navigate(`/programs/${id}/log`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sheets + modals */}
      {aiModalDay && (
        <ModifyAiModal
          currentDay={aiModalDay}
          programId={id}
          onApply={(replacement) => { setAiModalDay(null); openConfirm(aiModalDay, replacement); }}
          onClose={() => setAiModalDay(null)}
        />
      )}

      {replaceTarget && (
        <ExerciseReplaceSheet
          onSelect={(item: ExerciseCatalogItem) => {
            const { day } = replaceTarget;
            const replacement =
              replaceTarget.kind === "swap"
                ? swapExercise(day, replaceTarget.exId, item)
                : addExercise(day, replaceTarget.sectionId, item);
            setReplaceTarget(null);
            openConfirm(day, replacement);
          }}
          onClose={() => setReplaceTarget(null)}
        />
      )}

      {pendingChange && (
        <RoutineConfirmModal
          pending={pendingChange}
          scope={scope}
          onScopeChange={setScope}
          onAccept={handleAccept}
          onDiscard={() => { setPendingChange(null); setSaveError(null); }}
          saveError={saveError}
        />
      )}

      {displayAnalysis && (
        <LlmAnalysisSheet
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          analysis={displayAnalysis}
          programTitle={program.title}
        />
      )}
    </div>
  );
}
