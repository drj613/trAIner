"use client";

import { useState, useEffect } from "react";
import { Check, Copy, X } from "lucide-react";
import { parseLooseJson } from "@/lib/import/sanitizeJson";
import { normalizePayload } from "@/lib/import/parser";
import { remapExerciseIds } from "@/lib/workout/programDiff";
import { useFocusTrap } from "@/lib/workout/useFocusTrap";
import type { ProgramDay } from "@/lib/programs/types";

type Props = {
  currentDay: ProgramDay;
  programId: string;
  onApply: (replacement: ProgramDay) => void;
  onClose: () => void;
};

export function buildPrompt(day: ProgramDay): string {
  const lines: string[] = [
    `Here is my current workout — "${day.title}":`,
    "",
  ];

  for (const section of day.sections) {
    lines.push(`${section.name} (${section.type}):`);
    for (const group of section.groups) {
      if (group.type !== "single") {
        lines.push(`  [${group.type.toUpperCase()}]`);
      }
      for (const ex of group.exercises) {
        const detail: string[] = [];
        if (ex.sets) detail.push(`${ex.sets} sets`);
        if (ex.reps) detail.push(`${ex.reps} reps`);
        if (ex.load) detail.push(`@ ${ex.load}`);
        if (ex.rest) detail.push(`rest ${ex.rest}`);
        const suffix = detail.length ? ` (${detail.join(", ")})` : "";
        lines.push(`  - ${ex.name}${suffix}`);
        if (ex.notes) lines.push(`    note: ${ex.notes}`);
      }
    }
    lines.push("");
  }

  lines.push(
    "[Describe what you want to change here]",
    "",
    "Return ONLY a JSON object in this exact format — no explanation:",
    "",
    '{ "days": [{ "title": "...", "sections": [{ "type": "strength", "name": "...", "groups": [{ "type": "single", "exercises": [{ "name": "...", "sets": 3, "reps": "8-10", "load": "60kg", "rest": "90s", "countsTowardVolume": true }] }] }] }] }',
    "",
    "Preserve `countsTowardVolume` for unchanged exercises.",
    "",
    "Use `true` for productive working sets and `false` for ordinary warmup, activation, mobility, cooldown, rehabilitation, prehabilitation, or low-fatigue practice.",
    "",
    "Do not remove the field when modifying a day.",
    "",
    "Preserve all fields unrelated to the requested modification.",
  );

  return lines.join("\n");
}

export function ModifyAiModal({ currentDay, onApply, onClose }: Props) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const trapRef = useFocusTrap(true);
  const prompt = buildPrompt(currentDay);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleApply() {
    setError(null);
    const result = parseLooseJson(json);
    if (!result.ok) {
      setError(
        result.reason === "truncated"
          ? "The pasted JSON looks cut off — paste the full output from your AI assistant."
          : "Invalid JSON — paste the full output from your AI assistant.",
      );
      return;
    }
    const raw = result.value;

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      setError("The pasted JSON must be an object.");
      return;
    }

    try {
      const { program } = normalizePayload(raw as Record<string, unknown>);
      const parsedDay = program.days[0];
      if (!parsedDay) {
        setError("No day found in the pasted JSON.");
        return;
      }
      const remapped = remapExerciseIds(currentDay, {
        ...parsedDay,
        id: currentDay.id,
        dayNumber: currentDay.dayNumber,
      });
      onApply(remapped);
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label="Modify with AI"
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "90vh",
          background: "var(--bg-1)", borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--line-2)", display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 12px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1, color: "var(--fg)" }}>Modify with AI</h2>
          <button type="button" className="btn ghost" onClick={onClose} style={{ padding: "4px 6px" }} aria-label="Close">
            <X size={15} aria-hidden />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Step 1: Prompt */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--accent)",
                textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
              }}>
                1 · Copy prompt
              </span>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 10px", borderRadius: 999, fontSize: 11,
                  border: `1px solid ${copied ? "var(--good)" : "var(--line)"}`,
                  background: copied ? "rgba(127,199,122,0.1)" : "transparent",
                  color: copied ? "var(--good)" : "var(--fg-2)", cursor: "pointer",
                  fontFamily: "var(--font-mono)", transition: "all .15s",
                }}
                aria-label="Copy prompt to clipboard"
              >
                {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre
              style={{
                margin: 0, padding: 10, borderRadius: "var(--r)",
                background: "var(--bg-3)", border: "1px solid var(--line)",
                fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                maxHeight: 180, overflowY: "auto", lineHeight: 1.6,
                userSelect: "text",
              }}
            >
              {(() => {
                const placeholder = "[Describe what you want to change here]";
                const idx = prompt.indexOf(placeholder);
                if (idx === -1) return prompt;
                return (
                  <>
                    {prompt.slice(0, idx)}
                    <mark style={{ background: "rgba(230,182,100,0.25)", color: "var(--warn)", borderRadius: 3, padding: "0 2px", fontWeight: 600 }}>
                      {placeholder}
                    </mark>
                    {prompt.slice(idx + placeholder.length)}
                  </>
                );
              })()}
            </pre>
            <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.4 }}>
              <span style={{ color: "var(--warn)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>↑ Replace the highlighted line</span>
              {" "}
              <span style={{ color: "var(--fg-3)" }}>with your actual request, then paste into Claude or ChatGPT.</span>
            </p>
          </div>

          {/* Step 2: JSON paste */}
          <div style={{ padding: "12px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--accent)",
              textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
            }}>
              2 · Paste the response
            </span>
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='{ "days": [ { "title": "...", "sections": [...] } ] }'
              style={{
                flex: 1, minHeight: 130, background: "var(--bg-3)",
                border: "1px solid var(--line)", borderRadius: "var(--r)",
                color: "var(--fg)", fontFamily: "var(--font-mono)",
                fontSize: 11.5, padding: 10, resize: "none", outline: "none",
              }}
            />
            {error && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--bad)", fontFamily: "var(--font-mono)" }}>
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleApply} style={{ flex: 2 }} disabled={!json.trim()}>
            Review changes →
          </button>
        </div>
      </div>
    </div>
  );
}
