# Modify-with-AI and Diff Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user copy an AI-modification prompt, paste the returned JSON back into the app, and review the structural diff between their current program day and the replacement — then accept or discard.

**Architecture:** Three self-contained pieces: (1) a `programDiff` utility that compares two `ProgramDay` objects and returns structured changes; (2) a `ModifyAiModal` bottom-sheet that hosts a textarea for paste + calls the import parser; (3) a `DiffReview` screen at `/programs/[id]/diff` that renders the diff as a before/after table. The existing prompt builder generates the prompt; the existing import parser normalises the pasted JSON. No external network calls — the LLM lives outside the app.

**Tech Stack:** React 19, Next.js App Router, existing `parser.ts` (import normalisation), existing `programRepo`, Jest, `@testing-library/react`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/programDiff.ts` | Diff two `ProgramDay` objects → `DiffResult` |
| Create | `src/lib/workout/programDiff.test.ts` | Unit tests |
| Create | `src/components/workout/ModifyAiModal.tsx` | Paste JSON bottom sheet |
| Create | `src/components/workout/DiffReview.tsx` | Before/after diff renderer |
| Create | `src/app/programs/[id]/diff/page.tsx` | Route wrapper |
| Modify | `src/components/workout/TodayClient.tsx` | Add ✦ sparkle button → opens ModifyAiModal |

---

## Task 1: Program diff utility

**Files:**
- Create: `src/lib/workout/programDiff.ts`
- Create: `src/lib/workout/programDiff.test.ts`

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/workout/programDiff.test.ts
import { diffDays } from "./programDiff";
import type { ProgramDay } from "@/lib/programs/types";

const base: ProgramDay = {
  id: "d1", dayNumber: 1, title: "Upper A",
  sections: [
    {
      id: "s1", type: "strength", name: "Strength",
      groups: [
        {
          id: "g1", type: "single",
          exercises: [
            { id: "e1", name: "Bench Press", sets: 3, reps: "8-10", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
            { id: "e2", name: "Row", sets: 3, reps: "10", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
          ],
        },
      ],
    },
  ],
};

const modified: ProgramDay = {
  id: "d1", dayNumber: 1, title: "Upper A",
  sections: [
    {
      id: "s1", type: "strength", name: "Strength",
      groups: [
        {
          id: "g1", type: "single",
          exercises: [
            { id: "e1", name: "Bench Press", sets: 4, reps: "6-8", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },  // changed sets+reps
            { id: "e3", name: "Pull-up", sets: 3, reps: "AMRAP", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },     // new
          ],
        },
      ],
    },
  ],
};

describe("diffDays", () => {
  it("detects modified exercise (sets changed)", () => {
    const result = diffDays(base, modified);
    const changed = result.find((r) => r.exerciseId === "e1");
    expect(changed?.type).toBe("modified");
    expect(changed?.before?.sets).toBe(3);
    expect(changed?.after?.sets).toBe(4);
  });

  it("detects removed exercise", () => {
    const result = diffDays(base, modified);
    expect(result.find((r) => r.exerciseId === "e2")?.type).toBe("removed");
  });

  it("detects added exercise", () => {
    const result = diffDays(base, modified);
    expect(result.find((r) => r.exerciseId === "e3")?.type).toBe("added");
  });

  it("returns empty array when days are identical", () => {
    expect(diffDays(base, base)).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Run to confirm red**

```bash
bun run test -- programDiff --no-coverage
```

Expected: `Cannot find module './programDiff'`

- [ ] **Step 1.3: Implement**

```ts
// src/lib/workout/programDiff.ts
import type { ProgramDay, ProgramExercise } from "@/lib/programs/types";

export type DiffType = "added" | "removed" | "modified" | "unchanged";

export type ExerciseDiff = {
  exerciseId: string;
  exerciseName: string;
  type: DiffType;
  before?: ProgramExercise;
  after?: ProgramExercise;
};

