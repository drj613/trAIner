import { renderHook, act } from "@testing-library/react";
import { useVisualViewport } from "./useVisualViewport";

describe("useVisualViewport", () => {
  let listeners: Record<string, ((e: Event) => void)[]>;
  let originalVV: VisualViewport | undefined;

  beforeEach(() => {
    listeners = {};
    originalVV = window.visualViewport ?? undefined;
    const mockVV = {
      height: 800,
      addEventListener: (type: string, cb: (e: Event) => void) => {
        (listeners[type] ||= []).push(cb);
      },
      removeEventListener: (type: string, cb: (e: Event) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((fn) => fn !== cb);
      },
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: mockVV,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVV,
    });
  });

  it("returns the initial viewport height", () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.height).toBe(800);
    expect(result.current.ready).toBe(true);
  });

  it("updates when the resize event fires", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => {
      (window.visualViewport as unknown as { height: number }).height = 400;
      listeners["resize"]?.forEach((fn) => fn(new Event("resize")));
    });
    expect(result.current.height).toBe(400);
  });

  it("also updates when the scroll event fires (iOS Safari keyboard transitions)", () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => {
      (window.visualViewport as unknown as { height: number }).height = 350;
      listeners["scroll"]?.forEach((fn) => fn(new Event("scroll")));
    });
    expect(result.current.height).toBe(350);
  });

  it("returns ready=false and a falsy height when visualViewport is unavailable", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.ready).toBe(false);
    expect(result.current.height).toBeUndefined();
  });
});
