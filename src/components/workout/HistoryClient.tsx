"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { logRepo } from "@/lib/storage/logRepo";
import { toTitleCase } from "@/lib/catalog/normalize";
import { formatSetLabel, setVolume } from "@/lib/workout/historyUtils";
import { logLocalDate } from "@/lib/workout/localDate";
import type { WorkoutLogDocument, WorkoutSetLog } from "@/lib/programs/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type ExerciseSummary = {
  exerciseId: string;
  name: string;
  sessions: number;
  lastDate: string;
  lastSets: string[];
  best: string;
  trend: "up" | "flat" | "down";
  volumes: number[];
};

// ─── Format ──────────────────────────────────────────────────────────────────

function formatSet(s: WorkoutSetLog): string {
  return formatSetLabel(s, "×");
}

function deriveTrend(volumes: number[]): "up" | "flat" | "down" {
  if (volumes.length < 3) return "flat";
  const recent = volumes.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const prior = volumes.slice(-6, -3);
  if (prior.length === 0) return "flat";
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (avg > priorAvg * 1.03) return "up";
  if (avg < priorAvg * 0.97) return "down";
  return "flat";
}

export function aggregateLogs(logs: WorkoutLogDocument[]): ExerciseSummary[] {
  const byExercise = new Map<string, { name: string; sessions: { date: string; sets: WorkoutSetLog[] }[] }>();

  for (const log of logs) {
    const date = logLocalDate(log);
    for (const entry of log.entries) {
      const key = entry.canonicalExerciseId ?? entry.exerciseId;
      if (!byExercise.has(key)) {
        byExercise.set(key, { name: entry.exerciseName ?? entry.exerciseId, sessions: [] });
      }
      byExercise.get(key)!.sessions.push({ date, sets: entry.sets });
    }
  }

  const summaries: ExerciseSummary[] = [];
  for (const [id, data] of byExercise.entries()) {
    const sorted = [...data.sessions].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const lastSets = last?.sets.map(formatSet).filter(Boolean) ?? [];
    const volumes = sorted.map((s) => s.sets.reduce((sum, st) => sum + setVolume(st), 0));
    const allSets = sorted.flatMap((s) => s.sets);
    const bestVol = Math.max(...allSets.map(setVolume), 0);
    const bestSet = allSets.find((s) => setVolume(s) === bestVol);
    const best = bestSet ? formatSet(bestSet) : "—";

    summaries.push({
      exerciseId: id,
      name: data.name,
      sessions: sorted.length,
      lastDate: last?.date.slice(5).replace("-", "/") ?? "—",
      lastSets,
      best,
      trend: deriveTrend(volumes),
      volumes,
    });
  }

  return summaries.sort((a, b) => b.sessions - a.sessions);
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function MiniSpark({ nums, stale = false }: { nums: number[]; stale?: boolean }) {
  if (nums.length < 2) return null;
  const w = 56;
  const h = 14;
  const max = Math.max(...nums, 1);
  const min = Math.min(...nums, 0);
  const range = max - min || 1;
  const pts = nums
    .map((v, i) => {
      const x = (i / Math.max(nums.length - 1, 1)) * (w - 2) + 1;
      const y = h - 1 - ((v - min) / range) * (h - 3);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = stale ? "var(--fg-4)" : "var(--fg-3)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0 }}>
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrendArrow({ dir }: { dir: "up" | "flat" | "down" }) {
  const map = {
    up: { color: "var(--good)", char: "↑" },
    down: { color: "var(--bad)", char: "↓" },
    flat: { color: "var(--fg-4)", char: "→" },
  };
  const m = map[dir];
  return (
    <span style={{ color: m.color, fontFamily: "var(--font-mono)", fontSize: 11 }}>{m.char}</span>
  );
}

// ─── Exercise detail ──────────────────────────────────────────────────────────

function ExerciseDetail({
  ex,
  onBack,
}: {
  ex: ExerciseSummary;
  onBack: () => void;
}) {
  const months = ex.volumes.slice(-6).map((_, i, arr) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (arr.length - 1 - i));
    return d.toLocaleString("default", { month: "short" });
  });
  const maxV = Math.max(...ex.volumes, 1);

  return (
    <div>
      <button
        className="btn ghost"
        onClick={onBack}
        style={{ marginBottom: 10, padding: "4px 8px" }}
      >
        <ChevronLeft size={12} /> History index
      </button>

      <div style={{ marginBottom: 14 }}>
        <h2
          style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--fg)" }}
        >
          {toTitleCase(ex.name)}
        </h2>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-3)",
            marginTop: 2,
            display: "flex",
            gap: 6,
          }}
        >
          <span>{ex.sessions} sessions</span>
          <span style={{ color: "var(--line-2)" }}>·</span>
          <span>last {ex.lastDate}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}
      >
        {[
          { lbl: "best", v: ex.best, accent: true },
          { lbl: "last", v: ex.lastSets[0] ?? "—" },
          { lbl: "trend", v: ex.trend },
        ].map((s) => (
          <div
            key={s.lbl}
            style={{
              padding: "8px 10px",
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r)",
            }}
          >
            <div className="tx-up">{s.lbl}</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: s.accent ? "var(--accent)" : "var(--fg)",
                fontWeight: 500,
                marginTop: 2,
              }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* Volume bars */}
      {ex.volumes.length >= 2 && (
        <div
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r)",
            padding: 12,
            marginBottom: 12,
          }}
        >
          <span className="tx-up" style={{ marginBottom: 8, display: "block" }}>
            session volume
          </span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${months.length}, 1fr)`,
              gap: 6,
              alignItems: "end",
              height: 80,
            }}
          >
            {ex.volumes.slice(-6).map((v, i, arr) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${(v / maxV) * 70}px`,
                    background:
                      i === arr.length - 1 ? "var(--accent)" : "var(--line-2)",
                    borderRadius: 1,
                    opacity: i === arr.length - 1 ? 1 : 0.7,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--fg-3)",
                  }}
                >
                  {months[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          padding: 12,
          background: "var(--bg-2)",
          border: "1px dashed var(--line-2)",
          borderRadius: "var(--r)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
          lineHeight: 1.6,
        }}
      >
        <span className="tx-up" style={{ display: "block", marginBottom: 4 }}>
          placeholder
        </span>
        Full session log table, set-by-set breakdown, PR timeline, and RPE annotations coming soon.
      </div>
    </div>
  );
}

