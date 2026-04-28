"use client";

import { useCallback, useState } from "react";
import { Download, Plus } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { SetCell } from "./SetCell";
import type { ProgramDocument, ProgramDay, ProgramSection } from "@/lib/programs/types";

// Map section type → CSS class and glyph
const sectionKind = (type: string): { cls: string; glyph: string } => {
  const t = type.toLowerCase();
  if (t.includes("warm")) return { cls: "sec-warmup", glyph: "◐" };
  if (t.includes("explos")) return { cls: "sec-explosive", glyph: "◆" };
  if (t.includes("strength") || t.includes("power")) return { cls: "sec-strength", glyph: "■" };
  if (t.includes("metcon") || t.includes("cardio") || t.includes("cond")) return { cls: "sec-metcon", glyph: "◇" };
  if (t.includes("hypert") || t.includes("accessory") || t.includes("isolation")) return { cls: "sec-hypertrophy", glyph: "●" };
  if (t.includes("rehab") || t.includes("cool") || t.includes("mobil")) return { cls: "sec-rehab", glyph: "+" };
  return { cls: "sec-default", glyph: "·" };
};

// Freeform cell state tracked per (exerciseId, setIndex)
type CellMap = Record<string, string[]>;

function exCellKey(exerciseId: string) {
  return exerciseId;
}

function GroupRail({
  type,
  label,
  children,
}: {
  type: string;
  label?: string;
  children: React.ReactNode;
}) {
  if (type === "single") return <div>{children}</div>;
  const kindLabel =
    { superset: "SUPERSET", circuit: "CIRCUIT", "giant-set": "GIANT SET" }[type] ??
    type.toUpperCase();
  return (
    <div style={{ position: "relative", paddingLeft: 14, paddingTop: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.14em",
          color: "var(--fg-3)",
          textTransform: "uppercase",
          padding: "6px 10px 4px",
        }}
      >
        <span style={{ width: 8, height: 1, background: "var(--line-2)" }} />
        <span>
          {kindLabel}
          {label ? ` · ${label}` : ""}
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      {/* vertical bracket */}
      <div
        style={{
          position: "absolute",
          left: 6,
          top: 26,
          bottom: 12,
          width: 2,
          background: "var(--line-2)",
          borderRadius: 1,
        }}
      />
      <div>{children}</div>
    </div>
  );
}

