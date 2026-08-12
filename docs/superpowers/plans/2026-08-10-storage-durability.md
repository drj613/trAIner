# Storage Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the durability defects from `.reviews/2026-08-10/00-storage-persistence-audit.md` — stop the browser from silently evicting data, stop autosave from losing the last edits of a workout, make the PWA installable, and make snapshots/restore honest and safe.

**Architecture:** All changes stay inside the existing local-first design: IndexedDB via `idb`, no server. Work is ordered by (loss prevented ÷ effort) per the audit: lifecycle autosave flush → `persist()` → PWA base paths + fetch strategy → snapshot retention → upgrade-blocked handlers → restore validation → save serialization → small cleanups → iOS install explainer.

**Scope note:** S4 (versioned exports + shared migration path) is **deliberately excluded** — the audit says it deserves its own brainstorm/design session before planning. Everything else (S1–S3, S5–S10, plus the agreed iOS install prompt) is here.

**Tech Stack:** React 19, Vite (base `/trAIner/`), TypeScript, `idb`, Jest + Testing Library + `fake-indexeddb`, deployed to GitHub Pages.

**Testing conventions:** Unit/integration tests run with `npx jest <path> -v`. Prefer `fake-indexeddb` integration tests over repo mocks where the behavior under test is a real DB interaction (see memory: logRepo mocks have hidden real bugs before). Hook tests use `renderHook` from `@testing-library/react`.

---

## File map

| File | Change |
|---|---|
| `src/lib/workout/useDebouncedAutoSave.ts` | Add flush-on-hide lifecycle listener + serialize overlapping saves |
| `src/lib/workout/useDebouncedAutoSave.test.tsx` | **Extend** — file already exists with 6 tests; append, never overwrite |
| `src/lib/storage/persistence.ts` | **New** — `requestPersistence()` wrapper |
| `src/lib/storage/persistence.test.ts` | **New** |
| `src/App.tsx` | Call `requestPersistence()` at startup (fire-and-forget) |
| `src/components/app/SettingsClient.tsx` | Show persistence status; snapshot list w/ delete + relabel; pre-restore auto-download |
| `src/lib/workspace/stats.ts` | Add `snapshotKB` (snapshot weight shown separately from real data) |
| `src/lib/pwa/viteEnv.ts` | **New** — isolates `import.meta.env` so Jest can mock it |
| `src/components/app/DbBlockedBanner.tsx` | **New** — close-other-tabs instruction on blocked DB upgrade |
| `src/components/app/SettingsClient.test.tsx` | Extend existing tests |
| `src/components/pwa/ServiceWorkerRegistration.tsx` | Register with `import.meta.env.BASE_URL` |
| `src/components/pwa/ServiceWorkerRegistration.test.tsx` | **New** |
| `public/sw.js` | Base-relative shell paths; network-first navigations, cache-first assets |
| `public/manifest.webmanifest` | Relative `start_url` and icon paths |
| `index.html` | `%BASE_URL%`-prefixed manifest link |
| `src/lib/storage/backupRepo.ts` | Add `delete`, `prune(keepLast)` |
| `src/lib/storage/backupRepo.test.ts` | **New** — fake-indexeddb tests |
| `src/lib/storage/appDb.ts` | `blocked`/`blocking`/`terminated` handlers |
| `src/lib/backup/backup.ts` | Deep validation before clear; clear `metrics` on restore; single-transaction export |
| `src/lib/backup/backup.test.ts` | Extend |
| `src/components/pwa/InstallPrompt.tsx` | **New** — iOS install explainer with data-migration blurb |
| `src/components/pwa/InstallPrompt.test.tsx` | **New** |

---

### Task 1: Flush autosave when the page is hidden (S3a)

The audit's #1 real-world loss: edits sit in a 1.5s debounce window and vanish on tab close / PWA swipe-away / iOS kill. Add a `pagehide` + `visibilitychange` listener inside the hook that immediately runs the pending save. Track dirtiness so hiding a page with nothing pending does not write.

**Files:**
- Modify: `src/lib/workout/useDebouncedAutoSave.ts`
- Modify: `src/lib/workout/useDebouncedAutoSave.test.tsx` — **this file already exists with 6 tests** (debounce, latest value, status, error, flush). APPEND the new describe blocks below; do not overwrite or remove anything. Reuse its existing imports/setup where they overlap.

- [ ] **Step 1: Write the failing tests**

First rename the existing test file — the StrictMode test below needs JSX, and the file is currently `.ts` (verified):

```bash
git mv src/lib/workout/useDebouncedAutoSave.test.tsx src/lib/workout/useDebouncedAutoSave.test.tsxx
```

Then append to `src/lib/workout/useDebouncedAutoSave.test.tsxx`:

```typescript
function fireVisibilityHidden() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useDebouncedAutoSave lifecycle flush", () => {
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("saves pending value immediately when the page becomes hidden", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" }); // arms the debounce timer
    act(() => { fireVisibilityHidden(); });
    await act(async () => {});
    expect(save).toHaveBeenCalledWith("b");
  });

  it("saves pending value on pagehide", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await act(async () => {});
    expect(save).toHaveBeenCalledWith("b");
  });

  it("does not save on hide when nothing is pending", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    renderHook(({ value }) => useDebouncedAutoSave(value, save, 1500), {
      initialProps: { value: "a" },
    });
    act(() => { fireVisibilityHidden(); });
    await act(async () => {});
    expect(save).not.toHaveBeenCalled();
  });

  it("does not double-save: the debounce timer is cancelled by a hide flush", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "b" } },
    );
    rerender({ value: "b2" });
    act(() => { fireVisibilityHidden(); });
    await act(async () => {});
    act(() => { jest.advanceTimersByTime(2000); });
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not mark the initial value dirty under StrictMode double-mounting", async () => {
    // The real app mounts under React.StrictMode, which replays mount effects.
    // Dirtiness must come from actual value changes, not effect-run counting.
    const { StrictMode } = jest.requireActual<typeof import("react")>("react");
    const save = jest.fn().mockResolvedValue(undefined);
    renderHook(() => useDebouncedAutoSave("a", save, 1500), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    act(() => { jest.advanceTimersByTime(2000); });
    act(() => { fireVisibilityHidden(); });
    await act(async () => {});
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/workout/useDebouncedAutoSave.test.tsx -v`
Expected: FAIL — the first, second, and fourth tests fail (`save` not called / called twice).

- [ ] **Step 3: Implement the lifecycle flush**

Replace `src/lib/workout/useDebouncedAutoSave.ts` with:

```typescript
import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export type UseDebouncedAutoSaveResult = {
  status: AutoSaveStatus;
  /** Force-flush the pending save (e.g. before unmount). */
  flush: () => Promise<void>;
};

/**
 * Run `save(value)` `delayMs` after `value` last changes.
 * Holds onto the original save reference per render via a ref so changing the
 * callback identity does not re-arm the timer.
 *
 * Also flushes pending edits when the page is hidden or unloading
 * (`visibilitychange`/`pagehide`) — the debounce window must not be able to
 * lose the last edits of a workout when a tab or installed PWA is closed.
 */
export function useDebouncedAutoSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delayMs: number,
): UseDebouncedAutoSaveResult {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const saveRef = useRef(save);
  saveRef.current = save;
  const valueRef = useRef(value);
  valueRef.current = value;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // Dirtiness is detected by value identity, not by counting effect runs:
  // StrictMode replays mount effects in dev, so a firstRun flag would mark
  // the untouched initial value dirty and write it on every page hide.
  const lastSeenValueRef = useRef(value);

  async function doSave() {
    dirtyRef.current = false;
    setStatus("saving");
    try {
      await saveRef.current(valueRef.current);
      setStatus("saved");
    } catch (e) {
      console.error("[autoSave] save failed", e);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (Object.is(lastSeenValueRef.current, value)) return;
    lastSeenValueRef.current = value;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void doSave(); }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  useEffect(() => {
    // On hide/unload the JS context may be about to die: start the write
    // immediately. IndexedDB writes begun in pagehide usually complete;
    // writes still sitting in a debounce timer never do.
    function flushIfDirty() {
      if (!dirtyRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void doSave();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flushIfDirty();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushIfDirty);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushIfDirty);
    };
  }, []);

  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }

  return { status, flush };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/workout/useDebouncedAutoSave -v`
