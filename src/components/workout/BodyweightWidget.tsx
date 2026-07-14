import { useEffect, useState } from "react";
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
import type { BodyweightEntry } from "@/lib/programs/types";

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
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        padding: "8px 10px",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        BW
      </span>
      {entry && !editing ? (
        <>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)" }}>
            {entry.value} {entry.unit}
          </span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setEditing(true)}
            style={{ padding: "2px 6px", fontSize: 10 }}
          >
            update
          </button>
        </>
      ) : !editing ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => setEditing(true)}
          style={{ padding: "2px 6px", fontSize: 11 }}
        >
          Log bodyweight
        </button>
      ) : (
        <>
          <input
            type="number"
            value={value}
            placeholder="weight"
            onChange={(e) => setValue(e.target.value)}
            className="input"
            style={{ width: 70, fontSize: 12 }}
            autoFocus
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "kg" | "lb")}
            className="input"
            style={{ width: 56, fontSize: 12 }}
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
          <button type="button" className="button" onClick={save} style={{ padding: "3px 8px", fontSize: 11 }}>
            Save
          </button>
        </>
      )}
    </div>
  );
}
