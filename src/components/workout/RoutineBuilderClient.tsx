"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, ChevronRight, Trash2, X } from "lucide-react";
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

// ── Draft types (local to this wizard) ───────────────────────────────────────

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

const SECTION_TYPES_META: { kind: SectionType; label: string; glyph: string; hint: string }[] = [
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
  return SECTION_TYPES_META.find((s) => s.kind === kind) ?? SECTION_TYPES_META[2];
}

// ── Draft → ProgramDocument ───────────────────────────────────────────────────

function draftToProgram(draft: Draft): ProgramDocument {
  const now = new Date().toISOString();
  const days: ProgramDay[] = draft.days.map((d, i) => ({
    id: crypto.randomUUID(),
    dayNumber: i + 1,
    weekNumber: 1,
    title: d.name || `Day ${i + 1}`,
    sections: d.rest
      ? []
      : d.sections.map((s): ProgramSection => ({
          id: crypto.randomUUID(),
          type: s.kind,
          name: sectionMeta(s.kind).label,
          groups: s.groups.map((g): ProgramGroup => ({
            id: crypto.randomUUID(),
            type: "single",
            exercises: g.exercises.map((e): ProgramExercise => ({
              id: crypto.randomUUID(),
              name: e.name,
              canonicalExerciseId: e.catalogId,
              sets: e.sets,
              reps: e.reps,
              tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
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

// ── Stepper header ────────────────────────────────────────────────────────────

function Stepper({ step, trainDayCount }: { step: "setup" | "days" | "edit"; trainDayCount: number }) {
  const steps = [
    { id: "setup", label: "Setup" },
    { id: "days", label: `Days · ${trainDayCount}` },
    { id: "edit", label: "Day editor" },
  ];
  return (
    <div className="flex items-center px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
      {steps.map((s, i) => {
        const active = s.id === step;
        const done = (step === "days" && i < 1) || (step === "edit" && i < 2);
        return (
          <div key={s.id} className="flex items-center">
            {i > 0 && <div className="mx-2" style={{ width: 16, height: 1, background: done ? "var(--accent)" : "var(--line)" }} />}
            <div className="flex items-center gap-1.5">
              <div
                className="flex items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  width: 20, height: 20,
                  background: active ? "var(--accent)" : done ? "var(--accent-soft)" : "var(--bg-3)",
                  color: active ? "var(--bg-1)" : done ? "var(--accent)" : "var(--fg-3)",
                  fontFamily: "var(--font-mono)", fontSize: 10,
                }}
              >
                {i + 1}
              </div>
              <span className="text-xs" style={{ color: active ? "var(--fg)" : "var(--fg-3)" }}>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Setup ─────────────────────────────────────────────────────────────

function SetupStep({ draft, onUpdate, onNext }: { draft: Draft; onUpdate: (p: Partial<Draft>) => void; onNext: () => void }) {
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

  return (
    <div className="stack p-4">
      <div>
        <label className="tx-up block mb-1">Routine name</label>
        <input className="input" placeholder="e.g. Upper / Lower 4-day" value={draft.name} onChange={(e) => onUpdate({ name: e.target.value })} autoFocus />
      </div>
      <div>
        <label className="tx-up block mb-1">Description (optional)</label>
        <input className="input" placeholder="Brief notes on goals or structure" value={draft.description} onChange={(e) => onUpdate({ description: e.target.value })} />
      </div>
      <div>
        <p className="tx-up mb-2">Days per week</p>
        <div className="flex gap-2 flex-wrap">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => generateDays(n)}
              className="px-4 py-2 rounded border text-sm font-semibold transition-colors"
              style={{
                background: draft.days.length === n ? "var(--accent-soft)" : "var(--bg-2)",
                borderColor: draft.days.length === n ? "var(--accent)" : "var(--line)",
                color: draft.days.length === n ? "var(--accent)" : "var(--fg)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="button" disabled={!draft.name.trim() || draft.days.length === 0} onClick={onNext}>
        Set up days →
      </button>
    </div>
  );
}

// ── Step 2: Days list ─────────────────────────────────────────────────────────

function DaysStep({ draft, onUpdateDay, onNext, onBack }: {
  draft: Draft;
  onUpdateDay: (id: string, p: Partial<DraftDay>) => void;
  onNext: (dayId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 stack">
        {draft.days.map((day) => {
          const exCount = day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0);
          return (
            <div key={day.id} className="panel flex items-center gap-3" style={{ opacity: day.rest ? 0.55 : 1 }}>
              <div className="flex-1 min-w-0">
                <input
                  className="bg-transparent outline-none font-semibold text-sm w-full"
                  value={day.name}
                  onChange={(e) => onUpdateDay(day.id, { name: e.target.value })}
                />
                <p className="text-xs muted">{day.rest ? "Rest day" : exCount > 0 ? `${exCount} exercise${exCount > 1 ? "s" : ""}` : "No exercises yet"}</p>
              </div>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border"
                style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--fg-3)" }}
                onClick={() => onUpdateDay(day.id, { rest: !day.rest })}
              >
                {day.rest ? "Rest" : "Train"}
              </button>
              {!day.rest && (
                <button type="button" onClick={() => onNext(day.id)} className="p-1 muted">
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="p-4 flex gap-2 shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
        <button type="button" className="button secondary" onClick={onBack}>← Back</button>
        <button type="button" className="button flex-1" onClick={() => {
          const first = draft.days.find((d) => !d.rest);
          if (first) onNext(first.id);
        }}>
          Edit days →
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Day editor ────────────────────────────────────────────────────────

function DayEditorStep({
  day, onUpdateDay, onAddSection, onRemoveSection, onAddExercises, onRemoveExercise, onBack, onSave, saving,
}: {
  day: DraftDay;
  onUpdateDay: (p: Partial<DraftDay>) => void;
  onAddSection: (kind: SectionType) => void;
  onRemoveSection: (id: string) => void;
  onAddExercises: (sectionId: string, items: ExerciseCatalogItem[]) => void;
  onRemoveExercise: (sectionId: string, groupId: string, exId: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const usedKinds = new Set(day.sections.map((s) => s.kind));

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
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
          className="text-xs bg-transparent outline-none w-full mt-0.5 muted"
          placeholder="Add a focus or subtitle…"
          value={day.subtitle}
          onChange={(e) => onUpdateDay({ subtitle: e.target.value })}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 stack">
        {day.sections.map((section) => {
          const meta = sectionMeta(section.kind);
          const exCount = section.groups.reduce((n, g) => n + g.exercises.length, 0);
          return (
            <div key={section.id} className="panel">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: sectionColor(section.kind), minHeight: 16 }} />
                <span className="tx-up flex-1">{meta.glyph} {meta.label}</span>
                <span className="text-xs muted">{exCount} ex</span>
                <button type="button" onClick={() => onRemoveSection(section.id)}>
                  <Trash2 size={13} style={{ color: "var(--fg-3)" }} />
                </button>
              </div>
              {section.groups.flatMap((g) =>
                g.exercises.map((ex) => (
                  <div key={ex.id} className="flex items-center gap-2 py-1.5 border-b" style={{ borderColor: "var(--line)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ex.name}</p>
                      <p className="text-[10px]" style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
                        {ex.muscles[0] ?? "—"} · {ex.equipment[0] ?? "—"}
                      </p>
                    </div>
                    <button type="button" onClick={() => onRemoveExercise(section.id, g.id, ex.id)}>
                      <X size={12} style={{ color: "var(--fg-3)" }} />
                    </button>
                  </div>
                ))
              )}
              <button type="button" className="flex items-center gap-2 mt-2 text-xs w-full py-1.5" style={{ color: "var(--accent)" }} onClick={() => setPickerSectionId(section.id)}>
                <Plus size={13} /> Add exercise
              </button>
            </div>
          );
        })}

        {!addingSection ? (
          <button type="button" className="panel flex items-center justify-center gap-2 py-3 border-dashed text-sm muted w-full" onClick={() => setAddingSection(true)}>
            <Plus size={14} /> Add section
          </button>
        ) : (
          <div className="panel stack">
            <p className="tx-up text-xs">Section type</p>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_TYPES_META.filter((s) => !usedKinds.has(s.kind)).map((s) => (
                <button
                  key={s.kind}
                  type="button"
                  className="flex items-start gap-2 p-2 rounded border text-left"
                  style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
                  onClick={() => { onAddSection(s.kind); setAddingSection(false); }}
                >
                  <span style={{ color: sectionColor(s.kind) }}>{s.glyph}</span>
                  <div>
                    <p className="text-xs font-semibold">{s.label}</p>
                    <p className="text-[10px] muted">{s.hint}</p>
                  </div>
                </button>
              ))}
            </div>
            <button type="button" className="button secondary" onClick={() => setAddingSection(false)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="p-4 flex gap-2 shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
        <button type="button" className="button secondary" onClick={onBack}>← Days</button>
        <button type="button" className="button flex-1" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save routine"}</button>
      </div>

      {pickerSectionId && (
        <ExercisePickerSheet
          onAdd={(items) => { onAddExercises(pickerSectionId, items); setPickerSectionId(null); }}
          onClose={() => setPickerSectionId(null)}
        />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

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
    setDraft((d) => ({ ...d, days: d.days.map((day) => (day.id === id ? { ...day, ...patch } : day)) }));
  }

  const editingDay = draft.days.find((d) => d.id === editingDayId) ?? null;

  function addSection(kind: SectionType) {
    if (!editingDayId || !editingDay) return;
    updateDay(editingDayId, { sections: [...editingDay.sections, { id: crypto.randomUUID(), kind, groups: [] }] });
  }

  function removeSection(sectionId: string) {
    if (!editingDayId || !editingDay) return;
    updateDay(editingDayId, { sections: editingDay.sections.filter((s) => s.id !== sectionId) });
  }

  function addExercises(sectionId: string, items: ExerciseCatalogItem[]) {
    if (!editingDayId || !editingDay) return;
    updateDay(editingDayId, {
      sections: editingDay.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const newGroup: DraftGroup = {
          id: crypto.randomUUID(),
          exercises: items.map((item) => ({
            id: crypto.randomUUID(),
            catalogId: item.id,
            name: item.name,
            sets: 3,
            reps: "8-10",
            muscles: item.muscles.primary,
            equipment: item.equipment,
          })),
        };
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
            .map((g) => g.id !== groupId ? g : { ...g, exercises: g.exercises.filter((e) => e.id !== exId) })
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
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
        <button type="button" onClick={() => router.push("/programs")} className="muted text-xl">←</button>
        <h1 className="font-bold text-base flex-1">{draft.name || "New routine"}</h1>
      </div>

      <Stepper step={step} trainDayCount={trainDayCount} />

      <div className="flex-1 overflow-hidden">
        {step === "setup" && <SetupStep draft={draft} onUpdate={updateDraft} onNext={() => setStep("days")} />}
        {step === "days" && <DaysStep draft={draft} onUpdateDay={updateDay} onNext={(dayId) => { setEditingDayId(dayId); setStep("edit"); }} onBack={() => setStep("setup")} />}
        {step === "edit" && editingDay && (
          <DayEditorStep
            day={editingDay}
            onUpdateDay={(patch) => updateDay(editingDay.id, patch)}
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