Expected: PASS — 6 pre-existing tests + 5 new = 11. The pre-existing tests MUST all still pass; if the initial-value semantics change broke one, fix the implementation, not the old test.

- [ ] **Step 5: Run the existing workout suites to check for regressions**

Run: `npx jest src/components/workout/WorkoutDayClient -v`
Expected: PASS. (These render `WorkoutDayClient`, which uses the hook; the new listeners must not fire saves in read-only sessions — `saveCells` already guards on `sessionModeRef.current !== "active"`, so no change needed there.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/workout/useDebouncedAutoSave.ts src/lib/workout/useDebouncedAutoSave.test.tsx
git commit -m "fix: flush pending autosave when page is hidden or unloading"
```

---

### Task 2: Serialize overlapping autosaves (S3c, S3b)

`doSave` has no lock; two overlapping saves can commit out of order and an older value can overwrite a newer one (`saveCells` is read-then-replace-whole-document). Chain every save onto an in-flight promise so writes are strictly ordered. This also makes the unmount `void flush()` safe relative to any later save.

**Files:**
- Modify: `src/lib/workout/useDebouncedAutoSave.ts`
- Modify: `src/lib/workout/useDebouncedAutoSave.test.tsx`

- [ ] **Step 1: Write the failing test**

First rename the existing test file — the StrictMode test below needs JSX, and the file is currently `.ts` (verified):

```bash
git mv src/lib/workout/useDebouncedAutoSave.test.tsx src/lib/workout/useDebouncedAutoSave.test.tsxx
```

Then append to `src/lib/workout/useDebouncedAutoSave.test.tsxx`:

```typescript
describe("useDebouncedAutoSave serialization", () => {
  it("never starts a save while a previous save is still running", async () => {
    let running = 0;
    let maxConcurrent = 0;
    const resolvers: Array<() => void> = [];
    const save = jest.fn().mockImplementation(() => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      return new Promise<void>((resolve) => {
        resolvers.push(() => { running -= 1; resolve(); });
      });
    });
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => { jest.advanceTimersByTime(1500); });
    // The queued save starts on a microtask — flush the microtask queue
    // before asserting, or save #1 won't have started yet.
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b"); // #1 running, unresolved

    rerender({ value: "c" });
    let flushPromise: Promise<void>;
    act(() => { flushPromise = result.current.flush(); });
    await act(async () => {});
    expect(maxConcurrent).toBe(1); // #2 must be queued, not concurrent

    await act(async () => { resolvers[0](); }); // finish #1 → #2 starts
    await act(async () => { resolvers[1](); }); // finish #2
    await act(async () => { await flushPromise!; });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
  });

  it("coalesces back-to-back hide events into one save", async () => {
    // visibilitychange(hidden) and pagehide fire back-to-back on real tab
    // closes, before any microtask runs — they must not enqueue two saves.
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    act(() => {
      fireVisibilityHidden();
      window.dispatchEvent(new Event("pagehide")); // same tick, no await between
    });
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/workout/useDebouncedAutoSave.test.tsx -t serialization -v`
Expected: FAIL — `maxConcurrent` is 2.

- [ ] **Step 3: Implement the save queue**

In `src/lib/workout/useDebouncedAutoSave.ts`, add a queue ref next to `dirtyRef`:

```typescript
  const queueRef = useRef<Promise<void>>(Promise.resolve());
```

and replace `doSave` with:

```typescript
  function doSave(): Promise<void> {
    // Clear dirtiness SYNCHRONOUSLY at enqueue time, not inside the queued
    // task: visibilitychange(hidden) and pagehide fire back-to-back in the
    // same tick, and both would otherwise see dirty=true and double-enqueue.
    dirtyRef.current = false;
    // Serialize: a save never starts until the previous one settles, so a
    // slow older write can never land after (and clobber) a newer one.
    const run = queueRef.current.then(async () => {
      setStatus("saving");
      try {
        await saveRef.current(valueRef.current);
        setStatus("saved");
      } catch (e) {
        console.error("[autoSave] save failed", e);
        setStatus("error");
      }
    });
    queueRef.current = run;
    return run;
  }
```

And make `flush()` a no-op (beyond awaiting any in-flight save) when nothing is pending, so the unmount `void flush()` doesn't enqueue a redundant write after a hide-flush already saved:

```typescript
  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) {
      await queueRef.current; // nothing new to write; just settle in-flight
      return;
    }
    await doSave();
  }
```

(`flushIfDirty` in the lifecycle effect already checks `dirtyRef` before calling `doSave`, so it needs no change.)

- [ ] **Step 4: Run the full hook suite**

Run: `npx jest src/lib/workout/useDebouncedAutoSave -v`
Expected: PASS — all 13 (6 pre-existing + 5 from Task 1 + 2 new). If the pre-existing flush test called `flush()` without a preceding value change, it will now observe a no-op — that's the intended new semantics; update that test's setup to change the value first.

- [ ] **Step 5: Close the skip-path race**

The hook queue only serializes the hook's own saves. `handleSkip` (`WorkoutDayClient.tsx:827`) calls `saveCells` directly; a queued autosave flush can still overlap it and land last WITHOUT `skippedAt`, silently un-skipping the day. `finishWorkout` already handles this by `await flush()` before its direct save (`WorkoutDayClient.tsx:804`) — give `handleSkip` the same treatment. In `handleSkip`, before the `saveCells(..., { skippedAt: ... })` call, add:

```typescript
      await flush(); // drain pending autosave so it can't land after (and erase) the skip
```

- [ ] **Step 6: Run workout suites for regressions**

Run: `npx jest src/components/workout -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workout/useDebouncedAutoSave.ts src/lib/workout/useDebouncedAutoSave.test.tsx src/components/workout/WorkoutDayClient.tsx
git commit -m "fix: serialize autosave writes so a stale save cannot clobber a newer one"
```

---

### Task 3: Request persistent storage at startup and show the result (S1)

One `navigator.storage.persist()` call moves the origin out of the evictable bucket. Wrap it in a small module (the API is absent in some browsers and in jsdom), call it once at startup, and surface the state in Settings.

**Files:**
- Create: `src/lib/storage/persistence.ts`
- Create: `src/lib/storage/persistence.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/app/SettingsClient.tsx`
- Modify: `src/components/app/SettingsClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/storage/persistence.test.ts
import { requestPersistence, getPersistenceState, resetPersistenceForTests } from "./persistence";

describe("requestPersistence", () => {
  const originalStorage = navigator.storage;

  beforeEach(() => { resetPersistenceForTests(); });

  afterEach(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: originalStorage,
    });
  });

  function mockStorage(overrides: Partial<StorageManager>) {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: overrides,
    });
  }

  it("returns 'persisted' when the browser grants the request", async () => {
    mockStorage({ persist: jest.fn().mockResolvedValue(true) });
    await expect(requestPersistence()).resolves.toBe("persisted");
  });

  it("returns 'denied' when the browser refuses", async () => {
    mockStorage({ persist: jest.fn().mockResolvedValue(false) });
    await expect(requestPersistence()).resolves.toBe("denied");
  });

  it("returns 'unsupported' when the API is missing", async () => {
    mockStorage({});
    await expect(requestPersistence()).resolves.toBe("unsupported");
  });

  it("returns 'unsupported' when persist() throws", async () => {
    mockStorage({ persist: jest.fn().mockRejectedValue(new Error("nope")) });
    await expect(requestPersistence()).resolves.toBe("unsupported");
  });

  it("re-asks the browser after a denial (denials are not cached)", async () => {
    const persist = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockStorage({ persist });
    await expect(requestPersistence()).resolves.toBe("denied");
    await expect(requestPersistence()).resolves.toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("caches a grant (persist() not called again)", async () => {
    const persist = jest.fn().mockResolvedValue(true);
    mockStorage({ persist });
    await requestPersistence();
    await requestPersistence();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("getPersistenceState", () => {
  beforeEach(() => { resetPersistenceForTests(); });

  it("reports persisted() without re-requesting", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persisted: jest.fn().mockResolvedValue(true) },
    });
    await expect(getPersistenceState()).resolves.toBe("persisted");
  });

  it("awaits an in-flight requestPersistence() instead of racing it", async () => {
    let resolvePersist!: (v: boolean) => void;
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persist: jest.fn().mockReturnValue(new Promise<boolean>((r) => { resolvePersist = r; })),
        persisted: jest.fn().mockResolvedValue(false), // would wrongly say "denied"
      },
    });
    const request = requestPersistence(); // startup fires this
    const state = getPersistenceState();  // Settings mounts mid-request
    resolvePersist(true);
    await expect(state).resolves.toBe("persisted");
    await expect(request).resolves.toBe("persisted");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/storage/persistence.test.ts -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

```typescript
// src/lib/storage/persistence.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/storage/persistence.test.ts -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Call it at startup**

In `src/App.tsx`, add the import and a module-level fire-and-forget call (before the component, next to the other imports):

```typescript
import { requestPersistence } from "@/lib/storage/persistence";

void requestPersistence();
```

- [ ] **Step 6: Surface the state in Settings**

In `src/components/app/SettingsClient.tsx`:

Add import:

```typescript
import { getPersistenceState, requestPersistence, type PersistenceState } from "@/lib/storage/persistence";
```

Add state + effect inside `SettingsClient` (next to the `stats` effect):

```typescript
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);

  useEffect(() => {
    getPersistenceState().then(setPersistence);
  }, []);