function flatExercises(day: ProgramDay): Map<string, ProgramExercise> {
  const map = new Map<string, ProgramExercise>();
  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const ex of group.exercises) {
        map.set(ex.id, ex);
      }
    }
  }
  return map;
}

function exercisesEqual(a: ProgramExercise, b: ProgramExercise): boolean {
  return (
    a.name === b.name &&
    a.sets === b.sets &&
    a.reps === b.reps &&
    a.load === b.load &&
    a.rest === b.rest &&
    a.notes === b.notes
  );
}

export function diffDays(before: ProgramDay, after: ProgramDay): ExerciseDiff[] {
  const beforeMap = flatExercises(before);
  const afterMap = flatExercises(after);
  const result: ExerciseDiff[] = [];

  // modified + removed
  for (const [id, beforeEx] of beforeMap) {
    const afterEx = afterMap.get(id);
    if (!afterEx) {
      result.push({ exerciseId: id, exerciseName: beforeEx.name, type: "removed", before: beforeEx });
    } else if (!exercisesEqual(beforeEx, afterEx)) {
      result.push({ exerciseId: id, exerciseName: beforeEx.name, type: "modified", before: beforeEx, after: afterEx });
    }
  }

  // added
  for (const [id, afterEx] of afterMap) {
    if (!beforeMap.has(id)) {
      result.push({ exerciseId: id, exerciseName: afterEx.name, type: "added", after: afterEx });
    }
  }

  return result;
}
```

- [ ] **Step 1.4: Run tests green**

```bash
bun run test -- programDiff --no-coverage
```

Expected: 4 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/workout/programDiff.ts src/lib/workout/programDiff.test.ts
git commit -m "feat: add programDiff utility for day comparison"
```

---

## Task 2: ModifyAiModal component

**Files:**
- Create: `src/components/workout/ModifyAiModal.tsx`

- [ ] **Step 2.1: Implement**

```tsx
// src/components/workout/ModifyAiModal.tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { normalizePayload } from "@/lib/import/parser";
import type { ProgramDay } from "@/lib/programs/types";

type Props = {
  currentDay: ProgramDay;
  programId: string;
  onApply: (replacement: ProgramDay) => void;
  onClose: () => void;
};

export function ModifyAiModal({ currentDay, programId, onApply, onClose }: Props) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApply() {
    setError(null);
    let raw: unknown;
    try {
      raw = JSON.parse(json.trim());
    } catch {
      setError("Invalid JSON — paste the full output from your AI assistant.");
      return;
    }

    try {
      const parsed = normalizePayload(raw, programId);
      const day = parsed.days[0];
      if (!day) {
        setError("No workout day found in the pasted JSON.");
        return;
      }
      onApply({ ...day, id: currentDay.id, dayNumber: currentDay.dayNumber });
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
      />
      <div
        role="dialog"
        aria-label="Modify with AI"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "85vh",
          background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid var(--line-2)",
          display: "flex",
          flexDirection: "column",
          animation: "slideup .2s cubic-bezier(.2,.7,.3,1)",
          padding: 16,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1, color: "var(--fg)" }}>
            Paste AI output
          </h2>
          <button className="btn ghost" onClick={onClose} style={{ padding: "4px 6px" }}>
            <X size={15} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>
          Use the Prompts screen to copy a modification prompt. Paste the JSON returned by your AI assistant below.
        </p>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{ "days": [ { "title": "...", "sections": [...] } ] }'
          style={{
            flex: 1,
            minHeight: 180,
            background: "var(--bg-3)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r)",
            color: "var(--fg)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            padding: 10,
            resize: "none",
            outline: "none",
          }}
        />

        {error && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--bad)", fontFamily: "var(--font-mono)" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleApply} style={{ flex: 2 }} disabled={!json.trim()}>
            Review changes →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.2: Build check**

```bash
bun run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 2.3: Commit**

```bash
git add src/components/workout/ModifyAiModal.tsx
git commit -m "feat: add ModifyAiModal for AI JSON paste flow"
```

---

## Task 3: DiffReview component

