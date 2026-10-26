import { useEffect, useState } from "react";
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
import type { BodyweightEntry } from "@/lib/programs/types";
import "./workout.css";

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BodyweightWidget({ today }: { today?: string } = {}) {
  const date = today ?? todayString();
  const [entry, setEntry] = useState<BodyweightEntry | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("lb");

  useEffect(() => {
    bodyweightRepo.list().then((all) => {
      const found = all.find((e) => e.id === date);
      setEntry(found);
      if (found) {
        setValue(String(found.value));
        setUnit(found.unit);
      } else if (all.length > 0) {
        // No entry today — default the unit to whatever was used most recently
        const latest = all.reduce((a, b) => (a.id > b.id ? a : b));
        setUnit(latest.unit);
      }
    });
  }, [date]);

  async function save() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    const saved: BodyweightEntry = {
      id: date,
      value: v,
      unit,
      recordedAt: new Date().toISOString(),
    };
    await bodyweightRepo.save(saved);
    setEntry(saved);
    setEditing(false);
  }

  return (
    <div className="wk-bw">
      <span className="wk-label">Bodyweight</span>
      {entry && !editing ? (
        <>
          <span className="wk-bw-value">
            {entry.value} {entry.unit}
          </span>
          <button
            type="button"
            className="btn ghost wk-btn"
            onClick={() => setEditing(true)}
          >
            Update
          </button>
        </>
      ) : !editing ? (
        <button
          type="button"
          className="btn wk-btn"
          onClick={() => setEditing(true)}
        >
          Log bodyweight
        </button>
      ) : (
        <>
          <input
            type="number"
            value={value}
            placeholder="weight"
            aria-label="Bodyweight"
            onChange={(e) => setValue(e.target.value)}
            className="input"
            style={{ width: 88 }}
            autoFocus
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "kg" | "lb")}
            className="input"
            aria-label="Bodyweight unit"
            style={{ width: 68 }}
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
          <button type="button" className="btn primary wk-btn" onClick={save}>
            Save
          </button>
        </>
      )}
    </div>
  );
}
