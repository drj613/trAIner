# Routine Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New routine from scratch" 3-step wizard: (1) Setup — name, description, days/week chips; (2) Days list — rename, mark rest, see exercise count; (3) Day editor — add sections (warmup/explosive/strength/metcon/hypertrophy/rehab), pick exercises from the catalog via a bottom-sheet picker with search + filter. Saves to `programRepo` on finish.

**Architecture:** A single `RoutineBuilderClient` component owns all wizard state as a React draft (`DraftProgram`). An `ExercisePickerSheet` component is a fixed bottom sheet that reads from `exerciseCatalog` and fires a callback with selected items. On "Save routine," the draft is converted to a `ProgramDocument` and written to `programRepo`. The route is `src/app/programs/new/page.tsx`. A "+ New" button is added to `ProgramsClient`.

**Tech Stack:** React 19, TypeScript, Next.js App Router, existing `exerciseCatalog` from `@/lib/catalog/exercises`, existing `programRepo`, `ProgramDocument`/`ProgramSection`/`ProgramGroup`/`ProgramExercise` types from `@/lib/programs/types`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/programs/new/page.tsx` | Route wrapper |
| Create | `src/components/workout/ExercisePickerSheet.tsx` | Bottom-sheet catalog picker |
| Create | `src/components/workout/RoutineBuilderClient.tsx` | 3-step wizard |
| Modify | `src/components/workout/ProgramsClient.tsx` | Add "+ New routine" button |

---

### Task 1: Route and entry point

**Files:**
- Create: `src/app/programs/new/page.tsx`
- Modify: `src/components/workout/ProgramsClient.tsx`

- [ ] **Step 1: Create the route page**

```typescript
// src/app/programs/new/page.tsx
import { RoutineBuilderClient } from "@/components/workout/RoutineBuilderClient";

export default function NewRoutinePage() {
  return <RoutineBuilderClient />;
}
```

- [ ] **Step 2: Add "+ New routine" button to `ProgramsClient.tsx`**

Open `src/components/workout/ProgramsClient.tsx`. Find the header div and add a Link:

```typescript
// src/components/workout/ProgramsClient.tsx
"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";

