import { deriveNeedsReview } from "@/components/catalog/LibraryClient";
import { resolveExerciseIdentity, type ExerciseIdentityInput } from "@/lib/catalog/identity";
import { createMigrationContext } from "@/lib/storage/migrations/v10Identity";
import type { ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";

/**
 * The resolver is typed as if every name it receives is a string. Nothing
 * enforces that on the way in: `appDb`'s v7 rule deliberately keeps a log whose
 * `entries` it cannot read, `restoreBackup` no longer validates `logs[].entries`
 * at all (the boundary rule in `backup.ts`), and neither ever inspected an
 * entry's `exerciseName`. So a hand-edited or foreign backup restores cleanly
 * and then reaches this function with a number or an object where a name
 * should be.
 *
 * Before the guard, every one of these threw
 * `TypeError: value.toLowerCase is not a function` out of
 * `normalizeExerciseName`. `deriveNeedsReview` runs inside a `useMemo` during
 * `LibraryClient`'s render and the app has no error boundary, so one such entry
 * blanked the whole `/library` page — the same consequence, from the same
 * `?? ""` class of guard, that the `entries` sweep fixed fifteen lines above it.
 *
 * The rule, matching the one already settled elsewhere in this codebase
 * (`historyUtils.entryPerformedName`, `v10Identity.isReadableText`): a name we
 * cannot read is treated as ABSENT, never as text. Absent is a shape the
 * resolver already handles — it falls back to the slot, which is what an
 * unnamed entry has always done.
 */
const context = createMigrationContext([], [], []);
const resolve = (input: ExerciseIdentityInput) => resolveExerciseIdentity(input, context);

describe("resolveExerciseIdentity — a name it cannot read", () => {
  it("treats a non-string performedName as absent and groups the entry by its slot", () => {
    const identity = resolve({
      kind: "stored-exercise",
      slotId: "slot-1",
      performedName: 7 as unknown as string,
    });
    expect(identity.groupKey).toBe("slot:slot-1");
    expect(identity.specificity).toBe("unmatched");
    // Never the unreadable value itself: the row type promises a string, and a
    // non-string label is what makes React throw on render.
    expect(typeof identity.displayLabel).toBe("string");
    expect(identity.performedName).toBeUndefined();
  });

  it("still resolves a stored exercise by its canonical id when the name is unreadable", () => {
    // The name being unreadable must not cost the user a resolution they would
    // otherwise have had — the canonical id is checked first and still wins.
    const identity = resolve({
      kind: "stored-exercise",
      canonicalExerciseId: "barbell-high-bar-squat",
      slotId: "slot-1",
      performedName: {} as unknown as string,
    });
    expect(identity.concreteExerciseId).toBe("barbell-high-bar-squat");
    expect(identity.movementId).toBe("squat");
  });

  it("treats a non-string import name as absent", () => {
    const identity = resolve({ kind: "import-name", name: {} as unknown as string });
    expect(identity.source).toBe("standalone");
    expect(typeof identity.displayLabel).toBe("string");
  });

  it("treats a non-string custom-exercise name as absent and keeps its id as the group key", () => {
    const identity = resolve({ kind: "custom-exercise", exerciseId: "user-1", name: 7 as unknown as string });
    expect(identity.groupKey).toBe("exercise:user-1");
    expect(typeof identity.displayLabel).toBe("string");
  });

  it("treats a non-string canonicalExerciseId as unresolvable rather than throwing", () => {
    const identity = resolve({ kind: "catalog-reference", canonicalExerciseId: 7 as unknown as string });
    expect(identity.concreteExerciseId).toBeUndefined();
    expect(typeof identity.displayLabel).toBe("string");
  });

  it("keeps readable names resolving exactly as before", () => {
    // The control. A guard that also changed the healthy path would be a worse
    // bug than the one it fixes.
    expect(resolve({ kind: "import-name", name: "High Bar Back Squat" })).toMatchObject({
      concreteExerciseId: "barbell-high-bar-squat",
      movementId: "squat",
    });
    expect(resolve({ kind: "stored-exercise", slotId: "s", performedName: "High Bar Back Squat" }))
      .toMatchObject({ concreteExerciseId: "barbell-high-bar-squat", performedName: "High Bar Back Squat" });
  });
});

describe("deriveNeedsReview — a log entry whose name is unreadable", () => {
  const log = {
    id: "l1",
    programId: "p1",
    dayId: "d1",
    performedAt: "2026-08-10T12:00:00.000Z",
    entries: [
      { exerciseId: "e1", exerciseName: 7, sets: [{ setNumber: 1, weight: 10, reps: 5 }] },
      { exerciseId: "e2", exerciseName: "Wobble Board Thing", sets: [{ setNumber: 1, weight: 10, reps: 5 }] },
    ],
  } as unknown as WorkoutLogDocument;

  // The routine side of the same field. Mutation found it unpinned: reverting
  // `programCandidates` to `?? ""` alone left every other test green, because
  // no fixture passed a program at all.
  const programWithUnreadableName = {
    id: "p1",
    title: "Block",
    source: "manual",
    active: true,
    days: [{
      id: "d1",
      dayNumber: 1,
      title: "Day",
      sections: [{
        id: "s1",
        name: "Main",
        type: "strength",
        groups: [{
          id: "g1",
          type: "single",
          exercises: [
            { id: "slot-1", name: 7, tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
            { id: "slot-2", name: "Wobble Board Thing", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
          ],
        }],
      }],
    }],
    overrides: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  } as unknown as ProgramDocument;

  it("keeps the rest of the page working when a ROUTINE slot's name is unreadable", () => {
    const review = deriveNeedsReview(context, resolve, [programWithUnreadableName], []);
    expect(review.map((item) => item.label)).toContain("Wobble Board Thing");
    for (const item of review) expect(typeof item.label).toBe("string");
  });

  it("keeps the rest of the page working instead of blanking it", () => {
    const review = deriveNeedsReview(context, resolve, [], [log]);
    // The readable sibling still reviews. A guard that dropped the whole log
    // would pass a "does not throw" assertion while losing real rows, so the
    // survivor is the assertion that matters.
    expect(review.map((item) => item.label)).toContain("Wobble Board Thing");
    // And nothing in the list carries a value React cannot render.
    for (const item of review) expect(typeof item.label).toBe("string");
  });
});
