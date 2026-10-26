import type { BodyweightEntry } from "@/lib/programs/types";

type Props = {
  entries: BodyweightEntry[];
};

const WIDTH = 320;
const HEIGHT = 80;
const PAD = 8;
const LABEL_WIDTH = 52;

export function BodyweightSparkline({ entries }: Props) {
  if (entries.length < 2) {
    return (
      <div className="panel">
        <p className="tx-up mb-1">Bodyweight</p>
        <p className="muted text-xs">Not enough data — log at least two entries.</p>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const values = sorted.map((e) => e.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const firstDate = Date.parse(sorted[0].id);
  const timeRange = Date.parse(sorted[sorted.length - 1].id) - firstDate || 1;
  const points = sorted.map((e) => {
    const x = LABEL_WIDTH + ((Date.parse(e.id) - firstDate) / timeRange) * (WIDTH - LABEL_WIDTH - PAD);
    const y = HEIGHT - PAD - ((e.value - min) / range) * (HEIGHT - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const dateLabel = (id: string) => new Date(id + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-1">
        <span className="tx-up flex-1">Bodyweight</span>
      </div>
      <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--fg-2)" }}>
        Starting {first.value} {first.unit} · Current {latest.value} {latest.unit}
      </p>
      <svg
        width="100%"
        height={HEIGHT}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label={`Bodyweight trend, ${sorted.length} entries`}
      >
        <text x={0} y={PAD + 4} fill="var(--fg-2)" fontSize={11}>{max}</text>
        {min !== max && <text x={0} y={HEIGHT - PAD} fill="var(--fg-2)" fontSize={11}>{min}</text>}
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--fg-2)" }}>
        <span>{dateLabel(first.id)}</span><span>{dateLabel(latest.id)}</span>
      </div>
    </div>
  );
}
