"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { programRepo } from "@/lib/storage/programRepo";
import { getRenderableDays } from "@/lib/programs/overrides";
import { buildWeekGrid } from "@/lib/workout/programGrid";
import type { ProgramDocument, ProgramDay } from "@/lib/programs/types";

function sectionDot(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("warm")) return "#74b3ff";
  if (t.includes("strength") || t.includes("power")) return "var(--accent)";
  if (t.includes("hypert") || t.includes("access")) return "#c5a3ff";
  if (t.includes("metcon") || t.includes("cardio")) return "#e6b664";
  if (t.includes("rehab") || t.includes("cool")) return "#7fc77a";
  return "var(--fg-4)";
}

function DayCell({ day, programId }: { day: ProgramDay; programId: string }) {
  const isRest = day.sections.length === 0;

  if (isRest) {
    return (
      <div style={{
        padding: "10px 12px", background: "var(--bg-2)", border: "1px solid var(--line)",
        borderRadius: "var(--r)", minHeight: 68, display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          rest
        </span>
      </div>
    );
  }

  return (
    <Link
      to={`/programs/${programId}?day=${day.id}`}
      aria-label={`Go to ${day.title} — ${day.sections.length} section${day.sections.length !== 1 ? "s" : ""}`}
      style={{
        display: "block", padding: "10px 12px", background: "var(--bg-2)",
        border: "1px solid var(--line)", borderRadius: "var(--r)", minHeight: 68,
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
        {day.sections.slice(0, 6).map((s) => (
          <span key={s.id} title={s.name} style={{
            width: 6, height: 6, borderRadius: "50%", background: sectionDot(s.type), flexShrink: 0,
          }} />
        ))}
        {day.sections.length > 6 && (
          <span style={{ fontSize: 9, color: "var(--fg-4)", fontFamily: "var(--font-mono)", alignSelf: "center" }}>
            +{day.sections.length - 6}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3 }}>
        {day.title}
      </div>
      <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
        {day.sections.length} section{day.sections.length !== 1 ? "s" : ""}
        {" · "}
        {day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0)} ex
      </div>
    </Link>
  );
}

export function ProgramMapClient({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    programRepo.get(programId)
      .then(setProgram)
      .catch((e) => {
        console.error("[programMap] failed to load program", e);
        setError("Failed to load program. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) {
    return <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading program map…</p>;
  }

  if (error) {
    return <div className="panel"><p style={{ color: "var(--fg-error, red)" }}>{error}</p></div>;
  }

  if (!program) {
    return <div className="panel"><p style={{ color: "var(--fg-3)" }}>Program not found.</p></div>;
  }

  const renderableDays = getRenderableDays(program);
  const grid = buildWeekGrid(renderableDays);
  const maxDaysInWeek = grid.reduce((m, w) => Math.max(m, w.days.length), 1);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Program map
        </p>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
          {program.title}
        </h1>
        <p style={{ margin: "4px 0 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          {grid.length} week{grid.length !== 1 ? "s" : ""} · {renderableDays.length} training days
        </p>
      </div>
      {grid.map((week) => (
        <div key={week.weekNumber} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Week {week.weekNumber}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${maxDaysInWeek}, 1fr)`, gap: 8 }}>
            {week.days.map((day) => (
              <DayCell key={day.id} day={day} programId={programId} />
            ))}
            {Array.from({ length: maxDaysInWeek - week.days.length }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
