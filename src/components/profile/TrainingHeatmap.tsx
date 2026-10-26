import {
  computeHeatmapStats,
  type HeatmapCell,
} from "@/lib/analytics/trainingHeatmap";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function cellColor(cell: HeatmapCell): string {
  if (cell.future || cell.intensity === 0) return "var(--bg-3)";
  if (cell.intensity === 1) return "color-mix(in oklab, var(--accent) 25%, var(--bg-2))";
  if (cell.intensity === 2) return "color-mix(in oklab, var(--accent) 45%, var(--bg-2))";
  if (cell.intensity === 3) return "color-mix(in oklab, var(--accent) 70%, var(--bg-2))";
  return "var(--accent)";
}

export function TrainingHeatmap({ cells }: { cells: HeatmapCell[][] }) {
  const stats = computeHeatmapStats(cells);
  const end = new Date();
  const monday = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1);
  const start = new Date(monday);
  start.setUTCDate(start.getUTCDate() - (cells.length - 1) * 7);
  const dateLabel = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="panel">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="tx-up">Training frequency · {cells.length} weeks</span>
        <span className="flex-1" />
        <span className="text-xs muted">{stats.completionRate}% logged</span>
      </div>

      <div className="flex gap-1.5 items-start overflow-x-auto">
        {/* Day labels column */}
        <div
          className="flex flex-col gap-0.5 shrink-0"
          style={{ fontSize: 12, color: "var(--fg-3)" }}
        >
          {DAY_LABELS.map((label, i) => (
            <div key={i} style={{ height: 12, lineHeight: 1 }}>
              {i % 2 === 0 ? label : ""}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div
          className="flex-1 min-w-0"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
            gap: 2,
          }}
        >
          {cells.map((week, w) => (
            <div key={w} className="flex flex-col gap-0.5">
              {week.map((cell, d) => (
                <div
                  key={d}
                  style={{
                    height: 12,
                    borderRadius: 2,
                    background: cellColor(cell),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--fg-2)" }}>
        <span>{dateLabel(start)}</span><span>{dateLabel(end)}</span>
      </div>
      {/* Footer stats */}
      <div
        className="flex flex-wrap items-center gap-2 mt-3"
        style={{ fontSize: 12, color: "var(--fg-3)" }}
      >
        <span>Streak: <span style={{ color: "var(--fg-2)" }}>{stats.streak} days</span></span>
        <span>·</span>
        <span>Average: <span style={{ color: "var(--fg-2)" }}>{stats.weeklyAvg} days/week</span></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((v) => (
          <span
            key={v}
            style={{ width: 10, height: 10, borderRadius: 2, background: cellColor({ intensity: v, future: false }) }}
          />
        ))}
        <span>More</span>
        </span>
      </div>
    </div>
  );
}
