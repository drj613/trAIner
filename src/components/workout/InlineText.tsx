"use client";

import { useRef } from "react";
import { useEditableValue } from "@/lib/workout/useEditableValue";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
};

export function InlineText({ value, onChange, className, style, placeholder = "—" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isReverting = useRef(false);
  const { draft, editing, setDraft, startEditing, commit, revert } = useEditableValue(value, onChange);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      isReverting.current = true;
      revert();
      setTimeout(() => {
        inputRef.current?.blur();
        isReverting.current = false;
      }, 0);
    }
  };

  const handleBlur = () => {
    if (!isReverting.current) {
      commit();
    }
  };

  if (!editing) {
    return (
      <span
        className={className}
        style={{ cursor: "text", ...style }}
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEditing();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Edit: ${value || placeholder}`}
      >
        {value || <span style={{ color: "var(--fg-4)" }}>{placeholder}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      className={className}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--accent)",
        outline: "none",
        color: "var(--fg)",
        ...style,
      }}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
