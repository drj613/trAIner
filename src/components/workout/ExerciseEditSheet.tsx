import { useState } from "react";
import { X } from "lucide-react";
import { useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import {
  ExerciseCorrectionSheet,
  type CorrectionTarget,
} from "@/components/catalog/ExerciseCorrectionSheet";
import type { ProgramExercise } from "@/lib/programs/types";

type Props = {
  exercise: ProgramExercise;
  onSave: (patch: Partial<ProgramExercise>) => void;
  onClose: () => void;
  error?: string | null;
};

/**
 * The identity half of editing an exercise, kept behind a click.
 *
 * Two reasons it is its own component rather than part of the form. It is the
 * shared correction sheet, not a second set of identity controls wedged between
 * sets and reps — the spec is explicit that the editor links rather than
 * duplicates. And it is the only part of this sheet that needs the
 * normalization context, so mounting it on demand keeps the plain editor
 * renderable without a provider.
 */
function IdentityCorrection({ exercise, onClose }: { exercise: ProgramExercise; onClose: () => void }) {
  const { resolve, context } = useExerciseNormalization();
  // Same rule the library's `Needs review` uses: correct the concrete exercise
  // when the resolver found one, and the text otherwise. A slot id is not a
  // name and is never offered as a correction target.
  const concreteId = resolve({
    kind: "stored-exercise",
    canonicalExerciseId: exercise.canonicalExerciseId,
    slotId: exercise.id,
    performedName: exercise.name,
  }).concreteExerciseId;
  const isUserExercise = concreteId !== undefined
    && context.userExercises.some((candidate) => candidate.id === concreteId);
  const target: CorrectionTarget = concreteId
    ? { kind: isUserExercise ? "user-exercise" : "catalog-exercise", exerciseId: concreteId, name: exercise.name }
    : { kind: "normalized-name", value: exercise.name };

  return <ExerciseCorrectionSheet target={target} onClose={onClose} />;
}

export function ExerciseEditSheet({ exercise, onSave, onClose, error }: Props) {
  const [correcting, setCorrecting] = useState(false);
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
      // unit intentionally untouched — it lives on the exercise row as a
      // quick toggle, not in this form.
      notes: notes.trim() || undefined,
    };
    onSave(patch);
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line)",
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
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
        {error && (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 12, marginBottom: 8 }}>
            {error}
          </p>
        )}
        <button type="button" className="button w-full mt-3" onClick={submit}>
          Save
        </button>
        <div className="mt-3">
          {correcting ? (
            <IdentityCorrection exercise={exercise} onClose={() => setCorrecting(false)} />
          ) : (
            <button type="button" className="btn ghost" onClick={() => setCorrecting(true)}>
              Change movement or modifiers
            </button>
          )}
        </div>
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