```

Replace the `local · {sizeLabel}` span in the Workspace stats panel header with:

```tsx
          <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
            local · {sizeLabel} ·{" "}
            <span style={{ color: persistence === "persisted" ? "var(--good, #7fc77a)" : "var(--warn, #e6b664)" }}>
              {persistence === "persisted" ? "protected"
                : persistence === "denied" ? "evictable"
                : persistence === "unsupported" ? "unprotected"
                : "…"}
            </span>
          </span>
```

And in the Local-first blurb, after the existing sentence, add a conditional line:

```tsx
        {persistence !== "persisted" && persistence !== null && (
          <div style={{ marginTop: 6, color: "var(--warn, #e6b664)" }}>
            The browser has not granted persistent storage — it may delete this
            data under disk pressure or inactivity. Export regularly.{" "}
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => requestPersistence().then(setPersistence)}
            >
              Request protection
            </button>
          </div>
        )}
```

- [ ] **Step 7: Add a Settings test**

In `src/components/app/SettingsClient.test.tsx`, add (mirroring the file's existing mock style — check its top-of-file mocks and add):

```typescript
jest.mock("@/lib/storage/persistence", () => ({
  getPersistenceState: jest.fn().mockResolvedValue("persisted"),
  requestPersistence: jest.fn().mockResolvedValue("persisted"),
}));
```

and a test:

```typescript
it("shows storage protection state", async () => {
  render(<SettingsClient />);
  expect(await screen.findByText(/protected/)).toBeInTheDocument();
});
```

- [ ] **Step 8: Run the suites**

Run: `npx jest src/components/app/SettingsClient.test.tsx src/lib/storage/persistence.test.ts -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/storage/persistence.ts src/lib/storage/persistence.test.ts src/App.tsx src/components/app/SettingsClient.tsx src/components/app/SettingsClient.test.tsx
git commit -m "feat: request persistent storage at startup and surface the result in Settings"
```

---

### Task 4: Fix PWA base paths and the service-worker fetch strategy together (S7)

Everything PWA assumes domain root but the app deploys under `/trAIner/`. Fix registration, shell paths, and manifest in one change, and switch navigations to network-first at the same time so we never ship the cache-first-forever trap.

**Files:**
- Modify: `src/components/pwa/ServiceWorkerRegistration.tsx`
- Create: `src/components/pwa/ServiceWorkerRegistration.test.tsx`
- Modify: `public/sw.js`
- Modify: `public/manifest.webmanifest`
- Modify: `index.html`

**Jest constraint:** this repo runs ts-jest in CommonJS mode, which cannot parse `import.meta` in any module a test imports. So the Vite env access must live in its own module that tests replace with `jest.mock` (the mock prevents the real file from ever being parsed by Jest). The existing `ServiceWorkerRegistration.tsx` gets away with inline `import.meta.env.PROD` only because no test currently imports it — we're adding one, so it must move.

- [ ] **Step 1: Create the env module**

```typescript
// src/lib/pwa/viteEnv.ts
// Isolated so Jest (CommonJS ts-jest, which cannot parse import.meta) can
// jest.mock this module instead of parsing it. Keep ALL import.meta access here.
export const BASE_URL: string = import.meta.env.BASE_URL;
export const IS_PROD: boolean = import.meta.env.PROD;
```

- [ ] **Step 2: Write the failing registration test**

```tsx
// src/components/pwa/ServiceWorkerRegistration.test.tsx
import { render } from "@testing-library/react";

jest.mock("@/lib/pwa/viteEnv", () => ({ BASE_URL: "/trAIner/", IS_PROD: true }));

import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";

