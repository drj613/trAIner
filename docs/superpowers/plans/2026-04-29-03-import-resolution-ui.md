# Import Resolution UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the import page from a single-step paste+save form into a three-step wizard: (1) paste JSON and validate, (2) resolve unmatched exercises against the library with suggestion chips and a progress bar, (3) confirm and save. Chosen resolutions are persisted as `AliasDocument` entries so future imports match automatically.

**Architecture:** A new `src/lib/import/resolution.ts` module provides `extractUnresolvedExercises(warnings)` (turns parser warnings into a typed list) and `applyResolutions(program, resolutions)` (patches `canonicalExerciseId` on matching exercises). A new `src/components/import/ResolutionStep.tsx` renders the resolution UI. `ImportClient.tsx` gains a `step` state machine (`"paste" | "resolve" | "confirm"`) and only renders the resolution step when warnings with suggestions exist; if there are no unresolved exercises it skips directly from paste to confirm.

**Tech Stack:** React 19, TypeScript, Next.js App Router, existing `parseProgramJson` from `@/lib/import/parser`, existing `aliasRepo`, `programRepo`, `AliasDocument` + `ImportWarning` + `ExerciseSuggestion` types.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/import/resolution.ts` | Pure logic: extract unresolved items, apply resolutions |
| Create | `src/lib/import/resolution.test.ts` | Unit tests for both functions |
| Create | `src/components/import/ResolutionStep.tsx` | Per-exercise resolution UI |
| Modify | `src/components/import/ImportClient.tsx` | Convert to 3-step wizard |

---

### Task 1: `resolution.ts` — pure resolution logic

**Files:**
- Create: `src/lib/import/resolution.ts`
- Create: `src/lib/import/resolution.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/import/resolution.test.ts
import { extractUnresolvedExercises, applyResolutions } from "./resolution";
import type { ImportWarning, ProgramDocument } from "@/lib/programs/types";

const warnings: ImportWarning[] = [
  {
    path: "days.1.sections.0.groups.0.exercises.0",
    message: "Landmine Press was imported without a catalog match.",
    suggestions: [
      { exerciseId: "landmine_press", name: "Landmine Press", score: 0.9 },
      { exerciseId: "half_kneeling_lp", name: "Half-Kneeling Landmine Press", score: 0.7 },
    ],
  },
  {
    path: "days.1.sections.0.groups.0.exercises.1",
    message: "Cable Y-Raise was imported without a catalog match.",
    suggestions: [],
  },
  // Warning without suggestions (schema warning, not an exercise mismatch)
  {
    path: "days.1.sections.0",
    message: "Unknown section type: power_endurance.",
  },
];

describe("extractUnresolvedExercises", () => {
  it("returns only warnings that have suggestions", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items).toHaveLength(1);
  });

  it("extracts rawName from message", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items[0].rawName).toBe("Landmine Press");
  });

  it("carries suggestions through", () => {
    const items = extractUnresolvedExercises(warnings);
    expect(items[0].suggestions).toHaveLength(2);
    expect(items[0].suggestions[0].exerciseId).toBe("landmine_press");
  });
});

