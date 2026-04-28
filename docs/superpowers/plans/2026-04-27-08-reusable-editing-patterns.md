# Reusable Editing and Cell Interaction Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared `useEditableValue` hook that encapsulates the commit-on-blur / revert-on-Escape pattern used in `SetCell.tsx`, plus an `InlineText` component for editable exercise names and section titles — so all editable surfaces share one implementation.

**Architecture:** A single hook `useEditableValue(committed, onCommit)` manages the transient edit state. `SetCell.tsx` migrates to the hook. `InlineText` uses the same hook for text field editing. Both use the same keyboard contract: Enter or blur commits, Escape reverts. No new dependencies.

**Tech Stack:** React 19, TypeScript, Jest, `@testing-library/react`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/useEditableValue.ts` | Hook: transient edit state + commit/revert |
| Create | `src/lib/workout/useEditableValue.test.ts` | Unit tests via renderHook |
| Create | `src/components/workout/InlineText.tsx` | Editable text field using the hook |
| Create | `src/components/workout/InlineText.test.tsx` | Render + keyboard interaction tests |
| Modify | `src/components/workout/SetCell.tsx` | Migrate to useEditableValue |

---

## Task 1: `useEditableValue` hook

**Files:**
- Create: `src/lib/workout/useEditableValue.ts`
- Create: `src/lib/workout/useEditableValue.test.ts`

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/workout/useEditableValue.test.ts
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
```

- [ ] **Step 1.2: Run to confirm red**

```bash
bun run test -- useEditableValue.test --no-coverage
```

Expected: `Cannot find module './useEditableValue'`

- [ ] **Step 1.3: Implement `useEditableValue.ts`**

```ts
// src/lib/workout/useEditableValue.ts
import { useCallback, useEffect, useState } from "react";

export type EditableValue = {
  draft: string;
  editing: boolean;
  setDraft: (v: string) => void;
  startEditing: () => void;
  commit: () => void;
  revert: () => void;
};

export function useEditableValue(committed: string, onCommit: (v: string) => void): EditableValue {
  const [draft, setDraft] = useState(committed);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(committed);
  }, [committed, editing]);

  const startEditing = useCallback(() => setEditing(true), []);

  const commit = useCallback(() => {
    setEditing(false);
    onCommit(draft);
  }, [draft, onCommit]);

  const revert = useCallback(() => {
    setDraft(committed);
    setEditing(false);
  }, [committed]);

  return { draft, editing, setDraft, startEditing, commit, revert };
}
```

- [ ] **Step 1.4: Run tests green**

```bash
bun run test -- useEditableValue.test --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/workout/useEditableValue.ts src/lib/workout/useEditableValue.test.ts
git commit -m "feat(workout): add useEditableValue hook for commit/revert editing pattern"
```

---

## Task 2: Migrate `SetCell.tsx` to `useEditableValue`

**Files:**
- Modify: `src/components/workout/SetCell.tsx`

- [ ] **Step 2.1: Update imports in `SetCell.tsx`**

```ts
import { useEffect, useRef } from "react";
import { useEditableValue } from "@/lib/workout/useEditableValue";
```

Remove `useState` from the import (it is no longer used directly).

- [ ] **Step 2.2: Replace the useState/useEffect block with the hook**

```tsx
// BEFORE (remove these lines):
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => setV(value), [value]);

// AFTER (replace with):
  const { draft: v, editing, setDraft: setV, startEditing, commit, revert } = useEditableValue(value, onChange);
```

- [ ] **Step 2.3: Update event handlers to use hook methods**

```tsx
// BEFORE:
  const commit = () => {
    setEditing(false);
    onChange(v);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
    }
    if (e.key === "Escape") {
      setV(value);
      setTimeout(() => ref.current?.blur(), 0);
    }
  };

// AFTER:
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
    }
    if (e.key === "Escape") {
      revert();
      setTimeout(() => ref.current?.blur(), 0);
    }
  };
```

- [ ] **Step 2.4: Update the JSX to use `startEditing` and `commit`**

```tsx
// BEFORE:
      onFocus={() => setEditing(true)}
      onBlur={commit}

// AFTER:
      onFocus={startEditing}
      onBlur={commit}
```

- [ ] **Step 2.5: Build check**

```bash
bun run build 2>&1 | tail -5
```

Expected: clean compile.

- [ ] **Step 2.6: Run tests**

```bash
bun run test -- SetCell --no-coverage
```

Expected: all SetCell tests PASS.

- [ ] **Step 2.7: Commit**

```bash
git add src/components/workout/SetCell.tsx
git commit -m "refactor(SetCell): migrate to useEditableValue hook"
```

---

## Task 3: Create `InlineText` editable field component

**Files:**
- Create: `src/components/workout/InlineText.tsx`
- Create: `src/components/workout/InlineText.test.tsx`

`InlineText` renders as a `<span>` in read mode and a text `<input>` in edit mode. Click or focus triggers edit; Enter/blur commits; Escape reverts. Used for exercise names and section titles.

- [ ] **Step 3.1: Write failing tests**

```tsx
// src/components/workout/InlineText.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineText } from "./InlineText";

describe("InlineText", () => {
  it("renders as a span with the given value by default", () => {
    render(<InlineText value="Squat" onChange={jest.fn()} />);
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("switches to an input when clicked", async () => {
    const user = userEvent.setup();
    render(<InlineText value="Squat" onChange={jest.fn()} />);
    await user.click(screen.getByText("Squat"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("commits new value on blur and calls onChange", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<InlineText value="Squat" onChange={handleChange} />);
    await user.click(screen.getByText("Squat"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Deadlift");
    await user.tab();
    expect(handleChange).toHaveBeenCalledWith("Deadlift");
  });

  it("reverts on Escape and returns to span", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<InlineText value="Squat" onChange={handleChange} />);
    await user.click(screen.getByText("Squat"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Deadlift");
    await user.keyboard("{Escape}");
    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Squat")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Run to confirm red**

```bash
bun run test -- InlineText.test --no-coverage
```

Expected: `Cannot find module './InlineText'`

- [ ] **Step 3.3: Implement `InlineText.tsx`**

```tsx
// src/components/workout/InlineText.tsx
"use client";

import { useRef } from "react";
import { useEditableValue } from "@/lib/workout/useEditableValue";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
};

export function InlineText({ value, onChange, className, style, placeholder = "—" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { draft, editing, setDraft, startEditing, commit, revert } = useEditableValue(value, onChange);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      revert();
      setTimeout(() => inputRef.current?.blur(), 0);
    }
  };

  if (!editing) {
    return (
      <span
        className={className}
        style={{ cursor: "text", ...style }}
        onClick={startEditing}
        onFocus={startEditing}
        tabIndex={0}
        role="button"
        aria-label={`Edit: ${value || placeholder}`}
      >
        {value || <span style={{ color: "var(--fg-4)" }}>{placeholder}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      className={className}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--accent)",
        outline: "none",
        color: "var(--fg)",
        ...style,
      }}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}
```

- [ ] **Step 3.4: Run tests green**

```bash
bun run test -- InlineText.test --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/workout/InlineText.tsx src/components/workout/InlineText.test.tsx
git commit -m "feat(workout): add InlineText component for click-to-edit name fields"
```

---

## Task 4: Full test suite green check

- [ ] **Step 4.1: Run all tests**

```bash
bun run test --no-coverage 2>&1 | tail -15
```

Expected: all suites pass.

- [ ] **Step 4.2: Build check**

```bash
bun run build 2>&1 | tail -6
```

Expected: clean compile, no type errors.
