import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveItem } from "@/lib/ui/reorder";

export function RankedGoalsList({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="muted text-xs">No goals yet</p>;
  }
  return (
    <ol className="flex flex-col gap-1" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item, i) => (
        <li key={item} className="flex items-baseline gap-2 text-xs" style={{ color: "var(--fg-2)" }}>
          <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SortableGoalRow({
  id,
  rank,
  onRemove,
}: {
  id: string;
  rank: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 text-xs px-2 py-1 rounded"
      role="listitem"
    >
      <button
        type="button"
        aria-label={`Reorder ${id}`}
        className="cursor-grab"
        style={{ color: "var(--fg-3)", touchAction: "none" }}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{rank}.</span>
      <span className="flex-1" style={{ color: "var(--fg-2)" }}>{id}</span>
      <button
        type="button"
        aria-label={`Remove ${id}`}
        onClick={onRemove}
        style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 1px" }}
      >
        ×
      </button>
    </li>
  );
}

export function RankedGoalsEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addItem() {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.indexOf(String(active.id));
    const to = items.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(moveItem(items, from, to));
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="muted text-xs">No goals yet</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }} className="flex flex-col gap-1">
              {items.map((item, i) => (
                <SortableGoalRow
                  key={item}
                  id={item}
                  rank={i + 1}
                  onRemove={() => onChange(items.filter((it) => it !== item))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="flex gap-1">
        <input
          className="input flex-1"
          style={{ fontSize: 12, padding: "3px 7px" }}
          value={input}
          placeholder="Add goal…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <button
          type="button"
          className="button"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={addItem}
        >
          Add
        </button>
      </div>
    </div>
  );
}