function makeProgram(exerciseName: string): ProgramDocument {
  return {
    id: "p1",
    title: "Test",
    source: "import",
    active: true,
    overrides: [],
    createdAt: "2026-04-29T00:00:00Z",
    updatedAt: "2026-04-29T00:00:00Z",
    days: [
      {
        id: "d1",
        dayNumber: 1,
        title: "Day 1",
        sections: [
          {
            id: "s1",
            type: "strength",
            name: "Strength",
            groups: [
              {
                id: "g1",
                type: "single",
                exercises: [
                  {
                    id: "e1",
                    name: exerciseName,
                    canonicalExerciseId: undefined,
                    tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("applyResolutions", () => {
  it("patches canonicalExerciseId for matching exercise names", () => {
    const program = makeProgram("Landmine Press");
    const resolutions = [{ rawName: "Landmine Press", canonicalId: "landmine_press" }];
    const patched = applyResolutions(program, resolutions);
    expect(
      patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId
    ).toBe("landmine_press");
  });

  it("does not modify exercises that already have canonicalExerciseId", () => {
    const program = makeProgram("Bench Press");
    program.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId =
      "bench_press";
    const resolutions = [{ rawName: "Bench Press", canonicalId: "OTHER" }];
    const patched = applyResolutions(program, resolutions);
    expect(
      patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId
    ).toBe("bench_press");
  });

  it("returns a new program object (immutable)", () => {
    const program = makeProgram("Squat");
    const resolutions = [{ rawName: "Squat", canonicalId: "squat" }];
    const patched = applyResolutions(program, resolutions);
    expect(patched).not.toBe(program);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx jest resolution.test --no-coverage
```

Expected: FAIL — `Cannot find module './resolution'`

- [ ] **Step 3: Create `resolution.ts`**

```typescript
// src/lib/import/resolution.ts
import type {
  ImportWarning,
  ExerciseSuggestion,
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
} from "@/lib/programs/types";

export type ResolutionItem = {
  rawName: string;
  suggestions: ExerciseSuggestion[];
};

export type Resolution = {
  rawName: string;
  canonicalId: string;
};

// Extract from parser warnings: only those that have suggestions (exercise mismatches).
// The rawName is encoded in the warning message as "[name] was imported without a catalog match."
export function extractUnresolvedExercises(
  warnings: ImportWarning[],
): ResolutionItem[] {
  const items: ResolutionItem[] = [];
  for (const w of warnings) {
    if (!w.suggestions || w.suggestions.length === 0) continue;
    const match = w.message.match(/^(.+) was imported without a catalog match\.$/);
    if (!match) continue;
    items.push({ rawName: match[1], suggestions: w.suggestions });
  }
  return items;
}

// Patch a ProgramDocument by setting canonicalExerciseId on exercises that
// match a resolution's rawName and don't yet have one.
export function applyResolutions(
  program: ProgramDocument,
  resolutions: Resolution[],
): ProgramDocument {
  const resMap = new Map(resolutions.map((r) => [r.rawName, r.canonicalId]));

  function patchExercise(ex: ProgramExercise): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(ex.name);
    if (!id) return ex;
    return { ...ex, canonicalExerciseId: id };
  }

  function patchGroup(g: ProgramGroup): ProgramGroup {
    return { ...g, exercises: g.exercises.map(patchExercise) };
  }

  function patchSection(s: ProgramSection): ProgramSection {
    return { ...s, groups: s.groups.map(patchGroup) };
  }

  function patchDay(d: ProgramDay): ProgramDay {
    return { ...d, sections: d.sections.map(patchSection) };
  }

  return { ...program, days: program.days.map(patchDay) };
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest resolution.test --no-coverage
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/resolution.ts src/lib/import/resolution.test.ts
git commit -m "feat(import): add resolution extraction and applyResolutions"
```

---

### Task 2: `ResolutionStep.tsx` — resolution UI component

**Files:**
- Create: `src/components/import/ResolutionStep.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/import/ResolutionStep.tsx
import type { ResolutionItem, Resolution } from "@/lib/import/resolution";

type Props = {
  items: ResolutionItem[];
  resolutions: Record<string, string>; // rawName → chosen canonicalId
  onChange: (rawName: string, canonicalId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ResolutionStep({
  items,
  resolutions,
  onChange,
  onBack,
  onNext,
}: Props) {
  const resolved = items.filter((item) => resolutions[item.rawName]);
  const remaining = items.length - resolved.length;
  const progress = items.length > 0 ? (resolved.length / items.length) * 100 : 100;

  return (
    <div className="stack">
      {/* Summary banner */}
      <div
        className="panel"
        style={{
          background:
            remaining > 0 ? "rgba(var(--warn-rgb, 230,182,100), 0.08)" : "var(--bg-2)",
          borderColor: remaining > 0 ? "var(--warn, #e6b664)" : "var(--line)",
        }}
      >
        <p className="text-sm font-semibold mb-1">
          {remaining} of {items.length} unresolved
        </p>
        <p className="text-xs muted">
          Resolve all before importing — unresolved exercises will break history
          tracking.
        </p>
        <div
          className="mt-2 h-1 rounded-full overflow-hidden"
          style={{ background: "var(--bg-3)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Per-exercise resolution */}
      {items.map((item) => (
        <div key={item.rawName} className="panel stack">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs muted tx-mono">imported</p>
              <p className="text-sm font-semibold">{item.rawName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs muted tx-mono">resolved to</p>
              <p
                className="text-sm font-semibold"
                style={{ color: resolutions[item.rawName] ? "var(--accent)" : "var(--fg-4, #888)" }}
              >
                {resolutions[item.rawName]
                  ? item.suggestions.find(
                      (s) => s.exerciseId === resolutions[item.rawName],
                    )?.name ?? resolutions[item.rawName]
                  : "—"}
              </p>
            </div>
          </div>

          <div className="stack">
            <p className="tx-up text-[10px]">Suggestions</p>
            {item.suggestions.map((s) => (
              <button
                key={s.exerciseId}
                className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
                style={{
                  background:
                    resolutions[item.rawName] === s.exerciseId
                      ? "var(--accent-soft)"
                      : "var(--bg-2)",
                  borderColor:
                    resolutions[item.rawName] === s.exerciseId
                      ? "var(--accent)"
                      : "var(--line)",
                }}
                onClick={() => onChange(item.rawName, s.exerciseId)}
              >
                <span
                  className="font-mono text-[11px] shrink-0"
                  style={{
                    color:
                      resolutions[item.rawName] === s.exerciseId
                        ? "var(--accent)"
                        : "var(--fg-3)",
                  }}
                >
                  {resolutions[item.rawName] === s.exerciseId ? "✓" : "○"}
                </span>
                <span className="flex-1">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button className="button secondary flex-1" onClick={onBack}>
          ← Back
        </button>
        <button
          className="button flex-1"
          disabled={remaining > 0}
          onClick={onNext}
        >
          Review import →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/import/ResolutionStep.tsx
git commit -m "feat(import): add ResolutionStep component"
```

---

### Task 3: Upgrade `ImportClient.tsx` to 3-step wizard

**Files:**
- Modify: `src/components/import/ImportClient.tsx`

- [ ] **Step 1: Read current file**

```bash
cat src/components/import/ImportClient.tsx
```

- [ ] **Step 2: Replace the entire file**

```typescript
// src/components/import/ImportClient.tsx
"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { parseProgramJson, type ImportReview } from "@/lib/import/parser";
import {
  extractUnresolvedExercises,
  applyResolutions,
  type ResolutionItem,
} from "@/lib/import/resolution";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { ResolutionStep } from "./ResolutionStep";

type Step = "paste" | "resolve" | "confirm";

export function ImportClient() {
  const [step, setStep] = useState<Step>("paste");
  const [json, setJson] = useState("");
  const [review, setReview] = useState<ImportReview | undefined>();
  const [parseError, setParseError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const unresolvedItems = useMemo<ResolutionItem[]>(
    () => (review ? extractUnresolvedExercises(review.warnings) : []),
    [review],
  );

  const exerciseCount = useMemo(
    () =>
      review?.program.days.reduce(
        (total, day) =>
          total +
          day.sections.reduce(
            (st, sec) =>
              st +
              sec.groups.reduce((gt, grp) => gt + grp.exercises.length, 0),
            0,
          ),
        0,
      ) ?? 0,
    [review],
  );

  function handleValidate() {
    setParseError(null);
    try {
      const result = parseProgramJson(json);
      setReview(result);
      setResolutions({});
      if (extractUnresolvedExercises(result.warnings).length > 0) {
        setStep("resolve");
      } else {
        setStep("confirm");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse error");
    }
  }

  function handleResolutionChange(rawName: string, canonicalId: string) {
    setResolutions((prev) => ({ ...prev, [rawName]: canonicalId }));
  }

  async function handleSave() {
    if (!review) return;

    const resolvedProgram =
      Object.keys(resolutions).length > 0
        ? applyResolutions(review.program, Object.entries(resolutions).map(([rawName, canonicalId]) => ({ rawName, canonicalId })))
        : review.program;

    // Save chosen aliases so future imports auto-match
    await Promise.all(
      Object.entries(resolutions).map(([rawName, canonicalId]) =>
        aliasRepo.save({
          id: crypto.randomUUID(),
          alias: rawName,
          normalizedAlias: rawName.toLowerCase(),
          canonicalExerciseId: canonicalId,
          createdAt: new Date().toISOString(),
        }),
      ),
    );

    await programRepo.save(resolvedProgram);
    setSavedMessage(`"${resolvedProgram.title}" saved.`);
    setStep("paste");
    setJson("");
    setReview(undefined);
    setResolutions({});
  }

  // ── Step 1: Paste ─────────────────────────────────────────────────────────
  if (step === "paste") {
    return (
      <div className="stack">
        <div>
          <h1 className="text-2xl font-bold">Import</h1>
          <p className="muted">Paste JSON from an AI coach or external source.</p>
        </div>
        {savedMessage && (
          <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
            {savedMessage}
          </p>
        )}
        <textarea
          className="input min-h-72 font-mono text-xs"
          value={json}
          placeholder='{ "program_name": "...", "days": [...] }'
          onChange={(e) => setJson(e.target.value)}
        />
        {parseError && (
          <p className="text-sm" style={{ color: "var(--bad, red)" }}>
            {parseError}
          </p>
        )}
        <button className="button" disabled={!json.trim()} onClick={handleValidate}>
          Validate →
        </button>
      </div>
    );
  }

  // ── Step 2: Resolve ───────────────────────────────────────────────────────
  if (step === "resolve" && review) {
    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Resolve exercises</h1>
        <ResolutionStep
          items={unresolvedItems}
          resolutions={resolutions}
          onChange={handleResolutionChange}
          onBack={() => setStep("paste")}
          onNext={() => setStep("confirm")}
        />
      </div>
    );
  }

  // ── Step 3: Confirm ───────────────────────────────────────────────────────
  if (step === "confirm" && review) {
    const remainingWarnings = review.warnings.filter(
      (w) => !w.suggestions || w.suggestions.length === 0,
    );
    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Confirm import</h1>
        <section className="panel stack">
          <h2 className="font-bold">{review.program.title}</h2>
          <p className="muted text-sm">
            {review.program.days.length} day(s) · {exerciseCount} exercise(s)
          </p>
          {Object.keys(resolutions).length > 0 && (
            <p className="text-sm" style={{ color: "var(--good, green)" }}>
              {Object.keys(resolutions).length} exercise(s) resolved
            </p>
          )}
          {remainingWarnings.length > 0 && (
            <div>
              <p className="tx-up text-xs mb-1">Warnings</p>
              {remainingWarnings.map((w) => (
                <p key={w.path} className="muted text-xs">
                  {w.message}
                </p>
              ))}
            </div>
          )}
        </section>
        <div className="flex gap-2">
          <button
            className="button secondary"
            onClick={() =>
              unresolvedItems.length > 0 ? setStep("resolve") : setStep("paste")
            }
          >
            ← Back
          </button>
          <button className="button flex-1" onClick={handleSave}>
            <Save size={14} /> Save program
          </button>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Verify the wizard works end to end**

Start dev server and open `/import`:

```bash
npm run dev
```

Test the following flow:
1. Paste valid JSON with no unresolved exercises → should skip to Confirm step
2. Paste valid JSON with exercises not in catalog → should go to Resolve step; picking a suggestion updates the progress bar and enables "Review import →"
3. On Confirm, click "Save program" → program appears in `/library` or `/programs`
4. Re-import same JSON → auto-matched exercises should not show in Resolve step (aliases saved)

- [ ] **Step 4: Commit**

```bash
git add src/components/import/ImportClient.tsx
git commit -m "feat(import): upgrade to 3-step wizard with exercise resolution"
```

---

## Self-Review

**Spec coverage:**
- ✅ Paste JSON + Validate step
- ✅ Resolution step only shown when there are unresolved exercises
- ✅ Skips directly to Confirm if no unresolved exercises
- ✅ Per-exercise suggestion chips with confidence score
- ✅ Progress bar showing resolution progress
- ✅ Chosen resolutions saved to `aliasRepo` (auto-match on next import)
- ✅ `applyResolutions` patches `canonicalExerciseId` before saving
- ✅ Back navigation works at each step

**Placeholder scan:** No TBDs. All code complete.

**Type consistency:** `ResolutionItem` and `Resolution` defined in Task 1, imported in Tasks 2 and 3. `ImportReview` imported from existing `parser.ts`. `AliasDocument` shape matches existing `aliasRepo.save` expectations.
