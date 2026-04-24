"use client";

import { useEffect, useState } from "react";
import type { ProgramDocument } from "@/lib/programs/types";
import { programRepo } from "@/lib/storage/programRepo";

export function EditClient({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    programRepo.get(programId).then(setProgram).catch(() => undefined);
  }, [programId]);

  async function addDayOverride() {
    if (!program) return;
    const day = program.days[0];
    await programRepo.save({
      ...program,
      overrides: [
        ...program.overrides,
        {
          id: crypto.randomUUID(),
          scope: "day",
          programId: program.id,
          dayId: day.id,
          replacement: { ...day, title: `${day.title} (Modified)` },
          reason: "Local day substitution",
          createdAt: new Date().toISOString()
        }
      ]
    });
    setMessage("Day-only override saved without mutating the base day.");
  }

  return (
    <div className="stack">
      <h1 className="text-2xl font-bold">Edit Scope</h1>
      <p className="muted">Base edits update the program. Week and day edits are stored as overrides.</p>
      <button className="button" onClick={addDayOverride} disabled={!program}>
        Add Day Override
      </button>
      {message ? <p className="font-bold text-[var(--accent-strong)]">{message}</p> : null}
    </div>
  );
}
