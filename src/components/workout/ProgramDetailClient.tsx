"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRenderableDays } from "@/lib/programs/overrides";
import type { ProgramDocument } from "@/lib/programs/types";
import { programRepo } from "@/lib/storage/programRepo";
import { WorkoutView } from "./WorkoutView";

export function ProgramDetailClient({ id }: { id: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();

  useEffect(() => {
    programRepo.get(id).then(setProgram).catch(() => undefined);
  }, [id]);

  if (!program) return <p className="muted">Program not found locally.</p>;

  const days = getRenderableDays(program);

  return (
    <div className="stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{program.title}</h1>
          <p className="muted">{days.length} rendered day(s)</p>
        </div>
        <div className="flex gap-2">
          <Link className="button secondary" href={`/programs/${id}/edit`}>
            Edit
          </Link>
          <Link className="button" href={`/programs/${id}/log`}>
            Log
          </Link>
        </div>
      </div>
      {days.map((day) => (
        <WorkoutView key={day.id} program={program} day={day} />
      ))}
    </div>
  );
}
