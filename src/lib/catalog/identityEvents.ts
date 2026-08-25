/**
 * One name, one place, for every listener and dispatcher in the app: the string
 * used to be hand-written at each site, and a typo in any one of them is a
 * silently dead listener that nothing fails on.
 *
 * The tests deliberately keep spelling the literal instead of importing this.
 * A test that imported it would agree with a wrong value, so the literal in the
 * test files is what actually pins the wire name.
 */
export const EXERCISE_IDENTITY_CHANGED_EVENT = "trainer-exercise-identity-changed";

export function dispatchExerciseIdentityChanged(): void {
  window.dispatchEvent(new CustomEvent(EXERCISE_IDENTITY_CHANGED_EVENT));
}

export type IdentityWriteOptions = { dispatch?: boolean };

/**
 * Shared by every identity-affecting repository write. `dispatch: false` is how
 * a caller doing a batch of writes suppresses the intermediate notifications
 * and fires one itself; anything else (including no options at all) notifies.
 */
export function dispatchAfterWrite(options?: IdentityWriteOptions): void {
  if (options?.dispatch !== false) dispatchExerciseIdentityChanged();
}
