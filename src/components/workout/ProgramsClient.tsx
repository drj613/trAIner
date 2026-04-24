"use client";

import Link from "next/link";
import { useLocalData } from "@/components/app/LocalDataProvider";

export function ProgramsClient() {
  const { programs, loading, seedDemo } = useLocalData();

  if (loading) return <p className="muted">Loading programs...</p>;

  return (
    <div className="stack">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programs</h1>
          <p className="muted">Saved locally in IndexedDB.</p>
        </div>
        <button className="button secondary" onClick={seedDemo}>
          Seed Demo
        </button>
      </div>
      {programs.map((program) => (
        <Link key={program.id} href={`/programs/${program.id}`} className="panel stack">
          <h2 className="text-lg font-bold">{program.title}</h2>
          <p className="muted">
            {program.days.length} day(s) · {program.overrides.length} override(s)
          </p>
        </Link>
      ))}
    </div>
  );
}
