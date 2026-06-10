"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Map, Sparkles } from "lucide-react";
import { getRenderableDays } from "@/lib/programs/overrides";
import { buildWeekGrid } from "@/lib/workout/programGrid";
import { sectionKind } from "@/lib/workout/sectionKind";
import { programRepo } from "@/lib/storage/programRepo";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { RoutineAnalysisCard } from "@/components/analysis/RoutineAnalysisCard";
import { LlmAnalysisSheet } from "@/components/analysis/LlmAnalysisSheet";
import { ModifyAiModal } from "./ModifyAiModal";
import { GroupRail } from "./GroupRail";
import type { WorkoutLogDocument, ProgramDay, ProgramDocument, ProgramSection } from "@/lib/programs/types";
import { logRepo } from "@/lib/storage/logRepo";
import { storePendingDiff } from "@/lib/workout/pendingDiff";

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

// ── getDayBadge ───────────────────────────────────────────────────────────────

function getDayBadge(
  dayId: string,
  logs: WorkoutLogDocument[],
): { symbol: string; color: string } | null {
  const dayLogs = logs.filter((l) => l.dayId === dayId);
  if (dayLogs.length === 0) return null;
  const latest = [...dayLogs].sort((a, b) =>
    (b.completedAt ?? b.performedAt).localeCompare(a.completedAt ?? a.performedAt)
  )[0];
  if (latest.skippedAt) return { symbol: "~", color: "var(--warn)" };
  if (latest.completedAt) return { symbol: "●", color: "var(--good)" };
  return { symbol: "·", color: "var(--fg-4)" };
}

// ── ExerciseRowReadOnly ───────────────────────────────────────────────────────

function ExerciseRowReadOnly({
  exercise,
  index,
  last,
}: {
  exercise: ProgramDay["sections"][0]["groups"][0]["exercises"][0];
  index: string;
  last: boolean;
}) {
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
        <span style={{ fontSize: 12.5, fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {exercise.name}
        </span>
        {prescription && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)", marginTop: 1 }}>
            {prescription}
            {exercise.rest && <span style={{ color: "var(--fg-4)", marginLeft: 6 }}>rest {exercise.rest}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DayCard ───────────────────────────────────────────────────────────────────

function DayCard({
  day,
  badge,
  expanded,
  onToggle,
  onModifyDay,
  onStart,
}: {
  day: ProgramDay;
  badge: { symbol: string; color: string } | null;
  expanded: boolean;
  onToggle: () => void;
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
        background: "var(--bg-1)", border: "1px solid var(--line)",
        borderLeft: "3px solid var(--line)", borderRadius: "var(--r)",
        marginBottom: 8, overflow: "hidden", opacity: isRest ? 0.65 : 1,
      }}
    >
      <div
        onClick={() => !isRest && onToggle()}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", cursor: isRest ? "default" : "pointer" }}
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
          {isRest && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)" }}>rest</div>}
        </div>
        {badge && <span style={{ fontSize: 13, color: badge.color, flexShrink: 0 }}>{badge.symbol}</span>}
        {!isRest && <span style={{ color: "var(--fg-3)", fontSize: 12 }}>{expanded ? "▾" : "▸"}</span>}
      </div>

      {expanded && !isRest && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {day.sections.map((section, si) => (
            <div key={section.id}>
              <SectionHeader section={section} />
              {section.groups.map((group, gi) => (
                <GroupRail key={group.id} type={group.type} notes={group.notes} density="compact">
                  {group.exercises.map((ex, ei) => (
                    <ExerciseRowReadOnly
                      key={ex.id}
                      exercise={ex}
                      index={`${si + 1}.${ei + 1}`}
                      last={gi === section.groups.length - 1 && ei === group.exercises.length - 1}
                    />
                  ))}
                </GroupRail>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, padding: 8, background: "var(--bg-2)", borderTop: "1px solid var(--line)" }}>
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
              aria-label="View →"
            >
              View →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProgramDetailClient ───────────────────────────────────────────────────────

export function ProgramDetailClient({ id }: { id: string }) {
  const navigate = useNavigate();

  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [activeWeek, setActiveWeek] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragDX, setDragDX] = useState(0);
  const [aiModalDay, setAiModalDay] = useState<ProgramDay | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [logs, setLogs] = useState<WorkoutLogDocument[]>([]);

  useEffect(() => {
    programRepo.get(id).then(setProgram).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!program) return;
    logRepo.listForProgram(program.id).then(setLogs).catch(() => undefined);
  }, [program?.id]);

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
  const dragRef = useRef({ startX: 0, dx: 0, dragging: false, width: 0, captured: false });

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
    // Don't capture the pointer yet: capturing on pointerdown retargets the
    // eventual `click` to this scroller, swallowing taps on day cards.
    // Capture only once real horizontal movement makes this a drag.
    dragRef.current = { startX: e.clientX, dx: 0, dragging: true, width: scrollerRef.current?.clientWidth ?? 375, captured: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    if (!dragRef.current.captured) {
      if (Math.abs(dx) < 8) return; // still a tap, leave clicks alone
      dragRef.current.captured = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    dragRef.current.dx = dx;
    setDragDX(dx);
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
                  badge={getDayBadge(day.id, logs)}
                  expanded={!!expanded[day.id]}
                  onToggle={() => setExpanded((s) => ({ ...s, [day.id]: !s[day.id] }))}
                  onModifyDay={() => setAiModalDay(day)}
                  onStart={() => navigate(`/programs/${id}/days/${day.id}`)}
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
          onApply={(replacement) => {
            const stored = storePendingDiff(id, aiModalDay, { ...replacement, weekNumber: aiModalDay.weekNumber });
            if (!stored) { alert("Unable to store changes. Please try again."); return; }
            setAiModalDay(null);
            navigate(`/programs/${id}/diff`);
          }}
          onClose={() => setAiModalDay(null)}
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
