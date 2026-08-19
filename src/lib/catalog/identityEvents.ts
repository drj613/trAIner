export function dispatchExerciseIdentityChanged(): void {
  window.dispatchEvent(new CustomEvent("trainer-exercise-identity-changed"));
}

export type IdentityWriteOptions = { dispatch?: boolean };
