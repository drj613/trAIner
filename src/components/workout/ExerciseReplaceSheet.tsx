"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  NestedExerciseList,
  catalogItemForVersion,
  usePickerGroups,
} from "@/components/catalog/NestedExerciseList";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";
import { useVisualViewport } from "@/lib/ui/useVisualViewport";

type Props = {
  onSelect: (item: ExerciseCatalogItem) => void;
  onClose: () => void;
};

export function ExerciseReplaceSheet({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  // state resets naturally on each open because the parent mounts/unmounts this component
  const [selected, setSelected] = useState<ExerciseCatalogItem | null>(null);

  const { height: vvHeight, ready: vvReady } = useVisualViewport();
  const sheetMaxHeight = vvReady && vvHeight !== undefined
    ? Math.min(vvHeight - 8, vvHeight * 0.92)
    : undefined;

  const muscles = useMemo(() => {
    const all = exerciseCatalog.flatMap((e) => e.muscles.primary); // Exact concrete metadata lookup; grouping is intentionally not performed here.
    return [...new Set(all)].sort();
  }, []);

  const groups = usePickerGroups(query, muscleFilter);
  const selectedIds = useMemo(() => new Set(selected ? [selected.id] : []), [selected]);

  // The replacement is the concrete item that was chosen, held as chosen — not
  // looked up again by id, and never a family.
  function handleConfirm() {
    if (selected) onSelect(selected);
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
          <NestedExerciseList
            groups={groups}
            selectedIds={selectedIds}
            mark="radio"
            onSelectVersion={(version) => setSelected(catalogItemForVersion(version))}
          />
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
