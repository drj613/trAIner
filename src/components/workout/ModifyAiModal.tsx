"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
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

export function ModifyAiModal({ currentDay, onApply, onClose }: Props) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleApply() {
    setError(null);
    let raw: unknown;
    try {
      raw = JSON.parse(json.trim());
    } catch {
      setError("Invalid JSON — paste the full output from your AI assistant.");
      return;
    }

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
      // Re-map parser-generated IDs back to original IDs so diffDays works correctly
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
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "85vh",
          background: "var(--bg-1)", borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--line-2)", display: "flex",
          flexDirection: "column", padding: 16, gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1, color: "var(--fg)" }}>Paste AI output</h2>
          <button type="button" className="btn ghost" onClick={onClose} style={{ padding: "4px 6px" }} aria-label="Close">
            <X size={15} aria-hidden />
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>
          Paste the JSON returned by your AI assistant below to review and apply changes.
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{ "days": [ { "title": "...", "sections": [...] } ] }'
          style={{
            flex: 1, minHeight: 180, background: "var(--bg-3)",
            border: "1px solid var(--line)", borderRadius: "var(--r)",
            color: "var(--fg)", fontFamily: "var(--font-mono)",
            fontSize: 11.5, padding: 10, resize: "none", outline: "none",
          }}
        />
        {error && <p style={{ margin: 0, fontSize: 12, color: "var(--bad)", fontFamily: "var(--font-mono)" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleApply} style={{ flex: 2 }} disabled={!json.trim()}>
            Review changes →
          </button>
        </div>
      </div>
    </div>
  );
}
