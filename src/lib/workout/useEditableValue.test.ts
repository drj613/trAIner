import { renderHook, act } from "@testing-library/react";
import { useEditableValue } from "./useEditableValue";

describe("useEditableValue", () => {
  it("starts with the committed value", () => {
    const { result } = renderHook(() => useEditableValue("hello", jest.fn()));
    expect(result.current.draft).toBe("hello");
    expect(result.current.editing).toBe(false);
  });

  it("tracks draft changes without committing", () => {
    const onCommit = jest.fn();
    const { result } = renderHook(() => useEditableValue("hello", onCommit));
    act(() => result.current.setDraft("world"));
    expect(result.current.draft).toBe("world");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commit() calls onCommit with the current draft", () => {
    const onCommit = jest.fn();
    const { result } = renderHook(() => useEditableValue("hello", onCommit));
    act(() => result.current.setDraft("world"));
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenCalledWith("world");
    expect(result.current.editing).toBe(false);
  });

  it("revert() resets draft to committed value without calling onCommit", () => {
    const onCommit = jest.fn();
    const { result } = renderHook(() => useEditableValue("hello", onCommit));
    act(() => result.current.setDraft("world"));
    act(() => result.current.revert());
    expect(result.current.draft).toBe("hello");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("startEditing() sets editing to true", () => {
    const { result } = renderHook(() => useEditableValue("hello", jest.fn()));
    act(() => result.current.startEditing());
    expect(result.current.editing).toBe(true);
  });

  it("syncs draft when committed value changes externally", () => {
    const onCommit = jest.fn();
    const { result, rerender } = renderHook(
      ({ committed }) => useEditableValue(committed, onCommit),
      { initialProps: { committed: "hello" } }
    );
    rerender({ committed: "updated" });
    expect(result.current.draft).toBe("updated");
  });
});
