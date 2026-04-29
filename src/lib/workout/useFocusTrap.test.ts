import { renderHook } from "@testing-library/react";
import { useFocusTrap } from "./useFocusTrap";

// useFocusTrap is tricky to unit test without a real DOM container
// These tests verify the hook returns a ref and doesn't throw
describe("useFocusTrap", () => {
  it("returns a ref object", () => {
    const { result } = renderHook(() => useFocusTrap(true));
    expect(result.current).toHaveProperty("current");
  });

  it("does not throw when inactive", () => {
    expect(() => renderHook(() => useFocusTrap(false))).not.toThrow();
  });

  it("does not throw when active with no container", () => {
    expect(() => renderHook(() => useFocusTrap(true))).not.toThrow();
  });
});
