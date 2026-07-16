// Lightweight, best-effort onboarding progress flags. Persisted in
// localStorage (not IndexedDB) since they're throwaway UI hints, not user data.

const PROMPT_COPIED_KEY = "trainer-prompt-copied";

export function markPromptCopied(): void {
  try {
    localStorage.setItem(PROMPT_COPIED_KEY, "1");
  } catch {
    /* storage unavailable (private mode, etc.) — the flag is non-essential */
  }
}

export function hasCopiedPrompt(): boolean {
  try {
    return localStorage.getItem(PROMPT_COPIED_KEY) === "1";
  } catch {
    return false;
  }
}
