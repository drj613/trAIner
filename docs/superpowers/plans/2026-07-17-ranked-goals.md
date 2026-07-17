# Ranked Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag-reorder `profile.goals` so array order becomes an explicit priority rank, and surface that rank in the read-only summary view and in the LLM prompt text.

**Architecture:** No schema change — `goals: string[]` order already is the rank. Add a pure `moveItem` reorder helper (unit-tested in isolation, since drag events are unreliable in jsdom), a new `RankedGoalsEditor`/`RankedGoalsList` component pair wired to `@dnd-kit`, and update `profileFields.ts`'s goals renderer to emit a numbered block instead of a comma join. `primaryGoal` (the `TrainingGoal` enum driving the goal-gate) is untouched and keeps rendering as a separate control/badge.

**Tech Stack:** React 19, TypeScript, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new deps), Jest + React Testing Library, Bun as package manager.

**Spec:** `docs/superpowers/specs/2026-07-17-ranked-goals-design.md`

---

### Task 1: Add dnd-kit dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

Run: `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

Expected: `package.json` `dependencies` gains all three packages; `bun.lock` updates.

- [ ] **Step 2: Verify install**

Run: `bun pm ls | grep dnd-kit`
Expected: three `@dnd-kit/*` lines printed.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add dnd-kit for drag-to-reorder"
```

---

### Task 2: Pure reorder helper

**Files:**
- Create: `src/lib/ui/reorder.ts`
- Test: `src/lib/ui/reorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ui/reorder.test.ts`:

```ts
import { moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves an item earlier in the array", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("moves an item later in the array", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op when from and to are the same index", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    moveItem(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("moves the only item in a single-element array", () => {
    expect(moveItem(["a"], 0, 0)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/ui/reorder.test.ts` (or `npx jest src/lib/ui/reorder.test.ts`)
Expected: FAIL — `Cannot find module './reorder'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/ui/reorder.ts`:

```ts
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/ui/reorder.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/reorder.ts src/lib/ui/reorder.test.ts
git commit -m "feat: add pure array reorder helper"
```

---

### Task 3: `RankedGoalsEditor` and `RankedGoalsList` components

**Files:**
- Create: `src/components/profile/RankedGoalsEditor.tsx`
- Test: `src/components/profile/RankedGoalsEditor.test.tsx`

This introduces two exports:
- `RankedGoalsList({ items }: { items: string[] })` — read-only numbered list.
- `RankedGoalsEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void })` — numbered list with add/remove (same text-input pattern as the existing `EditableChips` in `ProfileClient.tsx`) plus drag-to-reorder via `@dnd-kit`.

- [ ] **Step 1: Write the failing tests (non-drag behavior first)**

Create `src/components/profile/RankedGoalsEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { RankedGoalsEditor, RankedGoalsList } from "./RankedGoalsEditor";

describe("RankedGoalsList", () => {
  it("renders items as a numbered list in given order", () => {
    render(<RankedGoalsList items={["Fix shoulder pain", "Compete again"]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("Fix shoulder pain");
    expect(items[1]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("Compete again");
  });

  it("shows a placeholder when there are no goals", () => {
    render(<RankedGoalsList items={[]} />);
    expect(screen.getByText(/no goals yet/i)).toBeInTheDocument();
  });
});

describe("RankedGoalsEditor", () => {
  it("renders existing goals as a numbered list", () => {
    render(<RankedGoalsEditor items={["a", "b"]} onChange={jest.fn()} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("a");
    expect(items[1]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("b");
  });

  it("adds a new goal at the end (lowest priority) via the text input", () => {
    const onChange = jest.fn();
    render(<RankedGoalsEditor items={["a"]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "b" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("does not add a duplicate or blank goal", () => {
    const onChange = jest.fn();
    render(<RankedGoalsEditor items={["a"]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a goal and keeps the rest in order", () => {
    const onChange = jest.fn();
    render(<RankedGoalsEditor items={["a", "b", "c"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remove b/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  it("shows a placeholder when there are no goals", () => {
    render(<RankedGoalsEditor items={[]} onChange={jest.fn()} />);
    expect(screen.getByText(/no goals yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/profile/RankedGoalsEditor.test.tsx`
Expected: FAIL — `Cannot find module './RankedGoalsEditor'`

- [ ] **Step 3: Write the implementation**

Create `src/components/profile/RankedGoalsEditor.tsx`:

```tsx
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveItem } from "@/lib/ui/reorder";

export function RankedGoalsList({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="muted text-xs">No goals yet</p>;
  }
  return (
    <ol className="flex flex-col gap-1" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item, i) => (
        <li key={item} className="flex items-baseline gap-2 text-xs" style={{ color: "var(--fg-2)" }}>
          <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SortableGoalRow({
  id,
  rank,
  onRemove,
}: {
  id: string;
  rank: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 text-xs px-2 py-1 rounded"
      role="listitem"
    >
      <button
        type="button"
        aria-label={`Reorder ${id}`}
        className="cursor-grab"
        style={{ color: "var(--fg-3)", touchAction: "none" }}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{rank}.</span>
      <span className="flex-1" style={{ color: "var(--fg-2)" }}>{id}</span>
      <button
        type="button"
        aria-label={`Remove ${id}`}
        onClick={onRemove}
        style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 1px" }}
      >
        ×
      </button>
    </li>
  );
}

export function RankedGoalsEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addItem() {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.indexOf(String(active.id));
    const to = items.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(moveItem(items, from, to));
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="muted text-xs">No goals yet</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }} className="flex flex-col gap-1">
              {items.map((item, i) => (
                <SortableGoalRow
                  key={item}
                  id={item}
                  rank={i + 1}
                  onRemove={() => onChange(items.filter((it) => it !== item))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="flex gap-1">
        <input
          className="input flex-1"
          style={{ fontSize: 12, padding: "3px 7px" }}
          value={input}
          placeholder="Add goal…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <button
          type="button"
          className="button"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={addItem}
        >
          Add
        </button>
      </div>
    </div>
  );
}
```

Note: the drag handler uses the Task 2 `moveItem` helper directly (not `@dnd-kit/sortable`'s
own `arrayMove`) — one reorder implementation, unit-tested in isolation in Task 2, reused
here instead of duplicated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/profile/RankedGoalsEditor.test.tsx`
Expected: PASS (7 tests). Drag-drop itself is not simulated in jsdom (unreliable —
`@dnd-kit` needs real pointer/layout APIs); the pure reorder math is covered by Task 2's
`moveItem` tests, and dnd-kit's own test suite covers its drag mechanics.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/RankedGoalsEditor.tsx src/components/profile/RankedGoalsEditor.test.tsx
git commit -m "feat: add ranked goals editor and read-only list components"
```

---

### Task 4: Wire `RankedGoalsEditor`/`RankedGoalsList` into `ProfileClient`

**Files:**
- Modify: `src/components/profile/ProfileClient.tsx:362-372` (create-profile form, goals panel)
- Modify: `src/components/profile/ProfileClient.tsx:555-581` (existing-profile goals card)
- Test: `src/components/profile/ProfileClient.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/profile/ProfileClient.test.tsx` (new `describe` block, still under
the existing `no profile` mock which renders the creation form):

```tsx
describe("ProfileClient — ranked goals (creation form)", () => {
  it("adds a goal via the ranked editor and saves it in array order", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "Fix shoulder pain" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "Compete again" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ goals: ["Fix shoulder pain", "Compete again"] })
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/profile/ProfileClient.test.tsx`
Expected: FAIL — this specific test fails because `EditableChips` (current goals
control) uses placeholder `Add item…`, not `Add goal…`, so `getByPlaceholderText(/add
goal/i)` finds no match.

- [ ] **Step 3: Wire the new components**

In `src/components/profile/ProfileClient.tsx`:

Add the import near the top (after the `GOAL_LABELS` import):

```ts
import { RankedGoalsEditor, RankedGoalsList } from "./RankedGoalsEditor";
```

Replace the creation-form goals panel (currently lines 362-372):

```tsx
        <div className="panel">
          <p className="tx-up mb-2">Goals</p>
          <PrimaryGoalSelect
            value={draft.primaryGoal}
            onChange={(primaryGoal) => setDraft((d) => d && { ...d, primaryGoal })}
          />
          <RankedGoalsEditor
            items={draft.goals}
            onChange={(goals) => setDraft((d) => d && { ...d, goals })}
          />
        </div>
```

Replace the existing-profile goals card body (currently lines 562-580):

```tsx
        {editingSection === "goals" && draft ? (
          <>
            <PrimaryGoalSelect
              value={draft.primaryGoal}
              onChange={(primaryGoal) => setDraft((d) => d && { ...d, primaryGoal })}
            />
            <RankedGoalsEditor
              items={draft.goals}
              onChange={(goals) => setDraft((d) => d && { ...d, goals })}
            />
          </>
        ) : (
          <>
            {profile.primaryGoal && (
              <p className="text-xs mb-1" style={{ color: "var(--fg-2)" }}>
                ★ {GOAL_LABELS[profile.primaryGoal]}
              </p>
            )}
            <RankedGoalsList items={profile.goals} />
          </>
        )}
```

This drops the old `★ label` + flat `profile.goals` array that used to get concatenated
and passed to `ChipList` — the star badge now renders on its own line above the ranked
list, matching the spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/profile/ProfileClient.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileClient.tsx src/components/profile/ProfileClient.test.tsx
git commit -m "feat: wire ranked goals editor into profile creation and edit flows"
```

---

### Task 5: Ranked goals in the prompt builder

**Files:**
- Modify: `src/lib/prompts/profileFields.ts:46-52`
- Modify: `src/lib/prompts/profileFields.test.ts:31,53`

- [ ] **Step 1: Update the failing assertions first**

In `src/lib/prompts/profileFields.test.ts`, replace line 31:

```ts
    expect(block).toContain("Goals: Hypertrophy");
```

with:

```ts
    expect(block).toContain("Goals (priority order):\n1. Hypertrophy");
```

And replace line 53:

```ts
    expect(block).not.toContain("Goals:");
```

with:

```ts
    expect(block).not.toContain("Goals (priority order)");
```

Also add a new test in the `buildProfileFieldsBlock` describe block to cover multi-goal
ordering:

```ts
  it("numbers multiple goals in stored (priority) order", () => {
    const p: ProfileDocument = { ...base, goals: ["Fix shoulder pain", "Compete again"] };
    const block = buildProfileFieldsBlock(p, allOn());
    expect(block).toContain("Goals (priority order):\n1. Fix shoulder pain\n2. Compete again");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/prompts/profileFields.test.ts`
Expected: FAIL — actual output is still `Goals: Hypertrophy` (old format).

- [ ] **Step 3: Update the implementation**

In `src/lib/prompts/profileFields.ts`, replace the `goals` field entry (lines 45-52):

```ts
  {
    key: "goals",
    label: "Goals",
    group: "profile",
    important: true,
    hasData: (p) => p.goals.length > 0,
    render: (p) =>
      p.goals.length
        ? `Goals (priority order):\n${p.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
        : null,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/prompts/profileFields.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: PASS, no regressions elsewhere (grep confirmed `goals` rendering is only
consumed in `ProfileClient.tsx` and `profileFields.ts`; no other prompt-construction path
reads it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompts/profileFields.ts src/lib/prompts/profileFields.test.ts
git commit -m "feat: render profile goals in priority order in the LLM prompt"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx jest`
Expected: all suites PASS.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.test.json` (or the project's standard typecheck
command if different — check `package.json` `scripts` for `typecheck`/`build`)
Expected: no type errors.

- [ ] **Step 3: Lint**

Run: `bun run lint` (or `npx eslint src`)
Expected: no errors introduced by new files.

- [ ] **Step 4: Manual smoke check (dev server)**

Run: `bun run dev`, open the Profile page:
- New profile: add 2-3 goals via the ranked editor, drag to reorder, confirm order
  persists after Save profile and reload.
- Existing profile: edit Goals, drag-reorder, Save, confirm the read-only view shows
  the new numbered order with `primaryGoal`'s star badge above it, unaffected.
- Prompt builder page: with goals set, confirm the generated prompt text shows
  `Goals (priority order):` followed by a numbered list in the same order as the
  profile.

No `- [ ] commit` step here — this task is verification-only, nothing to commit unless a
bug is found and fixed (in which case, fix inline in the relevant task's files and commit
with a `fix:` message).
