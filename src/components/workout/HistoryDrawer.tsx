"use client";

import type { ExerciseSessionRow } from "@/lib/workout/historyUtils";

type Props = {
  exerciseName: string;
  rows: ExerciseSessionRow[];
  onClose: () => void;
};

export function HistoryDrawer({ exerciseName, rows, onClose }: Props) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        data-testid="history-drawer-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <div
        role="dialog"
        aria-label={`History for ${exerciseName}`}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          maxHeight: "75vh", background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0", borderTop: "1px solid var(--line-2)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "var(--line-2)" }} />
        </div>
        <div style={{ padding: "0 16px 12px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
            {exerciseName}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
            {rows.length} session{rows.length !== 1 ? "s" : ""} · last 8
          </p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 16px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-3)" }}>
              No history yet for this exercise.
            </div>
          ) : (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "64px 1fr 64px",
                padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em",
                borderBottom: "1px solid var(--line)",
              }}>
                <span>date</span><span>sets</span><span style={{ textAlign: "right" }}>vol</span>
              </div>
              {rows.map((row, i) => (
                <div key={row.date} style={{
                  display: "grid", gridTemplateColumns: "64px 1fr 64px",
                  padding: "8px 16px", alignItems: "center",
                  borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {row.date}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {row.sets.map((s, j) => (
                      <span key={j} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textAlign: "right" }}>
                    {row.volume > 0 ? row.volume.toLocaleString() : "—"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
