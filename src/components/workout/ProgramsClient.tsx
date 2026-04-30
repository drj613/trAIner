"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
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
        <div className="flex gap-2">
          <Link href="/programs/new" className="button">
            <Plus size={14} /> New
          </Link>
          <button type="button" className="button secondary" onClick={seedDemo}>
            Seed Demo
          </button>
        </div>
      </div>
      {programs.length === 0 && (
        <Link
          href="/programs/new"
          className="panel flex items-center justify-center gap-2 py-6 border-dashed muted"
        >
          <Plus size={16} /> Build a routine from scratch
        </Link>
      )}
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
