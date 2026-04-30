"use client";

import { useState } from "react";
import type { DisplayAnalysis } from "@/lib/analysis/types";

const PROMPT_GRID_ITEMS = [
  ["Volume landmarks", "11 muscles · MEV/MAV/MRV bands"],
  ["Session limits", "Exercise count · set count · duration"],
  ["Balance targets", "Push:pull · upper:lower · quad:ham"],
  ["Pattern coverage", "6 movement patterns"],
  ["Your profile", "Goals · experience · constraints"],
  ["Computed scores", "For LLM to validate / dispute"],
  ["Output schema", "JSON for app to consume"],
];

function buildPrompt(analysis: DisplayAnalysis, programTitle: string): string {
  return `# Workout Routine Analysis: ${programTitle}

You are an evidence-based strength coach. Analyze this routine using the reference data below.

## Reference: Volume Landmarks (sets/muscle/week)
| Muscle       | MV  | MEV | MAV-Lo | MAV-Hi | MRV   |
|--------------|-----|-----|--------|--------|-------|
| Chest        | 2–4 | 4–6 | 6      | 16     | 16–24 |
| Back         | 4–6 | 6–8 | 10     | 20     | 20–30 |
| Quads        | 2–4 | 4–6 | 6      | 14     | 14–18 |
| Hamstrings   | 2–4 | 4–6 | 6      | 14     | 14–18 |
| Glutes       | 0   | 2–4 | 6      | 14     | 14–18 |
| Front Delts  | 0–2 | 4   | 6      | 16     | 16–22 |
| Side Delts   | 0–2 | 6–8 | 10     | 18     | 18–26 |
| Rear Delts   | 0   | 4–6 | 8      | 16     | 16–22 |
| Biceps       | 0–2 | 6–8 | 10     | 18     | 18–26 |
| Triceps      | 2–4 | 4–6 | 8      | 16     | 16–22 |
| Calves       | 4–6 | 8   | 10     | 14     | 14–20 |

Volume counting: primary muscles = 1.0 set, secondary = 0.5, incidental = 0.25.

## Reference: Session Constraints
- 4–8 productive exercises; 11+ excessive
- 10–25 productive sets per session
- Duration ≈ (sets × 3) + 10 minutes

## Reference: Balance Targets
- Push:Pull = 1:1 to 1:1.5 (slightly pull-biased)
- Upper:Lower ≈ 1:1
- Quad:Ham = 1:1 to 1.67:1
- All 6 movement patterns covered: H/V push, H/V pull, hinge, squat

## Computed Scores (validate or dispute)
${analysis.dimensions.map((d) => `- ${d.label}: ${d.grade} (${d.score}/100) — ${d.note}`).join("\n")}

## Muscle Volumes
${analysis.muscles.map((m) => `- ${m.group}: ${m.sets} eff. sets (MEV ${m.mev}, MAV ${m.mavLo}–${m.mavHi}, MRV ${m.mrv}) [${m.status}]`).join("\n")}

## Balance Ratios
${analysis.ratios.map((r) => `- ${r.label}: ${r.value} (target ${r.target}) [${r.verdict}]`).join("\n")}

## Sessions
${analysis.sessions.map((s) => `- ${s.day}: ${s.exercises} exercises, ${s.sets} sets, ~${s.durationMin} min [${s.status}]`).join("\n")}

## Return JSON
{
  "fingerprint": { "primary": "...", "secondary": "...", "confidence": 0.0–1.0, "label": "<short phrase>" },
  "scores": { "volume": 0–100, "balance": 0–100, "structure": 0–100, "periodization": 0–100 },
  "findings": [{ "severity": "good|warn|bad|info", "area": "...", "msg": "..." }],
  "recommendations": [{ "priority": 1, "change": "...", "rationale": "..." }]
}`;
}

export function LlmAnalysisSheet({
  open,
  onClose,
  analysis,
  programTitle,
}: {
  open: boolean;
  onClose: () => void;
  analysis: DisplayAnalysis;
  programTitle: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  if (!open) return null;

  const prompt = buildPrompt(analysis, programTitle);
  const tokens = Math.ceil(prompt.length / 4);

  function copy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      data-testid="llm-sheet-backdrop"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 95, display: "flex", alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "85vh",
          background: "var(--bg)", borderTop: "1px solid var(--line)",
          borderTopLeftRadius: "var(--r-lg, 12px)", borderTopRightRadius: "var(--r-lg, 12px)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "8px 12px 6px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "var(--line)" }} />
        </div>

        <div style={{ padding: "0 12px 10px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 2 }}>
            AI analysis
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Two-tier analysis pattern</div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", lineHeight: 1.45 }}>
            The card above is computed instantly from the routine. For nuance — exercise selection critique, sequencing logic, equipment substitutions — paste this prompt into your AI assistant.
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 6 }}>
            What's in this prompt
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
            {[
              ...PROMPT_GRID_ITEMS,
              ["Full routine", `${analysis.muscles.length} muscles · ${analysis.sessions.length} sessions`],
            ].map(([k, v]) => (
              <div key={k} style={{
                padding: "5px 7px", background: "var(--bg-2)",
                border: "1px solid var(--line)", borderRadius: "var(--r-sm, 4px)",
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 500, color: "var(--fg)" }}>{k}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 9px", marginBottom: 8,
            background: "var(--bg-2)", border: "1px solid var(--line)",
            borderRadius: "var(--r-sm, 4px)",
          }}>
            <span style={{ fontSize: 11, color: "var(--fg-2)", flex: 1 }}>
              ~{tokens.toLocaleString()} tokens · works with Claude, GPT-4, or any frontier model
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowPrompt((s) => !s)}
            style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "7px 10px", fontSize: 11, marginBottom: 8,
              background: "transparent", border: "1px solid var(--line)",
              borderRadius: "var(--r-sm, 4px)", cursor: "pointer", fontFamily: "inherit",
              color: "var(--fg-2)",
            }}
          >
            <span>{showPrompt ? "Hide" : "Preview"} prompt text</span>
            <span>{showPrompt ? "▲" : "▼"}</span>
          </button>
          {showPrompt && (
            <pre style={{
              maxHeight: 220, overflow: "auto", padding: 10, margin: 0,
              background: "var(--bg-2)", border: "1px solid var(--line)",
              borderRadius: "var(--r-sm, 4px)",
              fontFamily: "var(--font-mono)", fontSize: 9.5,
              color: "var(--fg-2)", lineHeight: 1.5, whiteSpace: "pre-wrap",
            }}>
              {prompt}
            </pre>
          )}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px", fontSize: 12, background: "transparent",
              border: "1px solid var(--line)", borderRadius: "var(--r, 6px)",
              cursor: "pointer", fontFamily: "inherit", color: "var(--fg-2)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={copy}
            className="button"
            style={{ flex: 1, justifyContent: "center", padding: "8px 14px", fontSize: 12 }}
          >
            {copied ? "Copied — paste into your AI" : "Copy prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