**Files:**
- Create: `src/components/workout/DiffReview.tsx`

- [ ] **Step 3.1: Implement**

```tsx
// src/components/workout/DiffReview.tsx
"use client";

import type { ExerciseDiff } from "@/lib/workout/programDiff";
import type { ProgramDay } from "@/lib/programs/types";

const typeStyle: Record<string, { bg: string; color: string; label: string }> = {
  added:    { bg: "rgba(127,199,122,0.12)", color: "var(--good)",   label: "+ added" },
  removed:  { bg: "rgba(224,123,106,0.12)", color: "var(--bad)",    label: "– removed" },
  modified: { bg: "rgba(232,182,100,0.12)", color: "var(--warn)",   label: "~ changed" },
};

function ExField({ label, before, after }: { label: string; before?: string | number; after?: string | number }) {
  if (before === after) return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
      <span style={{ color: "var(--fg-4)", minWidth: 40 }}>{label}</span>
      {before !== undefined && (
        <span style={{ color: "var(--bad)", textDecoration: "line-through" }}>{before}</span>
      )}
      {after !== undefined && (
        <span style={{ color: "var(--good)" }}>{after}</span>
      )}
    </div>
  );
}

type Props = {
  diffs: ExerciseDiff[];
  replacement: ProgramDay;
  onAccept: () => void;
  onDiscard: () => void;
};

export function DiffReview({ diffs, replacement, onAccept, onDiscard }: Props) {
  if (diffs.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 8px", color: "var(--fg)" }}>
          No changes detected
        </h2>
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>
          The pasted workout appears identical to the current day.
        </p>
        <button className="btn" onClick={onDiscard} style={{ marginTop: 16 }}>
          Back
        </button>
      </div>
    );
  }

  const counts = {
    added:    diffs.filter((d) => d.type === "added").length,
    removed:  diffs.filter((d) => d.type === "removed").length,
    modified: diffs.filter((d) => d.type === "modified").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      {/* header */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--line)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
          Review changes
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          {replacement.title}
          {counts.added > 0 && <span style={{ color: "var(--good)", marginLeft: 8 }}>+{counts.added}</span>}
          {counts.removed > 0 && <span style={{ color: "var(--bad)", marginLeft: 8 }}>−{counts.removed}</span>}
          {counts.modified > 0 && <span style={{ color: "var(--warn)", marginLeft: 8 }}>~{counts.modified}</span>}
        </p>
      </div>

      {/* diff list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {diffs.map((diff) => {
          const s = typeStyle[diff.type] ?? typeStyle.modified;
          return (
            <div
              key={diff.exerciseId}
              style={{
                marginBottom: 8,
                padding: "10px 12px",
                background: s.bg,
                border: `1px solid ${s.color}30`,
                borderLeft: `3px solid ${s.color}`,
                borderRadius: "var(--r)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>
                  {diff.exerciseName}
                </span>
                <span style={{ fontSize: 10, color: s.color, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {s.label}
                </span>
              </div>
              {diff.type === "modified" && (
                <div style={{ marginTop: 4 }}>
                  <ExField label="sets" before={diff.before?.sets} after={diff.after?.sets} />
                  <ExField label="reps" before={diff.before?.reps} after={diff.after?.reps} />
                  <ExField label="load" before={diff.before?.load} after={diff.after?.load} />
                  <ExField label="rest" before={diff.before?.rest} after={diff.after?.rest} />
                </div>
              )}
              {diff.type === "added" && diff.after && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
                  {[diff.after.sets && `${diff.after.sets}×`, diff.after.reps, diff.after.load].filter(Boolean).join(" ")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* actions */}
      <div style={{ padding: 12, borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
        <button className="btn ghost" onClick={onDiscard} style={{ flex: 1 }}>
          Discard
        </button>
        <button className="btn primary" onClick={onAccept} style={{ flex: 2 }}>
          Apply changes
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/components/workout/DiffReview.tsx
git commit -m "feat: add DiffReview component for AI replacement display"
```