describe("ServiceWorkerRegistration", () => {
  it("registers sw.js under the Vite base path with a matching scope", () => {
    const register = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    render(<ServiceWorkerRegistration />);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/trAIner/sw.js", { scope: "/trAIner/" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest src/components/pwa/ServiceWorkerRegistration.test.tsx -v`
Expected: FAIL — the component still hardcodes `/sw.js` with no scope (or the suite fails to compile on the component's inline `import.meta`, which the next step removes).

- [ ] **Step 4: Implement registration with base path**

Replace `src/components/pwa/ServiceWorkerRegistration.tsx` with:

```tsx
"use client";

import { useEffect } from "react";
import { BASE_URL, IS_PROD } from "@/lib/pwa/viteEnv";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !IS_PROD) return;
    navigator.serviceWorker
      .register(`${BASE_URL}sw.js`, { scope: BASE_URL })
      .catch((e) => console.error("[sw] registration failed", e));
  }, []);

  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/components/pwa/ServiceWorkerRegistration.test.tsx -v`
Expected: PASS.

- [ ] **Step 6: Rewrite `public/sw.js`** (no unit test — verified by build + preview below)

Derive the base from the registration scope so the file works at any base, and split the strategy: network-first for navigations (fresh app shell whenever online), cache-first for everything else (hashed assets are immutable).

Three constraints shape this file (all from adversarial review):

- **Client routes are NOT precacheable on GitHub Pages.** `/trAIner/today` etc. are SPA routes served by `404.html` *with a 404 status*; `cache.addAll` rejects on any non-2xx, so precaching them makes the install fail every time. Precache only real files, and use the cached root document as the navigation fallback. (`vite preview` serves routes with 200, which hides this — hence the 404-status check in Step 9.)
- **Cache Storage is origin-wide on `*.github.io`.** Deleting "every cache but ours" on activate would wipe caches belonging to other GitHub Pages projects on the same account. Only delete caches we own by prefix.
- **Cache-first only for same-origin hashed assets** (`BASE + "assets/"` — Vite's hashed output dir). Everything else goes to the network. Only cache `response.ok` results, and attach cache writes to `event.waitUntil` so they aren't killed mid-write.

```javascript
const CACHE_PREFIX = "trainer-app-shell-";
const CACHE_NAME = CACHE_PREFIX + "v3";
// Derive the deploy base ("/trAIner/") from where this worker is registered,
// so these paths are correct on GitHub Pages and on localhost preview alike.
const BASE = new URL(self.registration.scope).pathname;
// Real files only — SPA routes return 404-status HTML on GitHub Pages and
// would fail cache.addAll (and be wrong to cache as distinct documents).
const PRECACHE = [BASE, BASE + "manifest.webmanifest", BASE + "icon-192.png", BASE + "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only touch our own caches: Cache Storage is shared across the whole
      // github.io origin, and other projects' caches are not ours to delete.
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(BASE + "today");
    })
  );
});

function cachePut(event, request, response) {
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network-first so a deployed update is picked up immediately;
  // offline, fall back to the cached root document (the SPA shell serves any
  // route). Never pin users to a stale shell — stale shell code running
  // against a newer DB schema throws VersionError and can't open its own data.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Refresh the offline shell under the NORMALIZED key (BASE), not the
          // raw navigation URL: real navigations are /trAIner/today (404 status
          // on Pages — never response.ok) and 404.html's /trAIner/?p=... redirect
          // (a junk cache key per deep link). Without this, the shell cached at
          // install time is served offline forever — the stale-shell/VersionError
          // trap this strategy exists to prevent. sw.js's bytes never change
          // between deploys, so install-time precache alone cannot keep it fresh.
          if (response.ok && sameOrigin) cachePut(event, BASE, response);
          return response;
        })
        .catch(() => caches.match(BASE))
    );
    return;
  }

  // Hashed build assets: cache-first (filenames are content-hashed, so a
  // cached asset is immutable). Populated on first fetch after install.
  if (sameOrigin && url.pathname.startsWith(BASE + "assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) cachePut(event, event.request, response);
          return response;
        });
      })
    );
    return;
  }

  // Everything else (cross-origin, unversioned files): straight to network.
});
```

**Known limitation to record in the commit message:** hashed assets are runtime-cached on first use, not precached (a static `public/sw.js` can't know Vite's hashed filenames). Offline works after the first successful online visit per deploy. Precaching the generated assets needs a build-time SW plugin (e.g. vite-plugin-pwa) — out of scope here, worth a follow-up ticket.

- [ ] **Step 7: Fix the manifest** — `start_url` is `"./"`, NOT `"./today"`: on GitHub Pages `./today` is a 404-status page that bounces through the 404.html redirect on every PWA launch (and can trip Chrome installability checks), while the app already routes `/` → `/today` internally. — manifest URLs resolve relative to the manifest's own URL, so relative paths work at any base. Replace `public/manifest.webmanifest`:

```json
{
  "name": "trAIner",
  "short_name": "trAIner",
  "description": "Local-first workout planner and logger.",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f7f6f2",
  "theme_color": "#1f7a6d",
  "icons": [
    { "src": "./icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 8: Fix the manifest link in `index.html`** — Vite substitutes `%BASE_URL%` in HTML:

Change line 7 from `<link rel="manifest" href="/manifest.webmanifest" />` to:

```html
    <link rel="manifest" href="%BASE_URL%manifest.webmanifest" />
```

Also check the same file for other root-absolute references to `public/` files (e.g. an apple-touch-icon or favicon) and give them the same `%BASE_URL%` treatment.

- [ ] **Step 9: Verify with a production build**

Run: `npm run build`
Then start preview as a background process (it never exits on its own — do not run it foreground):

```bash
npx vite preview &   # if your execution harness runs each command in a fresh shell, use its background-task mechanism instead
sleep 2
curl -fsS http://localhost:4173/trAIner/sw.js | head -3
curl -fsS http://localhost:4173/trAIner/manifest.webmanifest
grep -o 'href="/trAIner/manifest.webmanifest"' dist/index.html
pkill -f "vite preview"   # job-control %1 does not survive across separate shell invocations
```

Expected: both curls succeed (`-f` makes a 404 a hard failure), the manifest shows the relative `start_url`, and the grep matches (proving `%BASE_URL%` was substituted).

Also confirm every PRECACHE entry is a real file in the build output (preview serves SPA routes with a 200 that GitHub Pages will NOT, so do not "verify" route precaching against preview):

```bash
ls dist/index.html dist/manifest.webmanifest dist/icon-192.png dist/icon-512.png
```

- [ ] **Step 10: Run the full test suite**

Run: `npx jest src/components/pwa -v && npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/pwa/viteEnv.ts src/components/pwa/ServiceWorkerRegistration.tsx src/components/pwa/ServiceWorkerRegistration.test.tsx public/sw.js public/manifest.webmanifest index.html
git commit -m "fix: serve PWA under /trAIner/ base and use network-first navigations"
```

---

### Task 5: Snapshot retention, deletion, and honest labeling (S2)

Snapshots live in the same DB they "protect" and grow without bound. Add `delete` and `prune` to the repo, auto-prune to the last 10 on save, and relabel the UI so a downloaded file is the durability action and snapshots read as undo-points.

**Files:**
- Modify: `src/lib/storage/backupRepo.ts`
- Create: `src/lib/storage/backupRepo.test.ts`
- Modify: `src/components/app/SettingsClient.tsx`
- Modify: `src/components/app/SettingsClient.test.tsx`

- [ ] **Step 1: Write the failing repo tests** (real DB via fake-indexeddb — repo behavior, don't mock the repo)

```typescript
// src/lib/storage/backupRepo.test.ts
import "fake-indexeddb/auto";
import { backupRepo } from "./backupRepo";
import { resetDbConnection } from "./appDb";
import type { BackupDocument } from "@/lib/programs/types";

function makeBackup(exportedAt: string): BackupDocument {
  return {
    version: 1,
    exportedAt,
    profile: null,
    programs: [],
    logs: [],
    aliases: [],
    userExercises: [],
    bodyweight: [],
    promptPresets: [],
  } as unknown as BackupDocument;
}

describe("backupRepo", () => {
  beforeEach(() => {
    resetDbConnection();
    indexedDB = new IDBFactory(); // fresh db per test (fake-indexeddb global)
  });

  it("deletes a snapshot by id", async () => {
    await backupRepo.save(makeBackup("2026-01-01T00:00:00.000Z"));
    await backupRepo.save(makeBackup("2026-01-02T00:00:00.000Z"));
    await backupRepo.delete("2026-01-01T00:00:00.000Z");
    const left = await backupRepo.list();
    expect(left.map((b) => b.id)).toEqual(["2026-01-02T00:00:00.000Z"]);
  });

  it("prunes to the newest N snapshots", async () => {
    for (let d = 1; d <= 12; d++) {
      await backupRepo.save(makeBackup(`2026-01-${String(d).padStart(2, "0")}T00:00:00.000Z`));
    }
    await backupRepo.prune(10);
    const left = await backupRepo.list();
    expect(left).toHaveLength(10);
    expect(left.map((b) => b.id)).not.toContain("2026-01-01T00:00:00.000Z");
    expect(left.map((b) => b.id)).not.toContain("2026-01-02T00:00:00.000Z");
  });

  it("save() auto-prunes to 10", async () => {
    for (let d = 1; d <= 11; d++) {
      await backupRepo.save(makeBackup(`2026-02-${String(d).padStart(2, "0")}T00:00:00.000Z`));
    }
    expect(await backupRepo.list()).toHaveLength(10);
  });
});
```

Note: if `IDBFactory` is not a global in this Jest setup, use `import { IDBFactory } from "fake-indexeddb";` — check how other fake-indexeddb tests in the repo do it and match.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/storage/backupRepo.test.ts -v`
Expected: FAIL — `delete`/`prune` don't exist, auto-prune doesn't happen.

- [ ] **Step 3: Implement**

Replace `src/lib/storage/backupRepo.ts` with:

```typescript
import { getDb } from "./appDb";
import type { BackupDocument } from "@/lib/programs/types";

/** Keep at most this many in-app snapshots. They are undo-points stored in
 * the same database they copy — NOT durable backups — so unbounded growth
 * is pure liability (the only realistic QuotaExceededError path here). */
export const SNAPSHOT_RETENTION = 10;

export const backupRepo = {
  async save(backup: BackupDocument) {
    const id = backup.exportedAt;
    await (await getDb()).put("backups", { ...backup, id });
    await this.prune(SNAPSHOT_RETENTION);
  },

  async list() {
    return (await getDb()).getAll("backups");
  },

  async delete(id: string) {
    await (await getDb()).delete("backups", id);
  },

  /** Delete all but the newest `keep` snapshots (ids are ISO timestamps, so
   * lexicographic order is chronological). */
  async prune(keep: number) {
    const db = await getDb();
    const all = await db.getAll("backups");
    const excess = all
      .map((b) => b.id)
      .sort((a, b) => b.localeCompare(a))
      .slice(keep);
    for (const id of excess) await db.delete("backups", id);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/storage/backupRepo.test.ts -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Show snapshot size separately in stats**

In `src/lib/workspace/stats.ts`, add `snapshotKB` to `WorkspaceStats` and compute it from the snapshots already fetched (approximate by JSON size — good enough for a warning readout):

```typescript
// in the WorkspaceStats type:
  snapshotKB: number;

// in loadWorkspaceStats, before the return:
  const snapshotKB = Math.round(
    snapshots.reduce((sum, s) => sum + JSON.stringify(s).length, 0) / 1024,
  );

// in the returned object:
    snapshotKB,
```

- [ ] **Step 6: Snapshot list with per-item delete, and relabel the Settings UI**

In `src/components/app/SettingsClient.tsx`:

Add state + loader for the list (imports: `backupRepo` is already imported):

```typescript
  const [snapshotList, setSnapshotList] = useState<{ id: string }[]>([]);

  async function refreshSnapshots() {
    const all = await backupRepo.list();
    setSnapshotList(all.map((b) => ({ id: b.id })).sort((a, b) => b.id.localeCompare(a.id)));
  }

  useEffect(() => { void refreshSnapshots(); }, []);

  async function handleDeleteSnapshot(id: string) {
    await backupRepo.delete(id);
    await refreshSnapshots();
    setStats(await loadWorkspaceStats());
  }
```

Call `await refreshSnapshots()` inside `handleSnapshot` after `backupRepo.save`. Below the snapshot `ActionRow`, render the list (quiet rows per DESIGN.md, not cards):

```tsx
        {snapshotList.length > 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {snapshotList.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 12px", borderBottom: "1px dashed var(--line)", color: "var(--fg-3)" }}>
                <span>{s.id.slice(0, 16).replace("T", " ")}</span>
                <button type="button" className="btn ghost" style={{ fontSize: 10, padding: "1px 6px" }} onClick={() => handleDeleteSnapshot(s.id)}>
                  delete
                </button>
              </div>
            ))}
          </div>
        )}
```

Use `stats.snapshotKB` in the snapshot row's `sub` so snapshot weight is visible separately from real data:

```typescript
  const snapshotSub = stats?.snapshots
    ? `${stats.snapshots} snapshot${stats.snapshots !== 1 ? "s" : ""} · ${stats.snapshotKB} KB · last ${stats.lastSnapshotAt ?? "—"}`
    : "no snapshots";
```

Then relabel:

- Change the export row label from `"Export full workspace"` to `"Download backup file"` and its `sub` prefix stays the filename. This is the durability action; keep `variant="primary"`.
- Change the snapshot row to make its non-backup nature explicit:

```tsx
        <ActionRow
          label={snapshotting ? "Saving…" : "Snapshot (undo point)"}
          sub={`${snapshotSub} · stored in-browser, wiped with it — not a backup`}
          onClick={handleSnapshot}
        />
```

- Update the Local-first blurb's last sentence from `"Export to back up or move between devices."` to `"Download a backup file to protect your history or move between devices — in-browser snapshots vanish with the browser data they copy."`

- [ ] **Step 7: Extend Settings tests**

In `src/components/app/SettingsClient.test.tsx` add:

```typescript
it("labels snapshots as undo points, not backups", async () => {
  render(<SettingsClient />);
  expect(await screen.findByText(/undo point/i)).toBeInTheDocument();
  expect(screen.getByText(/not a backup/i)).toBeInTheDocument();
});

it("deletes a snapshot from the list", async () => {
  (backupRepo.list as jest.Mock)
    .mockResolvedValueOnce([{ id: "2026-08-01T00:00:00.000Z" }])
    .mockResolvedValue([]);
  render(<SettingsClient />);
  await userEvent.click(await screen.findByRole("button", { name: /delete/i }));
  await waitFor(() => expect(backupRepo.delete).toHaveBeenCalledWith("2026-08-01T00:00:00.000Z"));
});
```

(**Required mock updates in this suite** — the existing `backupRepo` mock is `{ save }` only, and `refreshSnapshots()` now runs on EVERY mount, so every pre-existing Settings test crashes unless the mock also gets `list: jest.fn().mockResolvedValue([])` and `delete: jest.fn().mockResolvedValue(undefined)`. Also add `snapshotKB: 0` to the `loadWorkspaceStats` mock return so `snapshotSub` doesn't render "undefined KB" in tests that set a snapshot count.)

Fix any existing assertions that referenced the old "Export full workspace" / "Snapshot current state" labels.

- [ ] **Step 8: Run the suites**

Run: `npx jest src/components/app/SettingsClient.test.tsx src/lib/storage/backupRepo.test.ts -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/storage/backupRepo.ts src/lib/storage/backupRepo.test.ts src/lib/workspace/stats.ts src/components/app/SettingsClient.tsx src/components/app/SettingsClient.test.tsx
git commit -m "feat: snapshot retention, deletion, size readout, and honest labeling"
```

---

### Task 6: Handle blocked/blocking DB upgrades (S6)

An old tab holding a v9 connection makes a future v10 upgrade hang forever with no message. Add `blocked`/`blocking`/`terminated` handlers to `openDB`.

**Files:**
- Modify: `src/lib/storage/appDb.ts`

Two subtleties (from adversarial review):

- `blocked` firing means `getDb()` will hang until the other tab goes away — logging is not enough; the user needs an instruction. Surface it as a DOM event that the app shell renders as a banner.
- After `blocking` fires and we close our connection, THIS tab is running stale code: reopening with our compiled `DB_VERSION` against a now-newer database throws `VersionError`. The correct response is to reload the page (picks up the new deploy that shipped the new version). Also: a rejected open must not stay cached in `dbPromise`, or one transient failure bricks the tab.

- [ ] **Step 1: Add the handlers and un-cache failed opens**

In `src/lib/storage/appDb.ts`, add after the `upgrade` function (same options object):

```typescript
      blocked() {
        // Another tab holds an older connection; this open will hang until
        // it closes. Tell the UI so the user gets an instruction, not a
        // silent forever-spinner.
        window.dispatchEvent(new CustomEvent("trainer-db-blocked"));
      },
      blocking() {
        // A newer tab (new deploy, higher DB_VERSION) wants to upgrade.
        // This tab's code is stale and must reload — but NOT synchronously:
        // an instant close+reload aborts any in-flight autosave write, which
        // is exactly the data loss this whole effort exists to prevent.
        // Give pending transactions a beat to commit, then reload; closing
        // the connection right before reload releases the upgrade lock.
        setTimeout(() => {
          dbInstance?.close();
          dbInstance = undefined;
          dbPromise = undefined;
          window.location.reload();
        }, 1500);
      },
      terminated() {
        // Browser killed the connection (e.g. storage pressure); allow reopen.
        dbInstance = undefined;
        dbPromise = undefined;
      },
```

And chain a catch onto the `openDB(...)` promise (after the existing `.then`) so a failed open isn't cached forever:

```typescript
    }).then((db) => {
      dbInstance = db;
      return db;
    }).catch((e) => {
      dbPromise = undefined; // let the next getDb() retry instead of re-throwing forever
      throw e;
    });
```

- [ ] **Step 2: Render the blocked banner**

Create `src/components/app/DbBlockedBanner.tsx` (standalone file — Step 3's test and the commit below depend on this path):

```tsx
"use client";

import { useEffect, useState } from "react";

export function DbBlockedBanner() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const on = () => setBlocked(true);
    window.addEventListener("trainer-db-blocked", on);
    return () => window.removeEventListener("trainer-db-blocked", on);
  }, []);
  if (!blocked) return null;
  return (
    <div role="alert" style={{ padding: "8px 12px", background: "var(--warn, #e6b664)", color: "#000", fontSize: 13 }}>
      Waiting for a database update — close other trAIner tabs, then reload this page.
    </div>
  );
}
```

In `src/App.tsx`, import it (`import { DbBlockedBanner } from "@/components/app/DbBlockedBanner";`) and render `<DbBlockedBanner />` alongside `<ServiceWorkerRegistration />`.

- [ ] **Step 3: Test the banner**

Create `src/components/app/DbBlockedBanner.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import { DbBlockedBanner } from "./DbBlockedBanner";

