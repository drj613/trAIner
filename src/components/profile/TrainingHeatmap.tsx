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

  return (
    <div className="panel">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="tx-up">Training frequency · 26 wks</span>
        <span className="flex-1" />
        <span className="tx-mono text-[10px] muted">{stats.completionRate}% logged</span>
      </div>

      <div className="flex gap-1.5 items-start overflow-x-auto">
        {/* Day labels column */}
        <div
          className="flex flex-col gap-0.5 shrink-0 pt-3"
          style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--fg-3)" }}
        >
          {DAY_LABELS.map((label, i) => (
            <div key={i} style={{ height: 10, lineHeight: 1 }}>
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
                    height: 10,
                    borderRadius: 2,
                    background: cellColor(cell),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer stats */}
      <div
        className="flex items-center gap-3 mt-3"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}
      >
        <span>streak: <span style={{ color: "var(--accent)" }}>{stats.streak}</span></span>
        <span>·</span>
        <span>avg: <span style={{ color: "var(--fg-2)" }}>{stats.weeklyAvg}/wk</span></span>
        <span className="flex-1" />
        <span>less</span>
        {([0, 1, 2, 3, 4] as const).map((v) => (
          <div
            key={v}
            style={{ width: 10, height: 10, borderRadius: 2, background: cellColor({ intensity: v, future: false }) }}
          />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}
