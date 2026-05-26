import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { parseDuration } from "@/lib/workout/parseDuration";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = {
  restText?: string;
  notes?: string;
};

export function RestTimer({ restText, notes }: Props) {
  const initial = parseDuration(restText ?? "") ?? parseDuration(notes ?? "");
  const [seconds, setSeconds] = useState<number | undefined>(initial);
  const [remaining, setRemaining] = useState<number>(initial ?? 0);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          try { navigator.vibrate?.(200); } catch { /* unsupported */ }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running]);

  function startEditing() {
    setDraft(seconds !== undefined ? String(seconds) : "");
    setEditing(true);
  }

  function commitEdit() {
    const n = Number(draft);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= 600) {
      setSeconds(n);
      setRemaining(n);
      setEditing(false);
    }
    // else: stay in edit mode; user can correct or press Escape
  }

  function cancelEdit() {
    setEditing(false);
  }

  const display = seconds === undefined ? "--:--" : fmt(remaining);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      {editing ? (
        <input
          type="number"
          placeholder="seconds"
          min={1}
          max={600}
          step={1}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
          }}
          onBlur={commitEdit}
          className="input"
          style={{ width: 80, fontSize: 12 }}
        />
      ) : (
        <button
          type="button"
          onClick={running ? undefined : startEditing}
          disabled={running}
          aria-label={seconds === undefined ? "Set rest duration" : "Edit rest duration"}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            minWidth: 36,
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--fg)",
            cursor: running ? "default" : "pointer",
            textAlign: "left",
          }}
        >
          {display}
        </button>
      )}
      <button
        type="button"
        className="btn ghost"
        aria-label={running ? "Pause" : "Start"}
        onClick={() => setRunning((r) => !r)}
        disabled={seconds === undefined}
        style={{ padding: "3px 6px" }}
      >
        {running ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button
        type="button"
        className="btn ghost"
        aria-label="Reset"
        onClick={() => { setRunning(false); if (seconds !== undefined) setRemaining(seconds); }}
        disabled={seconds === undefined}
        style={{ padding: "3px 6px" }}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}
