"use client";

import { useEffect } from "react";
import type { ExerciseSessionRow } from "@/lib/workout/historyUtils";
import { useFocusTrap } from "@/lib/workout/useFocusTrap";
import { classifyCell } from "./SetCell";

type Props = {
  exerciseName: string;
  rows: ExerciseSessionRow[];
  onClose: () => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a local YYYY-MM-DD string as e.g. "Apr 22 (Wed)". Parse with local
 * Date components (new Date(y, m-1, d)); never `new Date(str)`, which parses as
 * UTC midnight and shifts the day/weekday in non-UTC zones.
 */
function formatSessionDate(localYmd: string): string {
  const [y, m, d] = localYmd.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return localYmd;
  const dt = new Date(y, m - 1, d);
  return `${MONTHS[m - 1]} ${d} (${WEEKDAYS[dt.getDay()]})`;
}

export function HistoryDrawer({ exerciseName, rows, onClose }: Props) {
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        data-testid="history-drawer-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
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
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 16px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-3)" }}>
              No history yet for this exercise.
            </div>
          ) : (
            rows.map((row, i) => (
              <div
                key={`${row.date}-${i}`}
                style={{
                  padding: "10px 16px",
                  borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "baseline",
                  justifyContent: "space-between", marginBottom: 6,
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {formatSessionDate(row.date)}
                  </span>
                  {row.volume > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      <span style={{
                        color: "var(--fg-4)", textTransform: "uppercase",
                        letterSpacing: "0.08em", marginRight: 5,
                      }}>
                        vol
                      </span>
                      <span style={{ color: "var(--fg-3)" }}>{row.volume.toLocaleString()}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {row.sets.map((s, j) => (
                    <span
                      key={j}
                      className={`cell ${classifyCell(s)}`}
                      style={{ cursor: "default", pointerEvents: "none", height: 26, fontSize: 12 }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                {row.note && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-2)", lineHeight: 1.4 }}>
                    {row.note}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
