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
 */
export function useDebouncedAutoSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delayMs: number,
): UseDebouncedAutoSaveResult {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const saveRef = useRef(save);
  saveRef.current = save;
  const firstRunRef = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function doSave() {
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
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void doSave(); }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }

  return { status, flush };
}
