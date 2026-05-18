"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";
import { toTitleCase } from "@/lib/catalog/normalize";
import { useVisualViewport } from "@/lib/ui/useVisualViewport";

type Props = {
  onSelect: (item: ExerciseCatalogItem) => void;
  onClose: () => void;
};

export function ExerciseReplaceSheet({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  // state resets naturally on each open because the parent mounts/unmounts this component
  const [selected, setSelected] = useState<string | null>(null);

  const { height: vvHeight, ready: vvReady } = useVisualViewport();
  const sheetMaxHeight = vvReady && vvHeight !== undefined
    ? Math.min(vvHeight - 8, vvHeight * 0.92)
    : undefined;

  const muscles = useMemo(() => {
    const all = exerciseCatalog.flatMap((e) => e.muscles.primary);
    return [...new Set(all)].sort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return exerciseCatalog.filter((e) => {
      if (muscleFilter && !e.muscles.primary.includes(muscleFilter)) return false;
      if (q) {
        const inName = e.name.toLowerCase().includes(q);
        const inAlias = e.aliases.some((a) => a.toLowerCase().includes(q));
        const inMuscle = e.muscles.primary.some((m) => m.toLowerCase().includes(q));
        if (!inName && !inAlias && !inMuscle) return false;
      }
      return true;
    });
  }, [query, muscleFilter]);

  function handleConfirm() {
    const item = exerciseCatalog.find((e) => e.id === selected);
    if (item) onSelect(item);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          maxHeight: sheetMaxHeight ?? "70dvh",
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line)",
          borderRadius: "12px 12px 0 0",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
          <span className="tx-up flex-1">Replace with…</span>
          <button type="button" onClick={onClose} className="p-1 muted">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2 shrink-0">
          <div
            className="flex items-center gap-2 rounded px-3 py-2"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
          >
            <Search size={14} style={{ color: "var(--fg-3)" }} />
            <input
              className="flex-1 bg-transparent outline-none text-sm"
              placeholder="Search exercises…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X size={12} style={{ color: "var(--fg-3)" }} />
              </button>
            )}
          </div>
        </div>

        {/* Muscle filter chips */}
        <div className="px-4 pb-2 overflow-x-auto flex gap-1.5 shrink-0">
          <FilterChip label="all" active={!muscleFilter} onClick={() => setMuscleFilter(null)} />
          {muscles.slice(0, 12).map((m) => (
            <FilterChip
              key={m}
              label={m}
              active={muscleFilter === m}
              onClick={() => setMuscleFilter(muscleFilter === m ? null : m)}
            />
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {filtered.length === 0 && (
            <p className="muted text-sm text-center py-8">No exercises match</p>
          )}
          {filtered.map((item) => {
            const isSelected = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className="w-full flex items-center gap-3 py-2 border-b text-left"
                style={{ borderColor: "var(--line)" }}
                aria-pressed={isSelected}
              >
                <div
                  className="shrink-0 rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    background: isSelected ? "var(--accent)" : "var(--bg-3)",
                    border: `2px solid ${isSelected ? "var(--accent)" : "var(--line)"}`,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{toTitleCase(item.name)}</p>
                  <p
                    className="text-[10px] truncate"
                    style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}
                  >
                    {item.muscles.primary.slice(0, 2).join(" · ")}
                    {item.equipment[0] ? ` · ${item.equipment[0]}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            className="button w-full justify-center"
            disabled={!selected}
            onClick={handleConfirm}
          >
            {selected ? "Replace exercise" : "Select an exercise"}
          </button>
        </div>
      </div>
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors"
      style={{
        background: active ? "var(--accent-soft)" : "var(--bg-2)",
        borderColor: active ? "var(--accent)" : "var(--line)",
        color: active ? "var(--accent)" : "var(--fg-2)",
      }}
    >
      {label}
    </button>
  );
}
