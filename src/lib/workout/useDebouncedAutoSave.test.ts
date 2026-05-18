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
