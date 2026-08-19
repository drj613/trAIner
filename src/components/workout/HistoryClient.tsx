"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import { ExerciseCorrectionSheet, type CorrectionTarget } from "@/components/catalog/ExerciseCorrectionSheet";
import { logRepo } from "@/lib/storage/logRepo";
import { toTitleCase } from "@/lib/catalog/normalize";
import {
  projectExerciseHistory,
  type FamilyHistorySummary,
  type VersionHistorySummary,
} from "@/lib/workout/historyProjection";
import { textOf } from "@/lib/workout/historyUtils";
import type { WorkoutLogDocument } from "@/lib/programs/types";
import { HistoryWorkoutList, countEntries, formatSessionDate, groupByWorkout } from "./HistoryRows";

/**
 * All-time history, read entirely through the shared projection.
 *
 * The page used to aggregate logs itself (`aggregateLogs`), which meant a second
 * grouping rule, a second best-set rule and a second trend derivation living
 * beside the ones the Today drawer used. They are gone: `projectExerciseHistory`
 * decides identity, grouping and metrics once, and this file only decides what
 * to draw.
 *
 * Two spec rules shape the layout:
 *
 * 1. **A family index row shows only family-level facts** — distinct workouts
 *    and the most recent performed date. No PR, no best set, no volume trend,
 *    because those are not comparable across mechanically different versions of
 *    one movement.
 * 2. **Performance summaries stay per concrete version**, so the detail view is
 *    a stack of version panels above one combined chronological table.
 */

/** Families last performed within this many days count as `recent`. */
const RECENT_WINDOW_DAYS = 45;

// ─── Sparkline ───────────────────────────────────────────────────────────────

function MiniSpark({ nums }: { nums: readonly number[] }) {
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
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0 }}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--fg-3)"
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
    <span
      data-testid="trend"
      style={{ color: m.color, fontFamily: "var(--font-mono)", fontSize: 11 }}
    >
      {m.char}
    </span>
  );
}

// ─── Version panel ───────────────────────────────────────────────────────────

/**
 * One concrete version's own numbers.
 *
 * `sessionCount` and `entryCount` are both shown. They are different questions —
 * "how many workouts" and "how many times it was logged" — and the page that
 * printed only the entry count and called it sessions was simply wrong about a
 * user who logs a top set and a back-off block in one workout.
 */
function VersionPanel({ summary }: { summary: VersionHistorySummary }) {
  return (
    <div
      data-testid="version-summary"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 6, fontSize: 13, fontWeight: 500,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          <span>{summary.label}</span>
          <TrendArrow dir={summary.trend} />
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)",
          display: "flex", gap: 8, marginTop: 2,
        }}>
          <span>
            {summary.sessionCount} session{summary.sessionCount === 1 ? "" : "s"}
            {" · "}
            {summary.entryCount} {summary.entryCount === 1 ? "entry" : "entries"}
          </span>
          <span style={{ color: "var(--fg-4)" }}>last {formatSessionDate(summary.lastDate)}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
        <MiniSpark nums={summary.sessionVolumesLb} />
        {summary.bestSetLabel && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>
            {summary.bestSetLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Family detail ───────────────────────────────────────────────────────────

function FamilyDetail({
  family,
  versions,
  groups,
  onBack,
  onCorrect,
}: {
  family: FamilyHistorySummary;
  versions: VersionHistorySummary[];
  groups: ReturnType<typeof groupByWorkout>;
  onBack: () => void;
  onCorrect: (target: CorrectionTarget) => void;
}) {
  const entryCount = countEntries(groups);
  return (
    <div data-testid="family-detail">
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 10, padding: "4px 8px" }}>
        <ChevronLeft size={12} /> History index
      </button>

      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--fg)" }}>
          {toTitleCase(family.label)}
        </h2>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)",
          marginTop: 2, display: "flex", gap: 6,
        }}>
          <span>{family.workoutCount} workout{family.workoutCount === 1 ? "" : "s"}</span>
          <span style={{ color: "var(--line-2)" }}>·</span>
          <span>{entryCount} {entryCount === 1 ? "entry" : "entries"}</span>
          <span style={{ color: "var(--line-2)" }}>·</span>
          <span>last {formatSessionDate(family.latestDate)}</span>
        </div>
      </div>

      {/* Metrics, per concrete version. Deliberately no family row here: a PR
          across mechanically different versions of one movement is a number
          nobody performed. */}
      <div style={{
        border: "1px solid var(--line)", borderRadius: "var(--r)",
        background: "var(--bg-2)", overflow: "hidden", marginBottom: 12,
      }}>
        {versions.map((version) => (
          <VersionPanel key={version.versionKey} summary={version} />
        ))}
      </div>

      <span className="tx-up" style={{ display: "block", marginBottom: 4 }}>
        every session
      </span>
      <div style={{
        border: "1px solid var(--line)", borderRadius: "var(--r)",
        background: "var(--bg-2)", overflow: "hidden",
      }}>
        <HistoryWorkoutList groups={groups} onCorrect={onCorrect} />
      </div>
    </div>
  );
}

