"use client";
import { ProgressScreenStyles } from "../analysis/ProgressScreenStyles";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/app/PageHeader";
import { programRepo } from "@/lib/storage/programRepo";
import { getRenderableDays } from "@/lib/programs/overrides";
import { buildWeekGrid } from "@/lib/workout/programGrid";
import type { ProgramDocument, ProgramDay } from "@/lib/programs/types";

function DayCell({ day, programId }: { day: ProgramDay; programId: string }) {
  const isRest = day.sections.length === 0;

  if (isRest) {
    return (
      <div style={{
        padding: "10px 12px", background: "var(--bg-2)", border: "1px solid var(--line)",
        borderRadius: 8, minHeight: 68, display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 12, color: "var(--fg-3)", letterSpacing: "0.06em" }}>
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
        border: "1px solid var(--line)", borderRadius: 8, minHeight: 68,
        textDecoration: "none",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3 }}>
        {day.title} <span aria-hidden>→</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--fg-3)" }}>
        {day.sections.length} section{day.sections.length !== 1 ? "s" : ""}
        <br />
        {day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0)} exercises
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
    return <p style={{ color: "var(--fg-3)", fontSize: 12 }}>Loading program map…</p>;
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
    <div className="progress-screen">
      <ProgressScreenStyles />
      <PageHeader title={program.title} description={`Routine map · ${grid.length} weeks · ${renderableDays.filter((day) => day.sections.length > 0).length} training days`} action={<Link className="button secondary" to={`/programs/${programId}`}>View routine</Link>} />
      {grid.map((week) => (
        <div key={week.weekNumber} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--fg-3)", letterSpacing: "0.08em" }}>
            Week {week.weekNumber}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(maxDaysInWeek, 3)}, minmax(0, 1fr))`, gap: 8 }}>
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