// ─── Filter chips ──────────────────────────────────────────────────────────

const FILTERS = ["all", "recent", "stale"] as const;
type Filter = (typeof FILTERS)[number];

const SORTS = [
  { id: "sessions", label: "#" },
  { id: "name", label: "a-z" },
  { id: "trend", label: "trend" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HistoryClient() {
  const [logs, setLogs] = useState<WorkoutLogDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("sessions");
  const [detail, setDetail] = useState<ExerciseSummary | null>(null);

  useEffect(() => {
    logRepo
      .list()
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const exercises = useMemo(() => aggregateLogs(logs), [logs]);

  const filtered = useMemo(() => {
    let rows = exercises;
    if (filter === "recent") rows = rows.filter((e) => e.sessions > 3);
    if (filter === "stale") rows = rows.filter((e) => e.sessions <= 3);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      rows = rows.filter((e) => e.name.toLowerCase().includes(qq));
    }
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "trend") return (b.trend === "up" ? 1 : 0) - (a.trend === "up" ? 1 : 0);
      return b.sessions - a.sessions;
    });
  }, [exercises, filter, sort, q]);

  if (detail) {
    return <ExerciseDetail ex={detail} onBack={() => setDetail(null)} />;
  }

  if (loading) {
    return (
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading history…
      </p>
    );
  }

  if (exercises.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          color: "var(--fg-3)",
        }}
      >
        <div style={{ fontSize: 14, color: "var(--fg-2)", marginBottom: 6 }}>No history yet</div>
        <div style={{ fontSize: 12 }}>Log a workout from the Today screen to start tracking.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
          History
        </h1>
        <span
          className="tx-mono"
          style={{ fontSize: 11, color: "var(--fg-3)" }}
        >
          {exercises.length} exercises · {logs.length} sessions
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Tap an exercise to see all sessions.
      </p>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          padding: "6px 10px",
          marginBottom: 8,
        }}
      >
        <Search size={13} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter exercises…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg)",
            fontSize: 13,
          }}
        />
        {q && (
          <button className="btn ghost" onClick={() => setQ("")} style={{ padding: "2px 4px" }}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flexShrink: 0,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${filter === f ? "var(--accent)" : "var(--line)"}`,
              background: filter === f ? "var(--accent-soft)" : "transparent",
              color: filter === f ? "var(--accent)" : "var(--fg-2)",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span>sort</span>
        {SORTS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSort(id as Sort)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              fontFamily: "inherit",
              fontSize: 10,
              color: sort === id ? "var(--accent)" : "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {sort === id && "·"} {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          background: "var(--bg-2)",
          overflow: "hidden",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--fg-3)" }}>
            no matches
          </div>
        ) : (
          filtered.map((ex, i) => (
            <button
              key={ex.exerciseId}
              onClick={() => setDetail(ex)}
              style={{
                width: "100%",
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 6,
                padding: "10px 12px",
                borderBottom:
                  i < filtered.length - 1 ? "1px solid var(--line)" : "none",
                background: "transparent",
                color: "var(--fg)",
                cursor: "pointer",
                border: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                transition: "background .1s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 3,
                  }}
                >
                  <span>{toTitleCase(ex.name)}</span>
                  <TrendArrow dir={ex.trend} />
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--fg-3)",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <span>{ex.sessions} sessions</span>
                  <span style={{ color: "var(--fg-4)" }}>last {ex.lastDate}</span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ex.lastSets.slice(0, 3).join(" ")}
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <MiniSpark nums={ex.volumes} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--accent)",
                  }}
                >
                  {ex.best}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
