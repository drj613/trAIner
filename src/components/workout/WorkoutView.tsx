import type { ProgramDay, ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";
import { toTitleCase } from "@/lib/catalog/normalize";

type Props = {
  program: ProgramDocument;
  day: ProgramDay;
  recentLogs?: WorkoutLogDocument[];
};

export function WorkoutView({ program, day, recentLogs = [] }: Props) {
  return (
    <div className="stack">
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal muted">{program.title}</p>
        <h1 className="text-2xl font-bold">{day.title}</h1>
      </div>

      {day.sections.map((section) => (
        <section key={section.id} className="stack">
          <div className="sticky top-0 z-10 border-y border-[var(--line)] bg-[var(--background)] py-2">
            <h2 className="text-base font-bold">{section.name}</h2>
          </div>
          {section.groups.map((group) => (
            <div key={group.id} className="panel stack">
              {group.type !== "single" ? <p className="text-sm font-bold uppercase tracking-normal text-[var(--accent-strong)]">{group.type}</p> : null}
              {group.notes ? <p className="text-sm muted">{group.notes}</p> : null}
              {group.exercises.map((exercise) => (
                <article key={exercise.id} className="border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{toTitleCase(exercise.name)}</h3>
                      <p className="text-sm muted">
                        {[exercise.sets ? `${exercise.sets} sets` : undefined, exercise.reps, exercise.load, exercise.rest ? `rest ${exercise.rest}` : undefined]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {exercise.canonicalExerciseId ? <span className="rounded border border-[var(--line)] px-2 py-1 text-xs">matched</span> : null}
                  </div>
                  {exercise.notes ? <p className="mt-2 text-sm">{exercise.notes}</p> : null}
                </article>
              ))}
            </div>
          ))}
        </section>
      ))}

      {recentLogs.length > 0 ? (
        <section className="panel">
          <h2 className="font-bold">Recent History</h2>
          <p className="text-sm muted">{recentLogs.length} local log entries saved for this day.</p>
        </section>
      ) : null}
    </div>
  );
}