it("shows the close-other-tabs instruction on trainer-db-blocked", () => {
  render(<DbBlockedBanner />);
  expect(screen.queryByRole("alert")).toBeNull();
  act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocked")); });
  expect(screen.getByRole("alert")).toHaveTextContent(/close other trAIner tabs/i);
});
```

(No unit test for the idb callbacks themselves — cross-connection version-change semantics under fake-indexeddb are not worth the harness. The banner test plus typecheck covers our code; the callbacks are configuration.)

- [ ] **Step 4: Typecheck and run suites**

Run: `npm run typecheck && npx jest src/lib src/components/app -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/appDb.ts src/App.tsx src/components/app/DbBlockedBanner.tsx src/components/app/DbBlockedBanner.test.tsx
git commit -m "fix: surface blocked DB upgrades to the user and reload stale tabs on blocking"
```

---

### Task 7: Validate deeply before restore clears the workspace, and auto-download a pre-restore backup (S5)

Today `{"id": "p1"}` passes validation, the workspace is cleared, and the app is left crashing on `program.days`. Validate required nested fields first, and download the current workspace as a file immediately before any restore so a bad restore is reversible.

**Files:**
- Modify: `src/lib/backup/backup.ts`
- Modify: `src/lib/backup/backup.test.ts`
- Modify: `src/components/app/SettingsClient.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/backup/backup.test.ts` (inside its existing describe structure, using its existing mocks — `mockClear`/`mockPut` are already defined at the top):

```typescript
describe("restoreBackup deep validation", () => {
  const validDoc = {
    version: 1,
    exportedAt: "2026-08-10T00:00:00.000Z",
    profile: null,
    programs: [
      {
        id: "p1", title: "T", days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    logs: [
      { id: "l1", programId: "p1", dayId: "d1", performedAt: "2026-01-02T00:00:00.000Z", entries: [] },
    ],
    aliases: [],
  };

  it("accepts a well-formed document", async () => {
    await expect(restoreBackup(validDoc)).resolves.toBeUndefined();
  });

  it("rejects a program that is only an id, without touching the db", async () => {
    mockClear.mockClear();
    const doc = { ...validDoc, programs: [{ id: "p1" }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("rejects a program with non-array days", async () => {
    const doc = { ...validDoc, programs: [{ ...validDoc.programs[0], days: "nope" }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
  });

  it("rejects a log missing performedAt, without touching the db", async () => {
    mockClear.mockClear();
    const doc = { ...validDoc, logs: [{ id: "l1", programId: "p1", dayId: "d1", entries: [] }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/logs\[0\]/);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("rejects a log with non-array entries", async () => {
    const doc = { ...validDoc, logs: [{ ...validDoc.logs[0], entries: {} }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/logs\[0\]/);
  });

  it("rejects null elements inside days/entries", async () => {
    const badProgram = { ...validDoc, programs: [{ ...validDoc.programs[0], days: [null] }] };
    await expect(restoreBackup(badProgram)).rejects.toThrow(/programs\[0\]/);
    const badLog = { ...validDoc, logs: [{ ...validDoc.logs[0], entries: [null] }] };
    await expect(restoreBackup(badLog)).rejects.toThrow(/logs\[0\]/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/backup/backup.test.ts -t "deep validation" -v`
Expected: FAIL — the reject cases resolve instead.

- [ ] **Step 3: Implement deep validation**

In `src/lib/backup/backup.ts`, add below `hasIds`:

```typescript
function requireFields(
  arr: Record<string, unknown>[],
  storeName: string,
  fields: { name: string; check: (v: unknown) => boolean; expected: string }[],
): void {
  arr.forEach((item, i) => {
    for (const f of fields) {
      if (!f.check(item[f.name])) {
        throw new Error(
          `Invalid backup: ${storeName}[${i}] (id ${String(item["id"])}) — '${f.name}' must be ${f.expected}.`,
        );
      }
    }
  });
}

const isString = (v: unknown) => typeof v === "string";
const isArray = (v: unknown) => Array.isArray(v);
const isArrayOfNonNullObjects = (v: unknown) =>
  Array.isArray(v) && v.every((e) => e !== null && typeof e === "object" && !Array.isArray(e));
```

**Scope boundary (deliberate):** this validates every field the app dereferences unconditionally plus one level of nested element shape (`days`/`entries` arrays must contain objects, so `days: [null]` is rejected). It is NOT a full recursive schema validator — exhaustive schema validation (sections/groups/exercises/sets, enums, timestamp formats, referential integrity) belongs in S4's versioned-export design, where a schema will exist to validate against. Until then the two safety nets for deep-but-well-typed corruption are the pre-restore auto-download (this task) and restore atomicity. Note this in the commit message.

Then, in `restoreBackup`, immediately after the existing `hasIds(doc["programs"])` / `hasIds(doc["logs"])` checks (before the transaction), add:

```typescript
  // A record that passes the shallow id check but lacks required structure
  // would commit, destroy the workspace, and crash every page that reads it.
  // Validate everything the app dereferences unconditionally BEFORE clearing.
  requireFields(doc["programs"], "programs", [
    { name: "title", check: isString, expected: "a string" },
    { name: "days", check: isArrayOfNonNullObjects, expected: "an array of objects" },
    { name: "overrides", check: isArray, expected: "an array" },
    { name: "createdAt", check: isString, expected: "a string timestamp" },
    { name: "updatedAt", check: isString, expected: "a string timestamp" },
  ]);
  requireFields(doc["logs"], "logs", [
    { name: "programId", check: isString, expected: "a string" },
    { name: "dayId", check: isString, expected: "a string" },
    { name: "performedAt", check: isString, expected: "a string timestamp" },
    { name: "entries", check: isArrayOfNonNullObjects, expected: "an array of objects" },
  ]);
```

- [ ] **Step 4: Run the full backup suite**

Run: `npx jest src/lib/backup/backup.test.ts -v`
Expected: PASS — new tests pass, existing tests still pass. If an existing happy-path test used minimal `{id}` fixtures, upgrade its fixtures to the valid shapes above (the old fixtures were exercising exactly the bug being fixed).

- [ ] **Step 5: Auto-download the current workspace before restore**

In `src/components/app/SettingsClient.tsx`, first extract the download logic from `handleExport` so both paths share it:

```typescript
  function downloadBackupFile(backup: Awaited<ReturnType<typeof exportBackup>>, prefix = "trAIner-workspace") {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-${backup.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    downloadBackupFile(await exportBackup());
  }
```

Then in `handleImport`, after the `confirm` and before `restoreBackup`:

```typescript
      // A restore clears everything first. Push the current workspace to a
      // file so a bad import is recoverable.
      downloadBackupFile(await exportBackup(), "trAIner-pre-restore");
```

(Place it inside the existing `try`, before `JSON.parse` — if export fails we must not proceed to a destructive restore.)

Also update the confirm copy to mention it:

```typescript
    if (!confirm("This will replace all local data. A backup file of the current workspace will download first. Continue?")) return;
```

- [ ] **Step 6: Test the import ordering — download must precede restore, and an export failure must abort**

Add to `src/components/app/SettingsClient.test.tsx` (extend the file's existing mocks of `@/lib/backup/backup` if present, else add one):

```typescript
import { exportBackup, restoreBackup } from "@/lib/backup/backup";
import userEvent from "@testing-library/user-event";

// in the module mocks section:
jest.mock("@/lib/backup/backup", () => ({
  exportBackup: jest.fn(),
  restoreBackup: jest.fn().mockResolvedValue(undefined),
  resetWorkspace: jest.fn(),
}));

describe("import flow", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    jest.spyOn(window, "confirm").mockReturnValue(true);
    window.URL.createObjectURL = jest.fn().mockReturnValue("blob:x");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { calls.push("download"); });
    (exportBackup as jest.Mock).mockResolvedValue({ exportedAt: "2026-08-10T00:00:00.000Z" });
    (restoreBackup as jest.Mock).mockImplementation(async () => { calls.push("restore"); });
  });
  afterEach(() => jest.restoreAllMocks());

  async function importFile() {
    const { container } = render(<SettingsClient />);
    const input = container.querySelector('input[type="file"]')!;
    const payload = JSON.stringify({ version: 1, programs: [], logs: [], aliases: [] });
    const file = new File([payload], "b.json", { type: "application/json" });
    // jsdom 20 (this repo's jest-environment-jsdom) does NOT implement
    // File.prototype.text — without this stub, handleImport's JSON.parse
    // throws, the catch swallows it, and the test fails in a way that looks
    // like a production ordering bug. Stub it explicitly.
    Object.defineProperty(file, "text", { value: async () => payload });
    await userEvent.upload(input as HTMLInputElement, file);
  }

  it("downloads a pre-restore backup before restoring", async () => {
    await importFile();
    await waitFor(() => expect(calls).toEqual(["download", "restore"]));
  });

  it("does not restore when the pre-restore export fails", async () => {
    (exportBackup as jest.Mock).mockRejectedValue(new Error("boom"));
    jest.spyOn(window, "alert").mockImplementation(() => undefined);
    await importFile();
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(restoreBackup).not.toHaveBeenCalled();
  });
});
```

(Match the file's existing render/mock conventions — if `@/lib/backup/backup` is already mocked at the top, extend that mock instead of adding a second one, and reuse its existing `render` helper if it has one.)

Run: `npx jest src/components/app/SettingsClient.test.tsx -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/backup/backup.ts src/lib/backup/backup.test.ts src/components/app/SettingsClient.tsx src/components/app/SettingsClient.test.tsx
git commit -m "fix: deep-validate backups before destructive restore and auto-download a pre-restore file"
```

---

### Task 8: Point-in-time export + clear `metrics` on restore (S10, S9)

Export currently reads each store in its own transaction (torn snapshot with two tabs open), and restore leaves the dead `metrics` store untouched (future stale-cache trap).

**Files:**
- Modify: `src/lib/backup/backup.ts`
- Modify: `src/lib/backup/backup.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/backup/backup.test.ts`. The existing `mockGetDb` transaction mock needs per-store `getAll` support, because after this task `exportBackup` reads through the transaction instead of the repos — and **the existing `countsTowardVolume` export tests seed data via `programRepo.list`, which export will no longer call**. Rework the top-of-file mock so stores are seedable by name, and reseed those existing tests through it:

```typescript
// Per-store seed data for transaction reads. Tests set e.g.
// storeData.programs = [myProgram] instead of mocking programRepo.list.
const storeData: Record<string, unknown[]> = {};
const mockGetAll = jest.fn();
const mockTransaction = jest.fn().mockImplementation(() => ({
  objectStore: jest.fn().mockImplementation((name: string) => ({
    clear: mockClear,
    put: mockPut,
    getAll: jest.fn().mockImplementation(() => {
      mockGetAll(name);
      return Promise.resolve(storeData[name] ?? []);
    }),
  })),
  done: Promise.resolve(undefined),
}));
const mockGetDb = jest.fn().mockResolvedValue({
  clear: mockClear,
  transaction: mockTransaction,
});
```

Add `beforeEach(() => { for (const k of Object.keys(storeData)) delete storeData[k]; })`, and update the two `countsTowardVolume` export tests: replace `(programRepo.list as jest.Mock).mockResolvedValueOnce([makeProgramWithExercise(true)])` with `storeData.programs = [makeProgramWithExercise(true)]` (same for `false`). The `restoreBackup` `countsTowardVolume` tests keep working through `mockPut` unchanged.

Tests:

```typescript
describe("exportBackup point-in-time", () => {
  it("reads all stores in one readonly transaction", async () => {
    mockTransaction.mockClear();
    await exportBackup();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [stores, mode] = mockTransaction.mock.calls[0];
    expect(mode).toBe("readonly");
    expect([...stores].sort()).toEqual([
      "aliases", "bodyweight", "logs", "profile", "programs", "promptPresets", "userExercises",
    ]);
  });
});

describe("restoreBackup metrics", () => {
  it("clears the metrics store", async () => {
    mockTransaction.mockClear();
    await restoreBackup(validDoc); // reuse the valid fixture from Task 7
    const [stores] = mockTransaction.mock.calls[0];
    expect(stores).toContain("metrics");
  });
});
```

(Move `validDoc` to file scope so both describes can use it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/backup/backup.test.ts -t "point-in-time" -v && npx jest src/lib/backup/backup.test.ts -t "metrics" -v`
Expected: FAIL — export never calls `transaction`; restore's store list lacks `metrics`.

- [ ] **Step 3: Implement**

Replace `exportBackup` in `src/lib/backup/backup.ts`:

```typescript
export async function exportBackup(): Promise<BackupDocument> {
  // One readonly transaction across every exported store: the file is a
  // consistent point-in-time snapshot even if another tab writes mid-export.
  const db = await getDb();
  const tx = db.transaction(
    ["profile", "programs", "logs", "aliases", "userExercises", "bodyweight", "promptPresets"],
    "readonly",
  );
  const [profiles, programs, logs, aliases, userExercises, bodyweight, promptPresets] = await Promise.all([
    tx.objectStore("profile").getAll(),
    tx.objectStore("programs").getAll(),
    tx.objectStore("logs").getAll(),
    tx.objectStore("aliases").getAll(),
    tx.objectStore("userExercises").getAll(),
    tx.objectStore("bodyweight").getAll(),
    tx.objectStore("promptPresets").getAll(),
  ]);
  await tx.done;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    // BackupDocument.profile is `ProfileDocument | undefined` — do NOT use
    // `?? null`, strict typechecking rejects null here.
    profile: profiles[0],
    programs,
    logs,
    aliases,
    userExercises,
    bodyweight,
    promptPresets,
  };
}
```

(Note: `profile` was previously read via `profileRepo.get()`; confirm that repo just does a `get`/`getAll` on the `profile` store and that `profiles[0] ?? null` matches its semantics — if the profile has a fixed key, use `tx.objectStore("profile").get(<that key>)` instead. Check `src/lib/storage/profileRepo.ts` and mirror it. The repo imports for the removed reads can be dropped if now unused.)

In `restoreBackup`, add `"metrics"` to the transaction store list and clear it:

```typescript
  const tx = db.transaction(
    ["profile", "programs", "logs", "aliases", "userExercises", "bodyweight", "promptPresets", "metrics"],
    "readwrite",
  );
  // ... existing clears ...
  // metrics is a derived-cache store (currently unwritten anywhere). Clear it
  // on restore so it can never hold values computed from data that no longer
  // exists once someone starts using it.
  tx.objectStore("metrics").clear();
```

- [ ] **Step 4: Run the whole backup suite**

Run: `npx jest src/lib/backup/backup.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backup/backup.ts src/lib/backup/backup.test.ts
git commit -m "fix: export in one readonly transaction; clear metrics store on restore"
```

---

### Task 9: iOS install explainer with data-migration blurb

Per the 2026-08-10 decision: prompting iOS users to install to the home screen is *the* iOS durability story (installed apps escape Safari's 7-day cap and make `persist()` grantable). There is no `beforeinstallprompt` on iOS — this is instructional UI. **The migration blurb is mandatory copy**: installed iOS apps get an isolated IndexedDB, so an existing user who installs sees an empty app unless told to export/import.

**Files:**
- Create: `src/components/pwa/InstallPrompt.tsx`
- Create: `src/components/pwa/InstallPrompt.test.tsx`
- Modify: `src/components/app/SettingsClient.tsx` (render it above the Local-first blurb)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/pwa/InstallPrompt.test.tsx
import { render, screen } from "@testing-library/react";
import { InstallPrompt, shouldShowInstallPrompt } from "./InstallPrompt";

function setEnv({ ios, standaloneNav, standaloneMedia }: { ios: boolean; standaloneNav?: boolean; standaloneMedia: boolean }) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: ios
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  });
  (window.navigator as unknown as { standalone?: boolean }).standalone = standaloneNav;
  window.matchMedia = jest.fn().mockReturnValue({ matches: standaloneMedia }) as unknown as typeof window.matchMedia;
}

describe("shouldShowInstallPrompt", () => {
  it("true on iOS Safari, not installed", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    expect(shouldShowInstallPrompt()).toBe(true);
  });
  it("false when already installed (navigator.standalone)", () => {
    setEnv({ ios: true, standaloneNav: true, standaloneMedia: false });
    expect(shouldShowInstallPrompt()).toBe(false);
  });
  it("false when already installed (display-mode: standalone)", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: true });
    expect(shouldShowInstallPrompt()).toBe(false);
  });
  it("false off iOS", () => {
    setEnv({ ios: false, standaloneMedia: false });
    Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 0 });
    expect(shouldShowInstallPrompt()).toBe(false);
  });
  it("true on iPadOS Safari's desktop (Macintosh) user agent", () => {
    setEnv({ ios: false, standaloneNav: false, standaloneMedia: false }); // Mac UA
    Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 5 });
    expect(shouldShowInstallPrompt()).toBe(true);
  });
  it("does not throw when matchMedia is missing (jsdom default)", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    // @ts-expect-error simulate jsdom without matchMedia
    delete window.matchMedia;
    expect(shouldShowInstallPrompt()).toBe(true);
  });
});

describe("InstallPrompt", () => {
  it("renders install steps and the data-migration warning on iOS", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    render(<InstallPrompt />);
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText(/download your profile data and import it into the installed app/i)).toBeInTheDocument();
  });
  it("renders nothing when installed", () => {
    setEnv({ ios: true, standaloneNav: true, standaloneMedia: false });
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/pwa/InstallPrompt.test.tsx -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/pwa/InstallPrompt.tsx
"use client";

/**
 * iOS-only instructional install prompt. There is no programmatic install on
 * iOS (no beforeinstallprompt) — the user must do Share → Add to Home Screen.
 * Installing matters for durability: installed web apps are exempt from
 * Safari's 7-day storage cap and make persist() grantable.
 *
 * CRITICAL COPY: installed iOS apps do NOT share IndexedDB with Safari. An
 * existing user who installs without exporting first opens an empty app.
 * The migration line below is load-bearing — do not remove it.
 */
export function shouldShowInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS Safari defaults to a desktop ("Macintosh") user agent; the
  // established signal is Mac UA + multitouch. Real Macs report 0 touch points.
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  // matchMedia is absent in jsdom (and guarded here so merely importing the
  // Settings page never throws in tests or exotic embedders).
  const installed =
    (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !installed;
}

export function InstallPrompt() {
  if (!shouldShowInstallPrompt()) return null;
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        padding: 10,
        fontSize: 11.5,
        color: "var(--fg-2)",
        lineHeight: 1.55,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span className="tx-up" style={{ color: "var(--accent)" }}>Protect your data — install</span>
      </div>
      Safari deletes this app&apos;s data after 7 days without a visit. Installing
      to your home screen exempts it: tap <strong>Share</strong> →{" "}
      <strong>Add to Home Screen</strong>.
      <div style={{ marginTop: 6, color: "var(--warn, #e6b664)" }}>
        If you&apos;ve been using this in your browser, you&apos;ll need to
        download your profile data and import it into the installed app — the
        installed copy starts with its own empty storage.
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/pwa/InstallPrompt.test.tsx -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Mount it in Settings**

In `src/components/app/SettingsClient.tsx`, import and render it directly above the Local-first blurb:

```tsx
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
// ... in JSX, before the Local-first blurb div:
      <InstallPrompt />
```

Run: `npx jest src/components/app/SettingsClient.test.tsx -v` — expected PASS (component renders null in jsdom's non-iOS UA).

- [ ] **Step 6: Commit**

```bash
git add src/components/pwa/InstallPrompt.tsx src/components/pwa/InstallPrompt.test.tsx src/components/app/SettingsClient.tsx
git commit -m "feat: iOS add-to-home-screen explainer with data-migration warning"
```

---

### Task 10: Full verification pass

- [ ] **Step 1: Full test suite**

Run: `npx jest`
Expected: PASS, zero failures.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: E2E (if configured locally)**

Run: `npm run test:e2e`
Expected: PASS. If Playwright browsers aren't installed locally, note it and rely on CI.

- [ ] **Step 4: Commit any stragglers and stop**

Do not merge or open a PR — use superpowers:finishing-a-development-branch to decide next steps with the user.

---

## Explicitly out of scope

- **S8** (no user-visible error path for failed unmount-route writes): partially mitigated here — Tasks 1–2 mean the final save usually starts while the UI still exists, so the existing `error` status can show. A durable "last save failed" indicator (e.g. persisted flag checked on next launch) is real design work; the audit's own work order also leaves it out. Revisit after S4's brainstorm.
- **S4** (versioned exports + migrations shared between upgrade and restore): needs its own brainstorm per the audit; do it before the next DB version bump.
- **Desktop File System Access autosave**: real fix for Chromium desktop, separate feature.
- **Export-age nudge** ("last exported 34 days ago"): needs download-tracking design; the audit keeps it as a backstop but it isn't part of this pass.
- **Web Share export on iOS**: deliberately dropped 2026-08-10 in favor of the install story.
