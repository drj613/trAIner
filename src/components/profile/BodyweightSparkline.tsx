import type { BodyweightEntry } from "@/lib/programs/types";

type Props = {
  entries: BodyweightEntry[];
};

const WIDTH = 220;
const HEIGHT = 40;
const PAD = 4;

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
  const stepX = (WIDTH - PAD * 2) / (sorted.length - 1);
  const points = sorted.map((e, i) => {
    const x = PAD + i * stepX;
    const y = HEIGHT - PAD - ((e.value - min) / range) * (HEIGHT - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  const latest = sorted[sorted.length - 1];

  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-1">
        <span className="tx-up flex-1">Bodyweight</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)" }}>
          {latest.value} {latest.unit}
        </span>
      </div>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label={`Bodyweight trend, ${sorted.length} entries`}
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
