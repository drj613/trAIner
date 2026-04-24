"use client";

import { useEffect, useState } from "react";
import { logRepo } from "@/lib/storage/logRepo";
import { programRepo } from "@/lib/storage/programRepo";
import type { ProgramDocument } from "@/lib/programs/types";

export function LogClient({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    programRepo.get(programId).then(setProgram).catch(() => undefined);
  }, [programId]);

  const day = program?.days[0];

  async function saveLog() {
    if (!program || !day) return;
    await logRepo.save({
      id: crypto.randomUUID(),
      programId: program.id,
      dayId: day.id,
      performedAt: new Date().toISOString(),
      entries: day.sections.flatMap((section) =>
        section.groups.flatMap((group) =>
          group.exercises.map((exercise) => ({
            exerciseId: exercise.id,
            canonicalExerciseId: exercise.canonicalExerciseId,
            sets: [{ setNumber: 1, reps: 0, weight: 0 }]
          }))
        )
      )
    });
    setMessage("Workout log saved locally.");
  }

  return (
    <div className="stack">
      <h1 className="text-2xl font-bold">Log Workout</h1>
      <p className="muted">{day ? day.title : "Program not found."}</p>
      {day?.sections.flatMap((section) =>
        section.groups.flatMap((group) =>
          group.exercises.map((exercise) => (
            <div key={exercise.id} className="panel grid grid-cols-[1fr_72px_72px] items-center gap-2">
              <span className="font-bold">{exercise.name}</span>
              <input className="input" inputMode="decimal" aria-label={`${exercise.name} weight`} placeholder="lb" />
              <input className="input" inputMode="numeric" aria-label={`${exercise.name} reps`} placeholder="reps" />
            </div>
          ))
        )
      )}
      <button className="button" onClick={saveLog}>
        Save Log
      </button>
      {message ? <p className="font-bold text-[var(--accent-strong)]">{message}</p> : null}
    </div>
  );
}
