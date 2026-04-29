"use client";

import type { ExerciseDiff } from "@/lib/workout/programDiff";
import type { ProgramDay } from "@/lib/programs/types";

const typeStyle: Record<string, { bg: string; color: string; label: string }> = {
  added:    { bg: "rgba(127,199,122,0.12)", color: "var(--good)",  label: "+ added" },
  removed:  { bg: "rgba(224,123,106,0.12)", color: "var(--bad)",   label: "– removed" },
  modified: { bg: "rgba(232,182,100,0.12)", color: "var(--warn)",  label: "~ changed" },
};

function ExField({ label, before, after }: { label: string; before?: string | number; after?: string | number }) {
  if (before === after) return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
      <span style={{ color: "var(--fg-4)", minWidth: 40 }}>{label}</span>
      {before !== undefined && <span style={{ color: "var(--bad)", textDecoration: "line-through" }}>{before}</span>}
      {after !== undefined && <span style={{ color: "var(--good)" }}>{after}</span>}
    </div>
  );
}

type Props = {
  diffs: ExerciseDiff[];
  replacement: ProgramDay;
  onAccept: () => void;
  onDiscard: () => void;
};

export function DiffReview({ diffs, replacement, onAccept, onDiscard }: Props) {
  if (diffs.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 8px", color: "var(--fg)" }}>No changes detected</h2>
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>The pasted workout appears identical to the current day.</p>
        <button type="button" className="btn" onClick={onDiscard} style={{ marginTop: 16 }}>Back</button>
      </div>
    );
  }

  const counts = {
    added: diffs.filter((d) => d.type === "added").length,
    removed: diffs.filter((d) => d.type === "removed").length,
    modified: diffs.filter((d) => d.type === "modified").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--line)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>Review changes</h1>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          {replacement.title}
          {counts.added > 0 && <span style={{ color: "var(--good)", marginLeft: 8 }}>+{counts.added}</span>}
          {counts.removed > 0 && <span style={{ color: "var(--bad)", marginLeft: 8 }}>−{counts.removed}</span>}
          {counts.modified > 0 && <span style={{ color: "var(--warn)", marginLeft: 8 }}>~{counts.modified}</span>}
        </p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {diffs.map((diff) => {
          const s = typeStyle[diff.type] ?? typeStyle.modified;
          return (
            <div key={diff.exerciseId} style={{
              marginBottom: 8, padding: "10px 12px",
              background: s.bg, border: `1px solid ${s.color}30`,
              borderLeft: `3px solid ${s.color}`, borderRadius: "var(--r)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>{diff.exerciseName}</span>
                <span style={{ fontSize: 10, color: s.color, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</span>
              </div>
              {diff.type === "modified" && (
                <div style={{ marginTop: 4 }}>
                  <ExField label="sets" before={diff.before?.sets} after={diff.after?.sets} />
                  <ExField label="reps" before={diff.before?.reps} after={diff.after?.reps} />
                  <ExField label="load" before={diff.before?.load} after={diff.after?.load} />
                  <ExField label="rest" before={diff.before?.rest} after={diff.after?.rest} />
                </div>
              )}
              {diff.type === "added" && diff.after && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
                  {[diff.after.sets && `${diff.after.sets}×`, diff.after.reps, diff.after.load].filter(Boolean).join(" ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding: 12, borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onDiscard} style={{ flex: 1 }}>Discard</button>
        <button type="button" className="btn primary" onClick={onAccept} style={{ flex: 2 }}>Apply changes</button>
      </div>
    </div>
  );
}
