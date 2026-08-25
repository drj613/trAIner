import type { CorrectionTarget } from "@/components/catalog/ExerciseCorrectionSheet";
import { textOf } from "./historyUtils";
import type { ExerciseHistoryRow } from "./historyProjection";

/**
 * What the shared correction sheet should be opened about, for a history row.
 *
 * The spec makes the sheet reachable from all-time history rows and the Today
 * drawer, and those two surfaces must ask about the same thing or one of them
 * would quietly write a different override than the other. Hence one function,
 * imported by both, rather than a target built inline at each call site.
 *
 * Two kinds are reachable from a row:
 *
 * - A row the resolver tied to a concrete catalogue version is corrected as
 *   that version, so the override is keyed on a stable id and follows the
 *   exercise however it was spelled.
 * - A row with no concrete version has nothing stable behind it, so it is
 *   corrected as a name. `performedName` is deliberately the value used and NOT
 *   the current label: the name is what is actually stored in the log, and it is
 *   the token an alias or a `normalized-name` override is keyed on.
 *
 * `user-exercise` is not produced here. A stored log entry names a slot and a
 * canonical id, and `resolveExerciseIdentity` reaches a custom exercise only
 * through a saved alias — at which point it comes back with a
 * `concreteExerciseId` and is corrected as a version like any other. There is no
 * row shape from which "this is one of my own exercises" can be told apart.
 *
 * `textOf` on both fields because a corrupt log can hold a non-string there and
 * `CorrectionTarget` promises strings (`historyUtils.ts:161`).
 */
export function correctionTargetForRow(row: ExerciseHistoryRow): CorrectionTarget {
  if (row.concreteExerciseId) {
    return {
      kind: "catalog-exercise",
      exerciseId: row.concreteExerciseId,
      name: textOf(row.currentVersionLabel ?? row.performedName),
    };
  }
  return { kind: "normalized-name", value: textOf(row.performedName) };
}

/**
 * Whether a row is worth offering a correction for.
 *
 * Only rows the catalogue could not tie to a concrete version. Every row could
 * technically be corrected, but history is the densest surface in the app and a
 * per-row control on every line would be noise on the rows that are already
 * right. An unresolved row is the one the user can act on usefully, and it is
 * the one the spec's `Needs review` flow is about.
 */
export function rowNeedsReview(row: ExerciseHistoryRow): boolean {
  return !row.concreteExerciseId;
}
