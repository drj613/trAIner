import type { BodyweightEntry } from "@/lib/programs/types";

type Props = {
  entries: BodyweightEntry[];
};

const WIDTH = 320;
const HEIGHT = 80;
const PAD = 8;

const sectionLabelStyle = { fontSize: 13, fontWeight: 500, color: "var(--fg-2)" } as const;

export function BodyweightSparkline({ entries }: Props) {
  if (entries.length < 2) {
    return (
      <div className="panel">
        <p className="tx-up mb-1" style={sectionLabelStyle}>Bodyweight</p>
        <p className="muted text-xs">Not enough data — log at least two entries.</p>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  // Raw values are plotted, so only entries sharing the latest unit belong on one line.
  const plotted = sorted.filter((e) => e.unit === latest.unit);
  const omitted = sorted.length - plotted.length;
  const canPlot = plotted.length >= 2;
  const values = plotted.map((e) => e.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // Pad the y range so a small real change does not fill the whole plot; never anchor at zero.
  const pad = Math.max(span * 0.25, Math.abs(max) * 0.03, 0.5);
  const yMin = min - pad;
  const yRange = span + pad * 2;
  const firstDate = Date.parse(plotted[0].id);
  const timeRange = Date.parse(plotted[plotted.length - 1].id) - firstDate || 1;
  const points = plotted.map((e) => {
    const x = PAD + ((Date.parse(e.id) - firstDate) / timeRange) * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - ((e.value - yMin) / yRange) * (HEIGHT - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  const round = (value: number) => Math.round(value * 10) / 10;
  const change = round(plotted[plotted.length - 1].value - plotted[0].value);
  const changeLabel = `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}`;
  const dateLabel = (id: string) => new Date(id + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-1">
        <span className="tx-up flex-1" style={sectionLabelStyle}>Bodyweight</span>
      </div>
      <p style={{ margin: "4px 0 4px", fontSize: 13, color: "var(--fg-2)" }}>
        Starting {first.value} {first.unit} · Current {latest.value} {latest.unit}
      </p>
      {canPlot && (
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--fg-2)" }}>
          Change {changeLabel} {latest.unit} · Range {round(min)}–{round(max)} {latest.unit}
        </p>
      )}
      {omitted > 0 && (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--fg-2)" }}>
          {canPlot ? `Chart shows ${plotted.length} entries in ${latest.unit}. ` : "Entries use different units, so no chart is drawn. "}
          {omitted} {omitted === 1 ? "entry" : "entries"} in other units not plotted.
        </p>
      )}
      {canPlot && (
        <svg
          width="100%"
          height={HEIGHT}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-label={`Bodyweight trend, ${plotted.length} entries`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
          />
        </svg>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--fg-2)" }}>
        <span>{dateLabel(plotted[0].id)}</span><span>{dateLabel(latest.id)}</span>
      </div>
    </div>
  );
}
