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
});
