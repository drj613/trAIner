"use client";

import { useRef } from "react";
import { useEditableValue } from "@/lib/workout/useEditableValue";

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
  id?: string;
  value: string;
  prescribed?: string;
  onChange: (v: string) => void;
  onNext?: () => void;
  autoFocus?: boolean;
  readOnly?: boolean;
};

export function SetCell({ id, value, prescribed = "", onChange, onNext, autoFocus, readOnly }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const isReverting = useRef(false);
  const { draft: v, editing, setDraft: setV, startEditing, commit, revert } = useEditableValue(value, onChange);

  const state = classifyCell(v);
  const cls = ["cell", state, editing ? "editing" : ""].filter(Boolean).join(" ");

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
      setTimeout(() => onNext?.(), 0);
    }
    if (e.key === "Escape") {
      isReverting.current = true;
      revert();
      setTimeout(() => {
        ref.current?.blur();
        isReverting.current = false;
      }, 0);
    }
  };

  return (
    <input
      ref={ref}
      id={id}
      className={cls}
      value={v}
      placeholder={prescribed || "—"}
      onChange={(e) => setV(e.target.value)}
      onFocus={startEditing}
      onBlur={() => {
        if (!isReverting.current) commit();
      }}
      onKeyDown={onKey}
      autoFocus={autoFocus}
      readOnly={readOnly}
      style={{ width: 70, height: 30, fontSize: 13 }}
      aria-label={`Set value${prescribed ? ` (${prescribed})` : ""}`}
    />
  );
}
