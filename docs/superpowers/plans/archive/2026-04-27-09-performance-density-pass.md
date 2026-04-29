# Performance and Density Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune the live workout experience for mobile — reduce input friction with an auto-advancing focus pattern, add density toggle persistence to the Settings screen, and fix `WorkoutProgress` to reflect actual completion (not just "any value entered").

**Architecture:** Three focused improvements: (1) `SetCell` advances focus to the next cell on Enter, (2) a `SettingsClient` lets users pick density and persist it via `ThemeProvider.setDensity`, (3) `WorkoutProgress.pct` counts a cell as done only when `classifyCell(v) !== "empty"`. No new dependencies.

**Tech Stack:** React 19, Next.js App Router, existing CSS density vars in `globals.css`, existing `ThemeProvider`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/components/workout/SetCell.tsx` | Add `onNext` prop for focus advancement |
| Create | `src/app/settings/page.tsx` | Settings route |
| Create | `src/components/app/SettingsClient.tsx` | Density + mono font selector |
| Modify | `src/components/app/ThemeProvider.tsx` | Add `setDensity`, `setMono` exports |
| Modify | `src/components/workout/TodayClient.tsx` | Wire `onNext` between SetCell instances; fix progress pct calculation |

---

## Task 1: SetCell focus-advance prop

**Files:**
- Modify: `src/components/workout/SetCell.tsx`

The user should be able to hit Enter in one set cell and land in the next one without lifting their thumbs. Add an optional `onNext()` callback, called after commit when the user presses Enter.

- [ ] **Step 1.1: Update the `Props` type in `SetCell.tsx`**

```ts
type Props = {
  value: string;
  prescribed?: string;
  onChange: (v: string) => void;
  onNext?: () => void;
  autoFocus?: boolean;
};
```

- [ ] **Step 1.2: Update the `onKey` handler to call `onNext` on Enter**

```tsx
// In SetCell, update onKey:
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
      // Advance focus after blur+commit settle
      setTimeout(() => onNext?.(), 0);
    }
    if (e.key === "Escape") {
      revert();
      setTimeout(() => ref.current?.blur(), 0);
    }
  };