function ExerciseRow({
  exercise,
  cells,
  onCellChange,
  onAddSet,
}: {
  exercise: { id: string; name: string; sets?: number; reps?: string; load?: string; rest?: string; notes?: string };
  cells: string[];
  onCellChange: (i: number, v: string) => void;
  onAddSet: () => void;
}) {
  const prescription = [
    exercise.sets ? `${exercise.sets}×` : "",
    exercise.reps ?? "",
    exercise.load ?? "",
    exercise.rest ? `rest ${exercise.rest}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg-1)",
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)", marginBottom: 2 }}>
          {exercise.name}
        </div>
        {prescription && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
            {prescription}
          </div>
        )}
        {exercise.notes && (
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              fontFamily: "var(--font-mono)",
              marginTop: 3,
            }}
          >
            <span style={{ color: "var(--fg-4)" }}>note</span>{" "}
            <span>{exercise.notes}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {cells.map((val, i) => (
          <SetCell key={i} value={val} onChange={(v) => onCellChange(i, v)} />
        ))}
        <button
          className="cell empty"
          onClick={onAddSet}
          style={{
            minWidth: 28,
            width: 28,
            padding: 0,
            cursor: "pointer",
            color: "var(--fg-3)",
            border: "1px dashed var(--line)",
          }}
          title="Add set"
          aria-label="Add set"
        >
          <Plus size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  cells,
  onCellChange,
  onAddSet,
}: {
  section: ProgramSection;
  cells: CellMap;
  onCellChange: (exId: string, i: number, v: string) => void;
  onAddSet: (exId: string) => void;
}) {
  const { cls, glyph } = sectionKind(section.type);
  return (
    <div
      className={cls}
      style={{
        borderLeft: "3px solid var(--sec)",
        marginBottom: 12,
        background: "var(--bg-1)",
        borderRadius: "var(--r)",
        overflow: "hidden",
      }}
    >
      {/* section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span style={{ color: "var(--sec)", fontSize: 14, lineHeight: 1 }}>{glyph}</span>
        <span
          className="tx-up"
          style={{ color: "var(--fg-2)", fontWeight: 600, flex: 1 }}
        >
          {section.name}
        </span>
      </div>

      {/* groups */}
      {section.groups.map((group) => (
        <GroupRail key={group.id} type={group.type}>
          {group.exercises.map((ex) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              cells={cells[exCellKey(ex.id)] ?? [""]}
              onCellChange={(i, v) => onCellChange(ex.id, i, v)}
              onAddSet={() => onAddSet(ex.id)}
            />
          ))}
        </GroupRail>
      ))}
    </div>
  );
}

function WorkoutProgress({ cells }: { cells: CellMap }) {
  let total = 0;
  let done = 0;
  for (const vals of Object.values(cells)) {
    for (const v of vals) {
      total++;
      if (v) done++;
    }
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 4,
        background: "var(--bg-1)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ height: 2, background: "var(--bg-3)", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "var(--accent)",
            transition: "width .3s",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)" }}>
          {done}/{total} <span style={{ color: "var(--fg-4)" }}>· {pct}%</span>
        </span>
      </div>
    </div>
  );
}

function buildInitialCells(day: ProgramDay): CellMap {
  const map: CellMap = {};
  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        const setCount = ex.sets ?? 3;
        map[exCellKey(ex.id)] = Array(setCount).fill("");
      }
    }
  }
  return map;
}

function TodayWorkout({ program, day }: { program: ProgramDocument; day: ProgramDay }) {
  const storageKey = `trainer-today-${program.id}-${day.id}`;

  const [cells, setCells] = useState<CellMap>(() => {
    if (typeof window === "undefined") return buildInitialCells(day);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as CellMap;
    } catch {
      // ignore
    }
    return buildInitialCells(day);
  });

  const save = useCallback(
    (next: CellMap) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  const handleCellChange = (exId: string, i: number, v: string) => {
    setCells((prev) => {
      const next = { ...prev, [exId]: [...(prev[exId] ?? [])] };
      next[exId][i] = v;
      save(next);
      return next;
    });
  };

  const handleAddSet = (exId: string) => {
    setCells((prev) => {
      const next = { ...prev, [exId]: [...(prev[exId] ?? []), ""] };
      save(next);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Day header */}
      <div
        style={{
          padding: "12px 0 16px",
          borderBottom: "1px solid var(--line)",
          marginBottom: 12,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--fg-3)",
            margin: "0 0 4px",
          }}
        >
          {program.title}
        </p>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            margin: 0,
            color: "var(--fg)",
          }}
        >
          {day.title}
        </h1>
        <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "4px 0 0", fontFamily: "var(--font-mono)" }}>
          {day.sections.length} sections ·{" "}
          {day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0)}{" "}
          exercises
        </p>
      </div>

      {/* Sections */}
      {day.sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          cells={cells}
          onCellChange={handleCellChange}
          onAddSet={handleAddSet}
        />
      ))}

      <WorkoutProgress cells={cells} />
    </div>
  );
}

export function TodayClient() {
  const { programs, loading, seedDemo } = useLocalData();
  const activeProgram = programs.find((p) => p.active) ?? programs[0];
  const day = activeProgram?.days[0];

  if (loading) {
    return (
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading…
      </p>
    );
  }

  if (!activeProgram || !day) {
    return (
      <div className="panel stack">
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Today</h1>
        <p style={{ color: "var(--fg-3)" }}>
          Import a program or seed the demo to start logging locally.
        </p>
        <button className="button" onClick={seedDemo}>
          <Download size={18} aria-hidden /> Seed demo program
        </button>
      </div>
    );
  }

  return <TodayWorkout program={activeProgram} day={day} />;
}
