export type PersistenceState = "persisted" | "denied" | "unsupported";

let pendingRequest: Promise<PersistenceState> | null = null;

/**
 * Ask the browser to move this origin into the persistent storage bucket,
 * exempting IndexedDB from automatic eviction (disk pressure, Safari's
 * 7-day cap). Safe to call every startup: once granted it stays granted.
 * The in-flight request is shared so a concurrent state read (e.g. Settings
 * mounting right after startup) reflects the request's outcome instead of
 * racing it.
 */
export function requestPersistence(): Promise<PersistenceState> {
  if (!pendingRequest) {
    pendingRequest = (async () => {
      try {
        if (!navigator.storage?.persist) return "unsupported";
        return (await navigator.storage.persist()) ? "persisted" : "denied";
      } catch {
        return "unsupported";
      }
    })().then((state) => {
      // Only a grant is permanent. Forget denials so the Settings
      // "Request protection" button genuinely re-asks the browser (a later
      // request can succeed after install/engagement) instead of replaying
      // the cached "denied" forever.
      if (state !== "persisted") pendingRequest = null;
      return state;
    });
  }
  return pendingRequest;
}

/** For tests only: forget the cached request. */
export function resetPersistenceForTests() {
  pendingRequest = null;
}

/**
 * Current state. If a requestPersistence() call is in flight (startup fires
 * one), await that instead of reading persisted() mid-request.
 */
export async function getPersistenceState(): Promise<PersistenceState> {
  if (pendingRequest) return pendingRequest;
  try {
    if (!navigator.storage?.persisted) return "unsupported";
    return (await navigator.storage.persisted()) ? "persisted" : "denied";
  } catch {
    return "unsupported";
  }
}
