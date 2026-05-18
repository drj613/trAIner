import { useState } from "react";
import { X } from "lucide-react";
import type { ProgramExercise } from "@/lib/programs/types";

type Props = {
  exercise: ProgramExercise;
  onSave: (patch: Partial<ProgramExercise>) => void;
  onClose: () => void;
};

export function ExerciseEditSheet({ exercise, onSave, onClose }: Props) {
  const [sets, setSets] = useState<string>(exercise.sets?.toString() ?? "");
  const [reps, setReps] = useState<string>(exercise.reps ?? "");
  const [load, setLoad] = useState<string>(exercise.load ?? "");
  const [rest, setRest] = useState<string>(exercise.rest ?? "");
  const [notes, setNotes] = useState<string>(exercise.notes ?? "");

  function submit() {
    const patch: Partial<ProgramExercise> = {
      sets: sets.trim() ? Number(sets) : undefined,
      reps: reps.trim() || undefined,
      load: load.trim() || undefined,
      rest: rest.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    onSave(patch);
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line)",
          borderRadius: "12px 12px 0 0",
          padding: "12px 16px 16px",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="tx-up flex-1">Edit {exercise.name}</span>
          <button type="button" onClick={onClose} className="p-1 muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sets">
            <input
              type="number"
              min={1}
              max={20}
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              className="input w-full"
            />
          </Field>
          <Field label="Reps">
            <input value={reps} onChange={(e) => setReps(e.target.value)} className="input w-full" />
          </Field>
          <Field label="Load">
            <input value={load} onChange={(e) => setLoad(e.target.value)} className="input w-full" />
          </Field>
          <Field label="Rest">
            <input value={rest} onChange={(e) => setRest(e.target.value)} className="input w-full" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="input w-full"
          />
        </Field>
        <button type="button" className="button w-full mt-3" onClick={submit}>
          Save
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2">
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
