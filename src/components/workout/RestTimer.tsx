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

  if (seconds === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <input
          type="number"
          placeholder="seconds"
          min={5}
          max={600}
          className="input"
          style={{ width: 80, fontSize: 12 }}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) {
              setSeconds(n); setRemaining(n);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, minWidth: 36 }}>
        {fmt(remaining)}
      </span>
      <button
        type="button"
        className="btn ghost"
        aria-label={running ? "Pause" : "Start"}
        onClick={() => setRunning((r) => !r)}
        style={{ padding: "3px 6px" }}
      >
        {running ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button
        type="button"
        className="btn ghost"
        aria-label="Reset"
        onClick={() => { setRunning(false); setRemaining(seconds); }}
        style={{ padding: "3px 6px" }}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}
