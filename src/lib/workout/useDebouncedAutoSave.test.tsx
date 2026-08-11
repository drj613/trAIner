import { renderHook, act } from "@testing-library/react";
import { useDebouncedAutoSave } from "./useDebouncedAutoSave";

jest.useFakeTimers();

describe("useDebouncedAutoSave", () => {
  it("does not call the save function before the delay elapses", () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => { jest.advanceTimersByTime(999); });
    expect(save).not.toHaveBeenCalled();
  });

  it("calls save with the latest value after the delay", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledWith("b");
  });

  it("debounces rapid changes into a single save", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => { jest.advanceTimersByTime(500); });
    rerender({ v: "c" });
    act(() => { jest.advanceTimersByTime(500); });
    rerender({ v: "d" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("d");
  });

  it("exposes the save status to consumers (idle | saving | saved | error)", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedAutoSave(v, save, 1000),
      { initialProps: { v: "a" } }
    );
    expect(result.current.status).toBe("idle");
    rerender({ v: "b" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(result.current.status).toBe("saved");
  });

  it("reports error status when save throws", async () => {
    const save = jest.fn().mockRejectedValue(new Error("nope"));
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedAutoSave(v, save, 1000),
      { initialProps: { v: "a" } }
    );
    rerender({ v: "b" });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(result.current.status).toBe("error");
  });

  it("flush() saves immediately and cancels the pending timer", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useDebouncedAutoSave(v, save, 1000), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
    // Ensure the still-armed timer doesn't fire a second save
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

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

  it("retries on the next hide after a failed save leaves the value dirty", async () => {
    const save = jest.fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(save).toHaveBeenCalledTimes(1);
    act(() => { fireVisibilityHidden(); });
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("b");
  });

  it("re-arms the timer instead of orphaning a pending save when only delayMs changes", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value, delayMs }) => useDebouncedAutoSave(value, save, delayMs),
      { initialProps: { value: "a", delayMs: 1500 } },
    );
    rerender({ value: "b", delayMs: 1500 });
    act(() => { jest.advanceTimersByTime(1000); }); // partway through the debounce window
    rerender({ value: "b", delayMs: 3000 }); // same value, new delay
    act(() => { jest.advanceTimersByTime(1500); }); // past the old delay, not the new one
    expect(save).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1500); }); // past the new delay
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
  });
});

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

  it("retrying flush() after a failed save actually re-saves", async () => {
    // Guards WorkoutDayClient's onRetrySave={() => void flush()}: a failed
    // save must leave the value dirty so flush() isn't a no-op on retry.
    const save = jest.fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedAutoSave(value, save, 1500),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("error");

    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("b");
  });

  it("runExclusive waits for an in-flight save, and a later autosave waits for runExclusive", async () => {
    // Guards the finish/skip terminal-write path: a debounced save already
    // running must finish before runExclusive's write starts, and a
    // subsequent autosave must not jump ahead of runExclusive either —
    // otherwise an autosave could rewrite the doc without completedAt/skippedAt.
    const order: string[] = [];
    let running = 0;
    let maxConcurrent = 0;
    const resolvers: Array<() => void> = [];
    const save = jest.fn().mockImplementation((v: string) => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      order.push(`save:${v}`); // record on start, not on settle
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
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(1); // save("b") running, unresolved

    const fn = jest.fn().mockImplementation(() => {
      order.push("runExclusive");
      return Promise.resolve("terminal");
    });
    let exclusivePromise: Promise<string>;
    act(() => { exclusivePromise = result.current.runExclusive(fn); });
    await act(async () => {});
    expect(fn).not.toHaveBeenCalled(); // must wait for save("b") to settle
    expect(maxConcurrent).toBe(1);

    await act(async () => { resolvers[0](); }); // finish save("b") → fn starts
    await act(async () => { await exclusivePromise!; });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["save:b", "runExclusive"]);

    // A later autosave chains onto the same queue and must run after fn.
    rerender({ value: "c" });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(order).toEqual(["save:b", "runExclusive", "save:c"]);
  });
});
