"use client";

import Link from "next/link";
import { Download, Play } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { WorkoutView } from "./WorkoutView";

export function TodayClient() {
  const { programs, loading, seedDemo } = useLocalData();
  const activeProgram = programs.find((program) => program.active) ?? programs[0];
  const day = activeProgram?.days[0];

  if (loading) return <p className="muted">Loading local data...</p>;

  if (!activeProgram || !day) {
    return (
      <div className="panel stack">
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="muted">Import a program or seed the demo to start logging locally.</p>
        <button className="button" onClick={seedDemo}>
          <Download size={18} /> Seed Demo
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="muted">Offline-ready once saved on this device.</p>
        </div>
        <Link className="button" href={`/programs/${activeProgram.id}/log`}>
          <Play size={18} /> Log
        </Link>
      </div>
      <WorkoutView program={activeProgram} day={day} />
    </div>
  );
}
