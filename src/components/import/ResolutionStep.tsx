import type { ResolutionItem } from "@/lib/import/resolution";

type Props = {
  items: ResolutionItem[];
  resolutions: Record<string, string>; // path → chosen canonicalId
  onChange: (path: string, canonicalId: string) => void;
  onBack: () => void;
  onNext: () => void;
  disabledExtra?: boolean;
};

export function ResolutionStep({
  items,
  resolutions,
  onChange,
  onBack,
  onNext,
  disabledExtra = false,
}: Props) {
  const resolved = items.filter((item) => resolutions[item.path]);
  const remaining = items.length - resolved.length;
  const progress = items.length > 0 ? (resolved.length / items.length) * 100 : 100;

  return (
    <div className="stack">
      {/* Summary banner */}
      <div
        className="panel"
        style={{
          background:
            remaining > 0 ? "rgba(var(--warn-rgb, 230,182,100), 0.08)" : "var(--bg-2)",
          borderColor: remaining > 0 ? "var(--warn, #e6b664)" : "var(--line)",
        }}
      >
        <p className="text-sm font-semibold mb-1">
          {remaining} of {items.length} unresolved
        </p>
        <p className="text-xs muted">
          Resolve all before importing — unresolved exercises will break history tracking.
        </p>
        <div
          className="mt-2 h-1 rounded-full overflow-hidden"
          style={{ background: "var(--bg-3)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Per-exercise resolution */}
      {items.map((item) => (
        <div key={item.path} className="panel stack">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs muted tx-mono">imported</p>
              <p className="text-sm font-semibold">{item.rawName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs muted tx-mono">resolved to</p>
              <p
                className="text-sm font-semibold"
                style={{
                  color: resolutions[item.path]
                    ? "var(--accent)"
                    : "var(--fg-4, #888)",
                }}
              >
                {resolutions[item.path]
                  ? item.suggestions.find(
                      (s) => s.exerciseId === resolutions[item.path],
                    )?.name ?? resolutions[item.path]
                  : "—"}
              </p>
            </div>
          </div>

          <div className="stack">
            <p className="tx-up text-[10px]">Suggestions</p>
            {item.suggestions.map((s) => (
              <button
                key={s.exerciseId}
                type="button"
                className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
                style={{
                  background:
                    resolutions[item.path] === s.exerciseId
                      ? "var(--accent-soft)"
                      : "var(--bg-2)",
                  borderColor:
                    resolutions[item.path] === s.exerciseId
                      ? "var(--accent)"
                      : "var(--line)",
                }}
                onClick={() => onChange(item.path, s.exerciseId)}
              >
                <span
                  className="font-mono text-[11px] shrink-0"
                  style={{
                    color:
                      resolutions[item.path] === s.exerciseId
                        ? "var(--accent)"
                        : "var(--fg-3)",
                  }}
                >
                  {resolutions[item.path] === s.exerciseId ? "✓" : "○"}
                </span>
                <span className="flex-1">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Navigation */}
      <div className="flex gap-2">
        <button type="button" className="button secondary flex-1" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="button flex-1"
          disabled={remaining > 0 || disabledExtra}
          onClick={onNext}
        >
          Review import →
        </button>
      </div>
    </div>
  );
}