// ─── Filter chips ──────────────────────────────────────────────────────────

const FILTERS = ["all", "recent", "stale"] as const;
type Filter = (typeof FILTERS)[number];

const SORTS = [
  { id: "workouts", label: "#" },
  { id: "name", label: "a-z" },
  { id: "recent", label: "last" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HistoryClient() {
  const { context } = useExerciseNormalization();
  const [logs, setLogs] = useState<WorkoutLogDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("workouts");
  const [openFamilyKey, setOpenFamilyKey] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);

  useEffect(() => {
    logRepo
      .list()
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  // `context` is a dependency, so a correction saved from a history row
  // regroups the page from the logs already in memory — no second read, and
  // nothing about what was logged changes.
  const projection = useMemo(() => projectExerciseHistory(logs, context), [logs, context]);

  const families = useMemo(() => [...projection.familySummaries.values()], [projection]);

  const staleBefore = useMemo(
    () => new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString(),
    [],
  );

  const filtered = useMemo(() => {
    let rows = families;
    // `recent` and `stale` are about WHEN, which is what the words say. They
    // used to split on a session count that itself counted entries — a
    // frequency test wearing the words of a time test, wrong twice over.
    // `latestPerformedAt` is compared as text against an ISO instant, so an
    // unreadable timestamp sorts as older and reads as stale rather than
    // claiming a workout happened recently.
    if (filter === "recent") rows = rows.filter((f) => textOf(f.latestPerformedAt) >= staleBefore);
    if (filter === "stale") rows = rows.filter((f) => textOf(f.latestPerformedAt) < staleBefore);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((f) => f.label.toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      if (sort === "recent") return textOf(b.latestPerformedAt).localeCompare(textOf(a.latestPerformedAt));
      return b.workoutCount - a.workoutCount;
    });
  }, [families, filter, sort, q, staleBefore]);

  const openFamily = openFamilyKey ? projection.familySummaries.get(openFamilyKey) : undefined;

  const detail = useMemo(() => {
    if (!openFamily) return null;
    return {
      family: openFamily,
      versions: openFamily.versionKeys
        .map((key) => projection.versionSummaries.get(key))
        .filter((summary): summary is VersionHistorySummary => summary !== undefined),
      groups: groupByWorkout(projection.rowsByFamilyKey.get(openFamily.familyKey) ?? []),
    };
  }, [openFamily, projection]);

  const sheet = correctionTarget && (
    <ExerciseCorrectionSheet target={correctionTarget} onClose={() => setCorrectionTarget(null)} />
  );

  if (detail) {
    return (
      <>
        <FamilyDetail
          family={detail.family}
          versions={detail.versions}
          groups={detail.groups}
          onBack={() => setOpenFamilyKey(null)}
          onCorrect={setCorrectionTarget}
        />
        {sheet}
      </>
    );
  }

  if (loading) {
    return (
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading history…
      </p>
    );
  }

  if (families.length === 0) {
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
        <span className="tx-mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {families.length} movements · {logs.length} workouts
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Tap a movement to see every version and session.
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
          placeholder="filter movements…"
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

      {/* Index */}
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
          filtered.map((family, i) => (
            <button
              key={family.familyKey}
              onClick={() => setOpenFamilyKey(family.familyKey)}
              style={{
                width: "100%",
                textAlign: "left",
                display: "block",
                padding: "9px 12px",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none",
                background: "transparent",
                color: "var(--fg)",
                cursor: "pointer",
                border: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                transition: "background .1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2,
              }}>
                {toTitleCase(family.label)}
              </div>
              {/* Family-level facts only. Anything comparable — best, PR, trend
                  — belongs to a concrete version and lives one level in. */}
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)",
                display: "flex", gap: 8,
              }}>
                <span>{family.workoutCount} workout{family.workoutCount === 1 ? "" : "s"}</span>
                <span style={{ color: "var(--fg-4)" }}>
                  {family.versionKeys.length} version{family.versionKeys.length === 1 ? "" : "s"}
                </span>
                <span style={{ color: "var(--fg-4)" }}>last {formatSessionDate(family.latestDate)}</span>
              </div>
            </button>
          ))
        )}
      </div>
      {sheet}
    </div>
  );
}