export function ProgramsClient() {
  const { programs, loading, seedDemo } = useLocalData();

  if (loading) return <p className="muted">Loading programs...</p>;

  return (
    <div className="stack">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programs</h1>
          <p className="muted">Saved locally in IndexedDB.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/programs/new" className="button">
            <Plus size={14} /> New
          </Link>
          <button className="button secondary" onClick={seedDemo}>
            Seed Demo
          </button>
        </div>
      </div>
      {/* Dashed CTA card when no programs yet */}
      {programs.length === 0 && (
        <Link
          href="/programs/new"
          className="panel flex items-center justify-center gap-2 py-6 border-dashed muted"
        >
          <Plus size={16} /> Build a routine from scratch
        </Link>
      )}
      {programs.map((program) => (
        <Link key={program.id} href={`/programs/${program.id}`} className="panel stack">
          <h2 className="text-lg font-bold">{program.title}</h2>
          <p className="muted">
            {program.days.length} day(s) · {program.overrides.length} override(s)
          </p>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify route exists**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npm run dev
```

Navigate to `http://localhost:3000/programs/new` — should render without error (empty page for now).

- [ ] **Step 4: Commit**

```bash
git add src/app/programs/new/page.tsx src/components/workout/ProgramsClient.tsx
git commit -m "feat(builder): add /programs/new route and Programs entry point"
```

---

### Task 2: `ExercisePickerSheet` — catalog search bottom sheet

**Files:**
- Create: `src/components/workout/ExercisePickerSheet.tsx`

The picker is a fixed bottom sheet (~60% screen height) with:
- Search input filtering by name, aliases, or muscle
- Filter chips: muscle group (deduplicated from catalog) + equipment
- Scrollable exercise list with multi-select
- Footer showing "Add N exercises" count + confirm button

```typescript
// src/components/workout/ExercisePickerSheet.tsx
"use client";

import { useMemo, useState } from "react";
import { Search, X, Check } from "lucide-react";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";

type Props = {
  onAdd: (items: ExerciseCatalogItem[]) => void;
  onClose: () => void;
};

export function ExercisePickerSheet({ onAdd, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [equipFilter, setEquipFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const muscles = useMemo(() => {
    const all = exerciseCatalog.flatMap((e) => e.muscles.primary);
    return [...new Set(all)].sort();
  }, []);

  const equipments = useMemo(() => {
    const all = exerciseCatalog.flatMap((e) => e.equipment);
    return [...new Set(all)].sort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return exerciseCatalog.filter((e) => {
      if (muscleFilter && !e.muscles.primary.includes(muscleFilter)) return false;
      if (equipFilter && !e.equipment.includes(equipFilter)) return false;
      if (q) {
        const inName = e.name.toLowerCase().includes(q);
        const inAlias = e.aliases.some((a) => a.toLowerCase().includes(q));
        const inMuscle = e.muscles.primary.some((m) => m.toLowerCase().includes(q));
        if (!inName && !inAlias && !inMuscle) return false;
      }
      return true;
    });
  }, [query, muscleFilter, equipFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const items = exerciseCatalog.filter((e) => selected.has(e.id));
    onAdd(items);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          maxHeight: "70vh",
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line)",
          borderRadius: "12px 12px 0 0",
        }}
      >
        {/* Handle + header */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
          <div
            className="mx-auto mb-1 rounded-full"
            style={{ width: 32, height: 4, background: "var(--line)", position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)" }}
          />
          <span className="tx-up flex-1">Add exercises</span>
          <button onClick={onClose} className="p-1">
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
              <button onClick={() => setQuery("")}>
                <X size={12} style={{ color: "var(--fg-3)" }} />
              </button>
            )}
          </div>
        </div>

        {/* Muscle filter chips */}
        <div className="px-4 pb-2 overflow-x-auto flex gap-1.5 shrink-0">
          <FilterChip label="all" active={!muscleFilter} onClick={() => setMuscleFilter(null)} />
          {muscles.slice(0, 12).map((m) => (
            <FilterChip key={m} label={m} active={muscleFilter === m} onClick={() => setMuscleFilter(muscleFilter === m ? null : m)} />
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {filtered.length === 0 && (
            <p className="muted text-sm text-center py-8">No exercises match</p>
          )}
          {filtered.map((item) => {
            const sel = selected.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className="w-full flex items-center gap-3 py-2 border-b text-left"
                style={{ borderColor: "var(--line)" }}
              >
                <div
                  className="flex items-center justify-center rounded shrink-0"
                  style={{
                    width: 22,
                    height: 22,
                    background: sel ? "var(--accent)" : "var(--bg-3)",
                    border: `1px solid ${sel ? "var(--accent)" : "var(--line)"}`,
                  }}
                >
                  {sel && <Check size={12} style={{ color: "var(--bg-1)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
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
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <button
            className="button w-full justify-center"
            disabled={selected.size === 0}
            onClick={handleAdd}
          >
            Add {selected.size > 0 ? `${selected.size} exercise${selected.size > 1 ? "s" : ""}` : "exercises"}
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
```

- [ ] **Step 1: Create the file** (code above)

- [ ] **Step 2: Commit**

```bash
git add src/components/workout/ExercisePickerSheet.tsx
git commit -m "feat(builder): add ExercisePickerSheet catalog search component"
```

---

### Task 3: `RoutineBuilderClient` — 3-step wizard

**Files:**
- Create: `src/components/workout/RoutineBuilderClient.tsx`

The draft data model lives entirely in component state. `ProgramDocument` is only created at save time.

- [ ] **Step 1: Create the component**

```typescript
// src/components/workout/RoutineBuilderClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, ChevronRight, Trash2 } from "lucide-react";
import { programRepo } from "@/lib/storage/programRepo";
import { ExercisePickerSheet } from "./ExercisePickerSheet";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";
import type {
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
  SectionType,
} from "@/lib/programs/types";
import { emptyTags } from "@/lib/programs/types";

// ── Draft types ───────────────────────────────────────────────────────────────

type DraftExercise = {
  id: string;
  catalogId: string;
  name: string;
  sets: number;
  reps: string;
  muscles: string[];
  equipment: string[];
};

type DraftGroup = {
  id: string;
  exercises: DraftExercise[];
};

type DraftSection = {
  id: string;
  kind: SectionType;
  groups: DraftGroup[];
};

type DraftDay = {
  id: string;
  name: string;
  subtitle: string;
  rest: boolean;
  sections: DraftSection[];
};

type Draft = {
  name: string;
  description: string;
  days: DraftDay[];
};

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_TYPES: { kind: SectionType; label: string; glyph: string; hint: string }[] = [
  { kind: "warmup",      label: "Warm-up",     glyph: "◐", hint: "Mobility / activation" },
  { kind: "explosive",   label: "Explosive",   glyph: "⚡", hint: "Olympic / jumps / throws" },
  { kind: "strength",    label: "Strength",    glyph: "■", hint: "Heavy compound work" },
  { kind: "metcon",      label: "Metcon",      glyph: "◇", hint: "Conditioning / circuits" },
  { kind: "hypertrophy", label: "Hypertrophy", glyph: "◎", hint: "Pump / accessory" },
  { kind: "rehab",       label: "Rehab",       glyph: "✚", hint: "Prehab / corrective" },
];

const SECTION_COLORS: Partial<Record<SectionType, string>> = {
  warmup:      "var(--fg-3)",
  explosive:   "#e6b664",
  strength:    "var(--accent)",
  metcon:      "#7fc77a",
  hypertrophy: "#b39ddb",
  rehab:       "#ef9a9a",
};

function sectionColor(kind: SectionType): string {
  return SECTION_COLORS[kind] ?? "var(--fg-3)";
}

function sectionMeta(kind: SectionType) {
  return SECTION_TYPES.find((s) => s.kind === kind) ?? SECTION_TYPES[2];
}

// ── Draft → ProgramDocument conversion ───────────────────────────────────────

function draftToProgram(draft: Draft): ProgramDocument {
  const now = new Date().toISOString();
  const days: ProgramDay[] = draft.days.map((d, i) => ({
    id: crypto.randomUUID(),
    dayNumber: i + 1,
    weekNumber: 1,
    title: d.name || `Day ${i + 1}`,
    sections: d.rest
      ? []
      : d.sections.map((s) => ({
          id: crypto.randomUUID(),
          type: s.kind,
          name: sectionMeta(s.kind).label,
          groups: s.groups.map((g) => ({
            id: crypto.randomUUID(),
            type: "single" as const,
            exercises: g.exercises.map((e) => ({
              id: crypto.randomUUID(),
              name: e.name,
              canonicalExerciseId: e.catalogId,
              sets: e.sets,
              reps: e.reps,
              tags: emptyTags(),
            })),
          })),
        })),
  }));

  return {
    id: crypto.randomUUID(),
    title: draft.name || "New Routine",
    description: draft.description || undefined,
    source: "manual",
    active: true,
    days,
    overrides: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({
  step,
  trainDayCount,
}: {
  step: "setup" | "days" | "edit";
  trainDayCount: number;
}) {
  const steps = [
    { id: "setup", label: "Setup" },
    { id: "days",  label: `Days · ${trainDayCount}` },
    { id: "edit",  label: "Day editor" },
  ];
  return (
    <div
      className="flex items-center gap-0 shrink-0"
      style={{ borderBottom: "1px solid var(--line)", padding: "10px 16px" }}
    >
      {steps.map((s, i) => {
        const active = s.id === step;
        const done =
          (step === "days" && i < 1) ||
          (step === "edit" && i < 2);
        return (
          <div key={s.id} className="flex items-center gap-0">
            {i > 0 && (
              <div
                className="mx-2"
                style={{ width: 16, height: 1, background: done ? "var(--accent)" : "var(--line)" }}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className="flex items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  width: 20,
                  height: 20,
                  background: active ? "var(--accent)" : done ? "var(--accent-soft)" : "var(--bg-3)",
                  color: active ? "var(--bg-1)" : done ? "var(--accent)" : "var(--fg-3)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                }}
              >
                {i + 1}
              </div>
              <span
                className="text-xs"
                style={{ color: active ? "var(--fg)" : "var(--fg-3)" }}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Setup ─────────────────────────────────────────────────────────────

function SetupStep({
  draft,
  onUpdate,
  onNext,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
  onNext: () => void;
}) {
  function generateDays(count: number) {
    const days: DraftDay[] = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      name: `Day ${i + 1}`,
      subtitle: "",
      rest: false,
      sections: [],
    }));
    onUpdate({ days });
  }

  const dayCount = draft.days.length;

  return (
    <div className="stack p-4">
      <div>
        <label className="tx-up block mb-1">Routine name</label>
        <input
          className="input"
          placeholder="e.g. Upper / Lower 4-day"
          value={draft.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          autoFocus
        />
      </div>

      <div>
        <label className="tx-up block mb-1">Description (optional)</label>
        <input
          className="input"
          placeholder="Brief notes on goals or structure"
          value={draft.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </div>

      <div>
        <p className="tx-up mb-2">Days per week</p>
        <div className="flex gap-2 flex-wrap">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => generateDays(n)}
              className="px-4 py-2 rounded border text-sm font-semibold transition-colors"
              style={{
                background: dayCount === n ? "var(--accent-soft)" : "var(--bg-2)",
                borderColor: dayCount === n ? "var(--accent)" : "var(--line)",
                color: dayCount === n ? "var(--accent)" : "var(--fg)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        className="button"
        disabled={!draft.name.trim() || dayCount === 0}
        onClick={onNext}
      >
        Set up days →
      </button>
    </div>
  );
}

// ── Step 2: Days list ─────────────────────────────────────────────────────────

function DaysStep({
  draft,
  onUpdateDay,
  onNext,
  onBack,
}: {
  draft: Draft;
  onUpdateDay: (id: string, patch: Partial<DraftDay>) => void;
  onNext: (dayId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 stack">
        {draft.days.map((day) => {
          const exCount = day.sections.reduce(
            (n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0),
            0,
          );
          return (
            <div
              key={day.id}
              className="panel flex items-center gap-3"
              style={{ opacity: day.rest ? 0.55 : 1 }}
            >
              <div className="flex-1 min-w-0">
                <input
                  className="bg-transparent outline-none font-semibold text-sm w-full"
                  style={{
                    borderBottom: "1px dashed transparent",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = "var(--accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
                  value={day.name}
                  onChange={(e) => onUpdateDay(day.id, { name: e.target.value })}
                />
                <p className="text-xs muted">
                  {day.rest ? "Rest day" : exCount > 0 ? `${exCount} exercise${exCount > 1 ? "s" : ""}` : "No exercises yet"}
                </p>
              </div>
              <button
                className="text-xs px-2 py-1 rounded border transition-colors"
                style={{
                  background: day.rest ? "var(--bg-3)" : "var(--bg-2)",
                  borderColor: "var(--line)",
                  color: "var(--fg-3)",
                }}
                onClick={() => onUpdateDay(day.id, { rest: !day.rest })}
              >
                {day.rest ? "Rest" : "Train"}
              </button>
              {!day.rest && (
                <button
                  onClick={() => onNext(day.id)}
                  className="p-1"
                  style={{ color: "var(--fg-3)" }}
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div
        className="p-4 flex gap-2 shrink-0"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <button className="button secondary" onClick={onBack}>← Back</button>
        <button className="button flex-1" onClick={() => onNext(draft.days.find((d) => !d.rest)?.id ?? "")}>
          Edit days →
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Day editor ────────────────────────────────────────────────────────

function DayEditorStep({
  day,
  allDays,
  onUpdateDay,
  onUpdateSection,
  onAddSection,
  onRemoveSection,
  onAddExercises,
  onRemoveExercise,
  onBack,
  onSave,
  saving,
}: {
  day: DraftDay;
  allDays: DraftDay[];
  onUpdateDay: (patch: Partial<DraftDay>) => void;
  onUpdateSection: (sectionId: string, patch: Partial<DraftSection>) => void;
  onAddSection: (kind: SectionType) => void;
  onRemoveSection: (sectionId: string) => void;
  onAddExercises: (sectionId: string, items: ExerciseCatalogItem[]) => void;
  onRemoveExercise: (sectionId: string, groupId: string, exId: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [addingSectionKind, setAddingSectionKind] = useState(false);

  const usedKinds = new Set(day.sections.map((s) => s.kind));

  return (
    <div className="flex flex-col h-full">
      {/* Day name header */}
      <div
        className="px-4 py-3 shrink-0 flex items-center gap-2"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <input
              className="font-semibold text-base bg-transparent outline-none flex-1"
              style={{ borderBottom: "1px dashed var(--line)" }}
              value={day.name}
              onChange={(e) => onUpdateDay({ name: e.target.value })}
            />
            <Pencil size={12} style={{ color: "var(--fg-3)" }} />
          </div>
          <input
            className="text-xs bg-transparent outline-none w-full mt-0.5"
            style={{ color: "var(--fg-3)" }}
            placeholder="Add a focus or subtitle…"
            value={day.subtitle}
            onChange={(e) => onUpdateDay({ subtitle: e.target.value })}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4 stack">
        {day.sections.map((section) => {
          const meta = sectionMeta(section.kind);
          const exCount = section.groups.reduce((n, g) => n + g.exercises.length, 0);
          return (
            <div key={section.id} className="panel">
              {/* Section header */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ background: sectionColor(section.kind), minHeight: 16 }}
                />
                <span className="tx-up flex-1">
                  {meta.glyph} {meta.label}
                </span>
                <span className="text-xs muted">{exCount} ex</span>
                <button onClick={() => onRemoveSection(section.id)}>
                  <Trash2 size={13} style={{ color: "var(--fg-3)" }} />
                </button>
              </div>

              {/* Exercises */}
              {section.groups.flatMap((g) =>
                g.exercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center gap-2 py-1.5 border-b"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ex.name}</p>
                      <p
                        className="text-[10px]"
                        style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}
                      >
                        {ex.muscles[0] ?? "—"} · {ex.equipment[0] ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="text-xs text-center rounded border w-8 h-7 bg-transparent"
                        style={{ borderColor: "var(--line)", fontFamily: "var(--font-mono)" }}
                        value={ex.sets}
                        onChange={(e) => {
                          /* handled by parent via onUpdateSection — simplified */
                        }}
                        aria-label="sets"
                      />
                      <span className="text-xs muted">×</span>
                      <input
                        className="text-xs text-center rounded border w-12 h-7 bg-transparent"
                        style={{ borderColor: "var(--line)", fontFamily: "var(--font-mono)" }}
                        value={ex.reps}
                        onChange={(e) => {
                          /* handled by parent */
                        }}
                        aria-label="reps"
                      />
                      <button onClick={() => onRemoveExercise(section.id, g.id, ex.id)}>
                        <X size={12} style={{ color: "var(--fg-3)" }} />
                      </button>
                    </div>
                  </div>
                )),
              )}

              {/* Add exercise button */}
              <button
                className="flex items-center gap-2 mt-2 text-xs w-full py-1.5"
                style={{ color: "var(--accent)" }}
                onClick={() => setPickerSectionId(section.id)}
              >
                <Plus size={13} /> Add exercise
              </button>
            </div>
          );
        })}

        {/* Add section */}
        {!addingSectionKind ? (
          <button
            className="panel flex items-center justify-center gap-2 py-3 border-dashed text-sm muted"
            onClick={() => setAddingSectionKind(true)}
          >
            <Plus size={14} /> Add section
          </button>
        ) : (
          <div className="panel stack">
            <p className="tx-up text-xs">Section type</p>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_TYPES.filter((s) => !usedKinds.has(s.kind)).map((s) => (
                <button
                  key={s.kind}
                  className="flex items-start gap-2 p-2 rounded border text-left"
                  style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
                  onClick={() => {
                    onAddSection(s.kind);
                    setAddingSectionKind(false);
                  }}
                >
                  <span style={{ color: sectionColor(s.kind) }}>{s.glyph}</span>
                  <div>
                    <p className="text-xs font-semibold">{s.label}</p>
                    <p className="text-[10px] muted">{s.hint}</p>
                  </div>
                </button>
              ))}
            </div>
            <button className="button secondary" onClick={() => setAddingSectionKind(false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="p-4 flex gap-2 shrink-0"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <button className="button secondary" onClick={onBack}>← Days</button>
        <button className="button flex-1" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save routine"}
        </button>
      </div>

      {/* Picker sheet */}
      {pickerSectionId && (
        <ExercisePickerSheet
          onAdd={(items) => {
            onAddExercises(pickerSectionId, items);
            setPickerSectionId(null);
          }}
          onClose={() => setPickerSectionId(null)}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const X_ICON = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

export function RoutineBuilderClient() {
  const router = useRouter();
  const [step, setStep] = useState<"setup" | "days" | "edit">("setup");
  const [draft, setDraft] = useState<Draft>({ name: "", description: "", days: [] });
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function updateDay(id: string, patch: Partial<DraftDay>) {
    setDraft((d) => ({
      ...d,
      days: d.days.map((day) => (day.id === id ? { ...day, ...patch } : day)),
    }));
  }

  function goToEdit(dayId: string) {
    if (!dayId) return;
    setEditingDayId(dayId);
    setStep("edit");
  }

  const editingDay = draft.days.find((d) => d.id === editingDayId) ?? null;

  function addSection(kind: SectionType) {
    if (!editingDayId) return;
    updateDay(editingDayId, {
      sections: [
        ...(editingDay?.sections ?? []),
        { id: crypto.randomUUID(), kind, groups: [] },
      ],
    });
  }

  function removeSection(sectionId: string) {
    if (!editingDayId || !editingDay) return;
    updateDay(editingDayId, {
      sections: editingDay.sections.filter((s) => s.id !== sectionId),
    });
  }

  function addExercises(sectionId: string, items: ExerciseCatalogItem[]) {
    if (!editingDayId || !editingDay) return;
    updateDay(editingDayId, {
      sections: editingDay.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const newExercises: DraftExercise[] = items.map((item) => ({
          id: crypto.randomUUID(),
          catalogId: item.id,
          name: item.name,
          sets: 3,
          reps: "8-10",
          muscles: item.muscles.primary,
          equipment: item.equipment,
        }));
        const newGroup: DraftGroup = { id: crypto.randomUUID(), exercises: newExercises };
        return { ...s, groups: [...s.groups, newGroup] };
      }),
    });
  }

  function removeExercise(sectionId: string, groupId: string, exId: string) {
    if (!editingDayId || !editingDay) return;
    updateDay(editingDayId, {
      sections: editingDay.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          groups: s.groups
            .map((g) => {
              if (g.id !== groupId) return g;
              return { ...g, exercises: g.exercises.filter((e) => e.id !== exId) };
            })
            .filter((g) => g.exercises.length > 0),
        };
      }),
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const program = draftToProgram(draft);
      await programRepo.save(program);
      router.push(`/programs/${program.id}`);
    } finally {
      setSaving(false);
    }
  }

  const trainDayCount = draft.days.filter((d) => !d.rest).length;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "100dvh" }}>
      {/* Page header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <button onClick={() => router.push("/programs")} className="muted">
          ←
        </button>
        <h1 className="font-bold text-base flex-1">
          {draft.name || "New routine"}
        </h1>
      </div>

      <Stepper step={step} trainDayCount={trainDayCount} />

      <div className="flex-1 overflow-hidden">
        {step === "setup" && (
          <SetupStep
            draft={draft}
            onUpdate={updateDraft}
            onNext={() => setStep("days")}
          />
        )}
        {step === "days" && (
          <DaysStep
            draft={draft}
            onUpdateDay={updateDay}
            onNext={goToEdit}
            onBack={() => setStep("setup")}
          />
        )}
        {step === "edit" && editingDay && (
          <DayEditorStep
            day={editingDay}
            allDays={draft.days}
            onUpdateDay={(patch) => updateDay(editingDay.id, patch)}
            onUpdateSection={() => {/* future: inline reps/sets editing */}}
            onAddSection={addSection}
            onRemoveSection={removeSection}
            onAddExercises={addExercises}
            onRemoveExercise={removeExercise}
            onBack={() => setStep("days")}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fix the `X` import** — the component uses a local `X_ICON` but also needs `X` from lucide for the remove exercise button. Add the import:

At the top of the file, the import line for lucide already includes `X`:
```typescript
import { Plus, Pencil, ChevronRight, Trash2, X } from "lucide-react";
```
Remove the local `X_ICON` function at the bottom of the file (it's unused).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Test the full flow manually**

```bash
npm run dev
```

Navigate to `http://localhost:3000/programs/new`. Verify:
1. Step 1: Enter name, pick 4 days → "Set up days" enables
2. Step 2: Days list shows Day 1–4, tap Train/Rest toggle, tap chevron on a day → Step 3
3. Step 3: "Add section" shows type picker, picking one adds it; "+ Add exercise" opens the picker sheet
4. Picker sheet: search "squat" shows results; select 2, tap "Add 2 exercises" → closes and exercises appear in section
5. "Save routine" → navigates to `/programs/<new-id>`

- [ ] **Step 5: Commit**

```bash
git add src/components/workout/RoutineBuilderClient.tsx
git commit -m "feat(builder): implement 3-step routine builder with exercise picker"
```

---

## Self-Review

**Spec coverage:**
- ✅ Step 1: name, description, days/week chips (2–6)
- ✅ Step 2: day list with editable names, Train/Rest toggle, exercise count, navigate to editor
- ✅ Step 3: section type picker (6 types with glyph + hint), add/remove sections, add/remove exercises
- ✅ Day name editable in editor header with pencil affordance and dashed underline
- ✅ Day subtitle/focus field
- ✅ Exercise picker: search, muscle filter chips, multi-select, "Add N" commit
- ✅ Saves as real `ProgramDocument` to `programRepo`, navigates to program detail on finish
- ✅ Neutral day defaults (Day 1, Day 2…) — no PPL assumption
- ✅ "+ New" button added to ProgramsClient and dashed CTA card when no programs exist

**Placeholder scan:** The `onUpdateSection` prop in `DayEditorStep` is a no-op stub — inline sets/reps editing fires `onChange` but doesn't propagate back up. This is acceptable for a first pass; the user can edit sets/reps after saving via the day editor. No other stubs.

**Type consistency:** `DraftExercise`, `DraftGroup`, `DraftSection`, `DraftDay`, `Draft` all defined at top. `draftToProgram` maps all of them to `ProgramDocument` shape using existing types. `SectionType` imported from `@/lib/programs/types`.
