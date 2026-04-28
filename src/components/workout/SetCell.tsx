"use client";

import { useEffect, useRef, useState } from "react";

export type CellState = "empty" | "done" | "pr" | "miss" | "skip" | "pain" | "bw";

export function classifyCell(v: string): CellState {
  if (!v) return "empty";
  const s = v.toLowerCase().trim();
  if (s.includes("skip")) return "skip";
  if (s.includes("pain")) return "pain";
  if (s.startsWith("+") || s.includes("pr")) return "pr";
  if (s.endsWith("!") || s.includes("miss") || s.includes("fail")) return "miss";
  if (s.startsWith("bw")) return "bw";
  return "done";
}

type Props = {
  value: string;
  prescribed?: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
};

export function SetCell({ value, prescribed = "", onChange, autoFocus }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [autoFocus]);

  const state = classifyCell(v);
  const cls = ["cell", state, editing ? "editing" : ""].filter(Boolean).join(" ");

  const commit = () => {
    setEditing(false);
    onChange(v);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
    }
    if (e.key === "Escape") {
      setV(value);
      setTimeout(() => ref.current?.blur(), 0);
    }
  };

  return (
    <input
      ref={ref}
      className={cls}
      value={v}
      placeholder={prescribed || "—"}
      onChange={(e) => setV(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={onKey}
      style={{ width: 70, height: 30, fontSize: 13 }}
      aria-label={`Set value${prescribed ? ` (${prescribed})` : ""}`}
    />
  );
}
