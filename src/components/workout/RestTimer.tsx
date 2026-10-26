import { useEffect, useRef, useState } from "react";
import { Clock3, Pencil, Play, Pause, RotateCcw } from "lucide-react";
import { parseDuration } from "@/lib/workout/parseDuration";
import "./workout.css";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = {
  restText?: string;
  notes?: string;
};

function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission().catch(() => { /* dismissed */ });
  }
}

function notifyRestDone() {
  try { navigator.vibrate?.(200); } catch { /* unsupported */ }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const title = "Rest done";
  const options = { body: "Rest timer finished — time for the next set.", tag: "rest-timer" };
  // Prefer the service worker so the notification also fires when the tab is
  // backgrounded / installed as a PWA; fall back to a page notification.
  const viaPage = () => { try { new Notification(title, options); } catch { /* unsupported */ } };
  if (navigator.serviceWorker?.getRegistration) {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => (reg ? reg.showNotification(title, options) : viaPage()))
      .catch(viaPage);
  } else {
    viaPage();
  }
}

export function RestTimer({ restText, notes }: Props) {
  const initial = parseDuration(restText ?? "") ?? parseDuration(notes ?? "");
  const [seconds, setSeconds] = useState<number | undefined>(initial);
  const [remaining, setRemaining] = useState<number>(initial ?? 0);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  useEffect(() => {
    if (!running) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    // Count down against a wall-clock deadline: background tabs throttle
    // setInterval, so decrementing per tick would drift badly on phones.
    const deadline = Date.now() + remainingRef.current * 1000;
    let fired = false;
    tickRef.current = setInterval(() => {
      const r = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0 && !fired) {
        fired = true;
        setRunning(false);
        notifyRestDone();
      }
    }, 250);
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

  const display = seconds === undefined ? "Set rest" : fmt(remaining);

  return (
    <div className="wk-timer">
      {seconds !== undefined && <span className="wk-timer-label">Rest</span>}
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
          style={{ width: 88 }}
        />
      ) : (
        <button
          type="button"
          className={`tap-target wk-timer-time${running ? " running" : ""}${seconds === undefined ? " unset" : ""}`}
          onClick={running ? undefined : startEditing}
          disabled={running}
          aria-label={seconds === undefined ? "Set rest duration" : "Edit rest duration"}
        >
          {seconds === undefined ? <Clock3 size={14} aria-hidden /> : <Pencil size={12} aria-hidden />}
          {display}
        </button>
      )}
      {/* Start/Reset only exist once there is a duration to run. */}
      {seconds !== undefined && (
        <>
          <button
            type="button"
            className="btn ghost wk-tool"
            aria-label={running ? "Pause" : "Start"}
            onClick={() => {
              if (!running) requestNotificationPermission();
              setRunning((r) => !r);
            }}
          >
            {running ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {running ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            className="btn ghost wk-tool"
            aria-label="Reset"
            onClick={() => { setRunning(false); setRemaining(seconds); }}
          >
            <RotateCcw size={14} aria-hidden />
            Reset
          </button>
        </>
      )}
    </div>
  );
}
