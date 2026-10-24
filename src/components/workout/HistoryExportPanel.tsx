"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ExerciseIdentityContext } from "@/lib/catalog/identity";
import type { ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";
import { buildHistoryExport, historyRoutineOptions } from "@/lib/workout/historyExport";
import type { HistoryExportSelection } from "@/lib/workout/historyExport";

type Props = {
  logs: readonly WorkoutLogDocument[];
  programs: readonly ProgramDocument[];
  context: ExerciseIdentityContext;
  onClose: () => void;
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  border: "1px solid var(--line)",
  borderRadius: "var(--r)",
  background: "var(--bg-2)",
  color: "var(--fg)",
};

export function HistoryExportPanel({ logs, programs, context, onClose }: Props) {
  const [programId, setProgramId] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [lastValidText, setLastValidText] = useState("");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const routineOptions = useMemo(() => historyRoutineOptions(logs, programs), [logs, programs]);
  const selection = useMemo<HistoryExportSelection>(() => ({
    routine: programId ? { kind: "one", programId } : { kind: "all" },
    ...(from ? { from } : {}),
    ...(through ? { through } : {}),
  }), [programId, from, through]);
  const result = useMemo(() => buildHistoryExport({ logs, programs, context, selection }), [logs, programs, context, selection]);

  useEffect(() => {
    if (result.ok) setLastValidText(result.text);
  }, [result]);

  const fieldError = result.ok ? null : result.message;
  const canDeliver = result.ok && result.canExport;
  const preview = result.ok ? result.text : lastValidText;
  const summary = result.ok ? result.summary : null;
  const copied = copiedText !== null && copiedText === preview;

  async function copyPreview() {
    const text = result.ok ? result.text : "";
    setCopiedText(null);
    setDeliveryError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
    } catch {
      setDeliveryError("Could not copy the export. Your preview is still available to select.");
    }
  }

  function downloadPreview() {
    if (!result.ok) return;
    setDeliveryError(null);
    let objectUrl: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
    } catch {
      setDeliveryError("Could not download the export. Your preview is still available to select.");
    } finally {
      anchor?.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  return (
    <section
      aria-label="Export workout history"
      style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--bg-2)", padding: 12, margin: "8px 0 14px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, color: "var(--fg)" }}>Export for AI</h2>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--fg-2)" }}>
          Routine
          <select aria-label="Routine" value={programId} onChange={(event) => setProgramId(event.target.value)} style={inputStyle}>
            <option value="">All routines</option>
            {routineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--fg-2)" }}>
          From
          <input aria-label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--fg-2)" }}>
          Through
          <input aria-label="Through" type="date" value={through} onChange={(event) => setThrough(event.target.value)} style={inputStyle} />
        </label>
      </div>

      {fieldError && <p role="alert" style={{ color: "var(--danger, #b42318)", margin: "0 0 8px", fontSize: 12 }}>{fieldError}</p>}
      {deliveryError && <p role="alert" style={{ color: "var(--danger, #b42318)", margin: "0 0 8px", fontSize: 12 }}>{deliveryError}</p>}
      {summary && (
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8 }}>
          {summary.sessions} sessions · {summary.entries} entries · {summary.sets} sets · {summary.warnings} warnings
          {summary.excludedUndated > 0 && <> · {summary.excludedUndated} undated sessions excluded</>}
          {summary.warnings > 0 && <p style={{ margin: "4px 0 0" }}>Some stored history could not be fully read. Review the warning markers in the export.</p>}
        </div>
      )}
      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--fg-2)" }}>
        Export preview
        <textarea
          aria-label="Export preview"
          readOnly
          value={preview}
          onFocus={(event) => event.currentTarget.select()}
          rows={12}
          style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 11, resize: "vertical", whiteSpace: "pre" }}
        />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn" disabled={!canDeliver} onClick={copyPreview}>Copy</button>
        <button type="button" className="btn" disabled={!canDeliver} onClick={downloadPreview}>Download .txt</button>
        <span role="status" aria-live="polite" style={{ fontSize: 12, color: "var(--accent)" }}>{copied ? "Copied" : ""}</span>
      </div>
    </section>
  );
}