---

## Task 4: Diff route + wire into Today screen

**Files:**
- Create: `src/app/programs/[id]/diff/page.tsx`
- Modify: `src/components/workout/TodayClient.tsx`

- [ ] **Step 4.1: Create diff page**

```tsx
// src/app/programs/[id]/diff/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { programRepo } from "@/lib/storage/programRepo";
import { DiffReview } from "@/components/workout/DiffReview";
import { diffDays } from "@/lib/workout/programDiff";
import type { ProgramDay } from "@/lib/programs/types";

const SESSION_KEY = "trainer-pending-diff";

export function storePendingDiff(programId: string, original: ProgramDay, replacement: ProgramDay) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ programId, original, replacement }));
}

export default function DiffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<{
    original: ProgramDay;
    replacement: ProgramDay;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) { router.replace(`/programs/${params.id}`); return; }
    const data = JSON.parse(raw) as { programId: string; original: ProgramDay; replacement: ProgramDay };
    if (data.programId !== params.id) { router.replace(`/programs/${params.id}`); return; }
    setState({ original: data.original, replacement: data.replacement });
  }, [params.id, router]);

  if (!state) return <p style={{ color: "var(--fg-3)", padding: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading diff…</p>;

  const diffs = diffDays(state.original, state.replacement);

  async function handleAccept() {
    const program = await programRepo.get(params.id);
    if (!program) return;
    await programRepo.save({
      ...program,
      overrides: [
        ...program.overrides,
        {
          id: crypto.randomUUID(),
          scope: "day" as const,
          programId: program.id,
          dayId: state!.original.id,
          replacement: state!.replacement,
          reason: "Modified with AI",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    sessionStorage.removeItem(SESSION_KEY);
    router.replace(`/today`);
  }

  function handleDiscard() {
    sessionStorage.removeItem(SESSION_KEY);
    router.back();
  }

  return (
    <div style={{ height: "calc(100vh - 46px)", display: "flex", flexDirection: "column" }}>
      <DiffReview
        diffs={diffs}
        replacement={state.replacement}
        onAccept={handleAccept}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
```

- [ ] **Step 4.2: Add ✦ sparkle button to TodayClient toolbar area**

In `TodayWorkout`, add modal state and import the needed pieces:

```tsx
import { ModifyAiModal } from "./ModifyAiModal";
import { storePendingDiff } from "@/app/programs/[id]/diff/page";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

// Inside TodayWorkout:
const router = useRouter();
const [aiModalOpen, setAiModalOpen] = useState(false);

function handleApplyReplacement(replacement: ProgramDay) {
  storePendingDiff(program.id, day, replacement);
  setAiModalOpen(false);
  router.push(`/programs/${program.id}/diff`);
}
```

In the day header section, add a button:

```tsx
<button
  className="btn ghost"
  onClick={() => setAiModalOpen(true)}
  style={{ padding: "4px 8px" }}
  title="Modify with AI"
>
  <Sparkles size={14} aria-hidden />
</button>
```

At the bottom of `TodayWorkout`'s return (after the history drawer):

```tsx
{aiModalOpen && (
  <ModifyAiModal
    currentDay={day}
    programId={program.id}
    onApply={handleApplyReplacement}
    onClose={() => setAiModalOpen(false)}
  />
)}
```

- [ ] **Step 4.3: Build check**

```bash
bun run build 2>&1 | tail -8
```

Expected: clean, new route `/programs/[id]/diff` appears in route table.

- [ ] **Step 4.4: Manual smoke test**

1. Open `/today` → click the ✦ sparkle button → modal opens.
2. Paste a valid program JSON (copy from an import you did earlier). Click "Review changes →".
3. Diff screen loads with before/after. "Apply changes" saves as override and redirects to `/today`. "Discard" returns to Today.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/programs/[id]/diff/page.tsx src/components/workout/TodayClient.tsx
git commit -m "feat: wire ModifyAiModal → diff route → override acceptance"
```
