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
  // Chain every save onto whatever save is already in flight, so writes are
  // strictly ordered. `saveCells` is read-then-replace-whole-document: two
  // overlapping saves could otherwise commit out of order and let an older
  // value clobber a newer one.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  function doSave(): Promise<void> {
    // Clear dirtiness SYNCHRONOUSLY at enqueue time, not inside the queued
    // task: visibilitychange(hidden) and pagehide fire back-to-back in the
    // same tick, and both would otherwise see dirty=true and double-enqueue.
    dirtyRef.current = false;
    const run = queueRef.current.then(async () => {
      setStatus("saving");
      try {
        await saveRef.current(valueRef.current);
        setStatus("saved");
      } catch (e) {
        console.error("[autoSave] save failed", e);
        setStatus("error");
        // A failed write means the value is still unsaved: keep it dirty so
        // the next hide/pagehide (or value change) gets another shot at it,
        // instead of silently giving up on the last retry opportunity.
        dirtyRef.current = true;
      }
    });
    queueRef.current = run;
    return run;
  }

  useEffect(() => {
    if (Object.is(lastSeenValueRef.current, value)) {
      // Same value, so this re-run came from a delayMs change. Its cleanup
      // already cleared the live timer — re-arm rather than orphan a pending
      // save. Nothing pending: stay idle (this is also the StrictMode
      // mount-replay path, which must not arm anything).
      if (!dirtyRef.current) return;
    } else {
      lastSeenValueRef.current = value;
      dirtyRef.current = true;
    }
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
    if (!dirtyRef.current) {
      // Nothing new to write; just settle whatever save is already in
      // flight so callers awaiting flush() see it complete.
      await queueRef.current;
      return;
    }
    await doSave();
  }

  return { status, flush };
}
