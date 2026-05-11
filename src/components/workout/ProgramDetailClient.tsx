"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Map } from "lucide-react";
import { getRenderableDays } from "@/lib/programs/overrides";
import type { ProgramDocument } from "@/lib/programs/types";
import { programRepo } from "@/lib/storage/programRepo";
import { WorkoutView } from "./WorkoutView";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { RoutineAnalysisCard } from "@/components/analysis/RoutineAnalysisCard";
import { LlmAnalysisSheet } from "@/components/analysis/LlmAnalysisSheet";

export function ProgramDetailClient({ id }: { id: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();
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

  if (!program) return <p className="muted">Program not found locally.</p>;

  const days = getRenderableDays(program);

  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Link
          to="/programs"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-3)",
            textDecoration: "none",
          }}
        >
          <ChevronLeft size={12} /> Routines
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{program.title}</h1>
          <p className="muted">{days.length} rendered {days.length === 1 ? "day" : "days"}</p>
        </div>
        <div className="flex gap-2">
          <Link className="button secondary" to={`/programs/${id}/edit`}>
            Edit
          </Link>
          <Link
            to={`/programs/${id}/map`}
            className="button"
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <Map size={14} aria-hidden />
            Map
          </Link>
          <Link className="button" to={`/programs/${id}/log`}>
            Start today →
          </Link>
        </div>
      </div>
      {displayAnalysis && (
        <>
          <RoutineAnalysisCard
            analysis={displayAnalysis}
            onOpenPrompt={() => setPromptOpen(true)}
          />
          <LlmAnalysisSheet
            open={promptOpen}
            onClose={() => setPromptOpen(false)}
            analysis={displayAnalysis}
            programTitle={program.title}
          />
        </>
      )}

      {days.map((day) => (
        <WorkoutView key={day.id} program={program} day={day} />
      ))}
    </div>
  );
}