```

Note: if using `useEditableValue` (after Plan 08), the `revert()` call is from that hook. If not yet migrated, the original `setV(value)` form is used — keep whichever is present.

- [ ] **Step 1.3: Add `onNext` to the destructured props**

```tsx
export function SetCell({ value, prescribed = "", onChange, onNext, autoFocus }: Props) {
```

- [ ] **Step 1.4: Build check**

```bash
bun run build 2>&1 | tail -5
```

- [ ] **Step 1.5: Commit**

```bash
git add src/components/workout/SetCell.tsx
git commit -m "feat(SetCell): add onNext prop for keyboard focus advancement after Enter"
```

---

## Task 2: Wire `onNext` in `TodayClient.tsx`

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

Build a flat ordered list of `(exerciseId, setIndex)` pairs so each SetCell can call `onNext` to focus the next input by DOM id or ref.

- [ ] **Step 2.1: Add cell IDs to SetCell instances**

In `ExerciseRow` inside `TodayClient.tsx`, update the `SetCell` render to pass an `id` and an `onNext` prop. First, add a helper to produce a stable cell element id:

```tsx
function cellId(exId: string, i: number) {
  return `cell-${exId}-${i}`;
}
```

- [ ] **Step 2.2: Pass `id` and `onNext` to each SetCell**

```tsx
// In ExerciseRow, update the SetCell render:
{cells.map((v, i) => (
  <SetCell
    key={i}
    id={cellId(exercise.id, i)}
    value={v}
    prescribed={i === 0 ? prescribedStr : ""}
    onChange={(val) => onCellChange(i, val)}
    onNext={() => {
      const nextIndex = i + 1;
      const nextEl = document.getElementById(cellId(exercise.id, nextIndex));
      if (nextEl) {
        (nextEl as HTMLInputElement).focus();
        (nextEl as HTMLInputElement).select();
      }
    }}
  />
))}
```

- [ ] **Step 2.3: Add `id` prop to `SetCell` component signature**

In `SetCell.tsx`, add `id?: string` to `Props` and pass it to the `<input>`:

```tsx
type Props = {
  id?: string;
  // ... existing props
};

export function SetCell({ id, value, ... }: Props) {
  return (
    <input
      id={id}
      // ... rest of props
    />
  );
}
```

- [ ] **Step 2.4: Build check**

```bash
bun run build 2>&1 | tail -5
```

- [ ] **Step 2.5: Commit**

```bash
git add src/components/workout/TodayClient.tsx src/components/workout/SetCell.tsx
git commit -m "feat(today): wire SetCell focus advancement across exercise sets via DOM id"
```

---

## Task 3: Fix `WorkoutProgress` pct calculation

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`

Currently any non-empty string counts as "done" in the progress bar. A cell with `"skip"` or `"pain"` shouldn't count as a completed set.

- [ ] **Step 3.1: Import `classifyCell` in `TodayClient.tsx`**

```ts
import { classifyCell } from "./SetCell";
```

- [ ] **Step 3.2: Update `WorkoutProgress` to use `classifyCell`**

In the `WorkoutProgress` component, change the "done" check:

```tsx
// BEFORE:
      if (v) done++;

// AFTER:
      const state = classifyCell(v);
      if (state !== "empty") done++;
```

- [ ] **Step 3.3: Build check**

```bash
bun run build 2>&1 | tail -5
```

- [ ] **Step 3.4: Commit**

```bash
git add src/components/workout/TodayClient.tsx
git commit -m "fix(today): count progress using classifyCell so skip/pain cells aren't marked done"
```

---

## Task 4: `setDensity` and `setMono` exports in `ThemeProvider.tsx`

**Files:**
- Modify: `src/components/app/ThemeProvider.tsx`

Export functions for changing density and mono font at runtime, mirroring the existing `setTheme` export.

- [ ] **Step 4.1: Add exports to `ThemeProvider.tsx`**

```ts
// Add to src/components/app/ThemeProvider.tsx:

const DENSITY_KEY = "trainer-density";
const MONO_KEY = "trainer-mono";

export function setDensity(density: "comfy" | "default" | "dense") {
  document.documentElement.setAttribute("data-density", density);
  localStorage.setItem(DENSITY_KEY, density);
}

export function setMono(mono: "jetbrains" | "system") {
  document.documentElement.setAttribute("data-mono", mono);
  localStorage.setItem(MONO_KEY, mono);
}
```

- [ ] **Step 4.2: Hydrate density and mono from localStorage in `useLayoutEffect`**

In the existing `useLayoutEffect` in `ThemeProvider.tsx`, update the `data-density` and `data-mono` lines to read from localStorage:

```tsx
// BEFORE:
    html.setAttribute("data-density", "default");
    html.setAttribute("data-mono", "jetbrains");

// AFTER:
    html.setAttribute("data-density", localStorage.getItem(DENSITY_KEY) ?? "default");
    html.setAttribute("data-mono", localStorage.getItem(MONO_KEY) ?? "jetbrains");
```

- [ ] **Step 4.3: Build check**

```bash
bun run build 2>&1 | tail -5
```

- [ ] **Step 4.4: Commit**

```bash
git add src/components/app/ThemeProvider.tsx
git commit -m "feat(theme): add setDensity and setMono exports with localStorage persistence"
```

---

## Task 5: Settings screen

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/components/app/SettingsClient.tsx`

- [ ] **Step 5.1: Create the route**

```tsx
// src/app/settings/page.tsx
import { SettingsClient } from "@/components/app/SettingsClient";

export default function SettingsPage() {
  return <SettingsClient />;
}
```

- [ ] **Step 5.2: Implement `SettingsClient.tsx`**

```tsx
// src/components/app/SettingsClient.tsx
"use client";

import { useState } from "react";
import { setDensity, setTheme, setMono } from "@/components/app/ThemeProvider";

type Density = "comfy" | "default" | "dense";
type Mono = "jetbrains" | "system";

const THEMES = ["editor", "terminal", "logbook", "linen", "paper", "midnight"] as const;
const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfy", label: "Comfy" },
  { value: "default", label: "Default" },
  { value: "dense", label: "Dense" },
];

function readAttr(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return document.documentElement.getAttribute(name) ?? fallback;
}

export function SettingsClient() {
  const [theme, setThemeState] = useState(() => readAttr("data-theme", "linen"));
  const [density, setDensityState] = useState<Density>(() => readAttr("data-density", "default") as Density);
  const [mono, setMonoState] = useState<Mono>(() => readAttr("data-mono", "jetbrains") as Mono);

  function handleTheme(t: string) {
    setTheme(t);
    setThemeState(t);
  }

  function handleDensity(d: Density) {
    setDensity(d);
    setDensityState(d);
  }

  function handleMono(m: Mono) {
    setMono(m);
    setMonoState(m);
  }

  return (
    <div>
      <p style={{ margin: "0 0 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Workspace
      </p>
      <h1 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
        Settings
      </h1>

      {/* Theme */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Theme
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => handleTheme(t)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${theme === t ? "var(--accent)" : "var(--line)"}`,
                background: theme === t ? "var(--accent-soft)" : "transparent",
                color: theme === t ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Density */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Density
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {DENSITIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleDensity(value)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${density === value ? "var(--accent)" : "var(--line)"}`,
                background: density === value ? "var(--accent-soft)" : "transparent",
                color: density === value ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Mono font */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Monospace Font
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {(["jetbrains", "system"] as Mono[]).map((m) => (
            <button
              key={m}
              onClick={() => handleMono(m)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${mono === m ? "var(--accent)" : "var(--line)"}`,
                background: mono === m ? "var(--accent-soft)" : "transparent",
                color: mono === m ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {m === "jetbrains" ? "JetBrains" : "System"}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5.3: Build check**

```bash
bun run build 2>&1 | tail -6
```

Expected: clean compile, `/settings` in route table.

- [ ] **Step 5.4: Commit**

```bash
git add src/app/settings/page.tsx src/components/app/SettingsClient.tsx
git commit -m "feat: add /settings screen with theme, density, and mono font controls"
```
