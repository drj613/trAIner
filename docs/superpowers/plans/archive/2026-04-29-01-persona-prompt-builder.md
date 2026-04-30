# Persona Prompt Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal 3-button prompt builder with a full persona-based prompt composer: a grid of 9 coach personas (multi-selectable), ephemeral per-persona block editing, toggleable prompt sections (profile, routine, constraints, schema), a live prompt preview, and a copy button with char count.

**Architecture:** A new `src/lib/prompts/personas.ts` defines `CoachPersona` type and the `DEFAULT_PERSONAS` array. `builder.ts` gains four block-building functions (`buildProfileBlock`, `buildRoutineBlock`, `buildConstraintsBlock`, `buildSchemaBlock`) and an `assemblePrompt` function that combines selected persona blocks with enabled section blocks. `PromptBuilderClient.tsx` is rebuilt as a multi-section form: persona grid at top, block toggles in the middle, prompt preview + copy at bottom. All state is component-local (no persistence needed).

**Tech Stack:** React 19, TypeScript, Next.js App Router, existing `useLocalData` hook, existing `ProfileDocument` + `ProgramDocument` types from `@/lib/programs/types`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/prompts/personas.ts` | `CoachPersona` type + `DEFAULT_PERSONAS` array |
| Create | `src/lib/prompts/personas.test.ts` | Validate all 9 personas have required fields |
| Modify | `src/lib/prompts/builder.ts` | Add `buildProfileBlock`, `buildRoutineBlock`, `buildConstraintsBlock`, `buildSchemaBlock`, `assemblePrompt` |
| Create | `src/lib/prompts/builder.test.ts` | Test each block builder + `assemblePrompt` |
| Modify | `src/components/prompts/PromptBuilderClient.tsx` | Full rebuild: persona grid, block toggles, preview, copy |

---

### Task 1: Define `CoachPersona` type and `DEFAULT_PERSONAS`

**Files:**
- Create: `src/lib/prompts/personas.ts`
- Create: `src/lib/prompts/personas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/prompts/personas.test.ts
import { DEFAULT_PERSONAS } from "./personas";

describe("DEFAULT_PERSONAS", () => {
  it("contains exactly 9 personas", () => {
    expect(DEFAULT_PERSONAS).toHaveLength(9);
  });

  it("every persona has required fields", () => {
    for (const p of DEFAULT_PERSONAS) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.style).toBe("string");
      expect(Array.isArray(p.tags)).toBe(true);
      expect(typeof p.block).toBe("string");
      expect(p.block.length).toBeGreaterThan(0);
    }
  });

  it("persona IDs are unique", () => {
    const ids = DEFAULT_PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx jest personas.test --no-coverage
```

Expected: FAIL — `Cannot find module './personas'`

- [ ] **Step 3: Create `personas.ts`**

```typescript
// src/lib/prompts/personas.ts

export type CoachPersona = {
  id: string;
  name: string;
  style: string;
  tags: string[];
  block: string;
};

export const DEFAULT_PERSONAS: CoachPersona[] = [
  {
    id: "rip",
    name: "Strength Coach (Conservative)",
    style: "rep-first · low frequency · long rests",
    tags: ["strength", "beginner-friendly"],
    block:
      "You are a strength coach. Prioritize compound lifts, 5 reps or less for top sets, 3-5 minutes rest. Add weight only when all sets clear with 1 RIR.",
  },
  {
    id: "pl",
    name: "Powerlifting Specialist",
    style: "SBD focus · % based · weekly waves",
    tags: ["powerlifting", "meet-prep"],
    block:
      "You are a powerlifting coach. Cycle SBD with %1RM-based loading. Compute target weights from last meet 1RMs. Keep volume moderate, intensity high.",
  },
  {
    id: "rp",
    name: "Hypertrophy Methodologist",
    style: "MEV→MAV→MRV · mesocycle progression",
    tags: ["hypertrophy", "volume"],
    block:
      "You are a hypertrophy specialist. Manage volume across a mesocycle: start at MEV, progress to MRV, deload. Track sets-per-muscle weekly.",
  },
  {
    id: "cf",
    name: "Conditioning / WOD Builder",
    style: "metcon · time-domain · couplets",
    tags: ["metcon", "conditioning"],
    block:
      "You are a conditioning coach. Design metcons with explicit time domains (5/10/20 min). Pair compound movements with monostructural work.",
  },
  {
    id: "pt",
    name: "Rehab-Aware Coach",
    style: "pain-aware · regression-first · isometrics",
    tags: ["rehab", "pain"],
    block:
      "You are a movement specialist trained in rehab. Always offer a regression. Use isometrics around pain. Never push through sharp pain.",
  },
  {
    id: "mob",
    name: "Mobility & Movement Quality",
    style: "positions · breath · CARs",
    tags: ["mobility", "warmup"],
    block:
      "You are a mobility coach. Build warmups around joint CARs and breath. Choose positions over reps.",
  },
  {
    id: "minimal",
    name: "Minimalist (3-day full body)",
    style: "low time · 1 lift per pattern · supersets",
    tags: ["minimalist", "time-poor"],
    block:
      "You are a minimalist coach. Limit sessions to 45 minutes. One lift per movement pattern. Use supersets aggressively.",
  },
  {
    id: "physiq",
    name: "Physique Coach",
    style: "aesthetics · weak-point · contest cycle",
    tags: ["physique", "aesthetics"],
    block:
      "You are a physique coach. Bias volume toward stated weak points. Use higher rep ranges (8-15) and shorter rests on isolation work.",
  },
  {
    id: "gpp",
    name: "GPP Generalist",
    style: "balanced · sustainable · lifelong",
    tags: ["general", "longevity"],
    block:
      "You are a general fitness coach. Balance strength, conditioning, and mobility. Optimize for sustainability over peak.",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest personas.test --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/personas.ts src/lib/prompts/personas.test.ts
git commit -m "feat(prompts): add CoachPersona type and DEFAULT_PERSONAS"
```

---

### Task 2: Add block-building functions to `builder.ts`

**Files:**
- Modify: `src/lib/prompts/builder.ts`
- Create: `src/lib/prompts/builder.test.ts`

- [ ] **Step 1: Write failing tests for the new functions**

```typescript
// src/lib/prompts/builder.test.ts
import {
  buildProfileBlock,
  buildRoutineBlock,
  buildConstraintsBlock,
  buildSchemaBlock,
  assemblePrompt,
} from "./builder";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";

const profile: ProfileDocument = {
  id: "local-profile",
  name: "Test User",
  goals: ["Build strength", "Lose fat"],
  equipment: ["Full gym", "Home bands"],
  constraints: ["Avoid full wrist pronation", "Max 75 min sessions"],
  trainingAge: "5 years",
  defaultDaysPerWeek: 4,
  updatedAt: "2026-04-29T00:00:00Z",
};

describe("buildProfileBlock", () => {
  it("includes name, goals, and equipment", () => {
    const block = buildProfileBlock(profile);
    expect(block).toContain("## Profile");
    expect(block).toContain("Test User");
    expect(block).toContain("Build strength");
    expect(block).toContain("Full gym");
  });
});

describe("buildConstraintsBlock", () => {
  it("includes constraints", () => {
    const block = buildConstraintsBlock(profile);
    expect(block).toContain("## Constraints");
    expect(block).toContain("Avoid full wrist pronation");
  });

  it("returns empty string when no constraints", () => {
    const noConstraints: ProfileDocument = { ...profile, constraints: [] };
    expect(buildConstraintsBlock(noConstraints)).toBe("");
  });
});

describe("buildRoutineBlock", () => {
  it("returns empty string with no program", () => {
    expect(buildRoutineBlock(undefined)).toBe("");
  });

  it("includes program title when program provided", () => {
    const prog = { id: "p1", title: "Upper/Lower 4-day" } as ProgramDocument;
    const block = buildRoutineBlock(prog);
    expect(block).toContain("## Routine");
    expect(block).toContain("Upper/Lower 4-day");
  });
});

describe("buildSchemaBlock", () => {
  it("includes JSON schema description", () => {
    const block = buildSchemaBlock();
    expect(block).toContain("## Output schema");
    expect(block).toContain("program");
    expect(block).toContain("days");
  });
});

describe("assemblePrompt", () => {
  it("joins non-empty blocks with double newline", () => {
    const result = assemblePrompt(["block A", "", "block B"]);
    expect(result).toBe("block A\n\nblock B");
  });

  it("returns empty string when all blocks empty", () => {
    expect(assemblePrompt(["", ""])).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest builder.test --no-coverage
```

Expected: FAIL — new exports not found

- [ ] **Step 3: Add the new functions to `builder.ts`**

Replace the entire file:

```typescript
// src/lib/prompts/builder.ts
import type { ProfileDocument, ProgramDocument, ProgramDay, ProgramScope } from "@/lib/programs/types";

export function buildInitialProgramPrompt(profile: ProfileDocument) {
  return [
    "Create a structured workout program for this profile.",
    "",
    "Profile:",
    JSON.stringify(profile, null, 2),
    "",
    "Return only JSON. Use a top-level program_name and days array. Each day must include title, sections, exercise_groups, and exercises.",
    "Preserve sections such as warmup, explosive, strength, metcon, hypertrophy, circuit, and superset when appropriate.",
  ].join("\n");
}

export function buildModificationPrompt(
  program: ProgramDocument,
  scope: ProgramScope,
  current: ProgramDocument | ProgramDay | ProgramDay[],
) {
  return [
    `Modify the selected ${scope} scope for this workout program.`,
    "Return a full JSON replacement for only the selected scope.",
    "Do not explain the changes outside JSON.",
    "",
    "Program context:",
    JSON.stringify({ id: program.id, title: program.title }, null, 2),
    "",
    "Current JSON:",
    JSON.stringify(current, null, 2),
  ].join("\n");
}

export function buildProfileBlock(profile: ProfileDocument): string {
  const lines = [
    "## Profile",
    `Name: ${profile.name}`,
    `Training age: ${profile.trainingAge}`,
    `Days/week: ${profile.defaultDaysPerWeek}`,
  ];
  if (profile.goals.length) lines.push(`Goals: ${profile.goals.join(", ")}`);
  if (profile.equipment.length) lines.push(`Equipment: ${profile.equipment.join(", ")}`);
  return lines.join("\n");
}

export function buildRoutineBlock(program: ProgramDocument | undefined): string {
  if (!program) return "";
  const dayCount = program.days.length;
  const weekCount = program.days.reduce((max, d) => Math.max(max, d.weekNumber ?? 1), 1);
  return [
    "## Routine structure",
    `Program: ${program.title}`,
    `${dayCount} training day(s) · ${weekCount} week mesocycle`,
  ].join("\n");
}

export function buildConstraintsBlock(profile: ProfileDocument): string {
  if (!profile.constraints.length) return "";
  return [
    "## Constraints",
    ...profile.constraints.map((c) => `- ${c}`),
  ].join("\n");
}

export function buildSchemaBlock(): string {
  return [
    "## Output schema",
    "Return JSON only — no prose outside the JSON object.",
    'Top level: { "program": { "title": string, "days": ProgramDay[] } }',
    "Each day: { id, dayNumber, weekNumber?, title, sections: ProgramSection[] }",
    "Each section: { id, type, name, groups: ProgramGroup[] }",
    "Each group: { id, type (single|superset|circuit), exercises: ProgramExercise[] }",
    "Each exercise: { id, name, canonicalExerciseId?, sets?, reps?, load?, rest?, notes?, tags }",
  ].join("\n");
}

export function assemblePrompt(blocks: string[]): string {
  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest builder.test --no-coverage
```

Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/builder.ts src/lib/prompts/builder.test.ts
git commit -m "feat(prompts): add block builders and assemblePrompt"
```

---

### Task 3: Rebuild `PromptBuilderClient.tsx`

**Files:**
- Modify: `src/components/prompts/PromptBuilderClient.tsx`

This is a UI-only rebuild. No new state persistence.

- [ ] **Step 1: Read the current file to understand imports**

```bash
cat src/components/prompts/PromptBuilderClient.tsx
```

- [ ] **Step 2: Replace the entire component**

```typescript
// src/components/prompts/PromptBuilderClient.tsx
"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import {
  buildProfileBlock,
  buildRoutineBlock,
  buildConstraintsBlock,
  buildSchemaBlock,
  assemblePrompt,
} from "@/lib/prompts/builder";
import { DEFAULT_PERSONAS, type CoachPersona } from "@/lib/prompts/personas";

type BlockKey = "profile" | "routine" | "constraints" | "schema";

export function PromptBuilderClient() {
  const { profile, programs } = useLocalData();
  const program = programs[0];

  // Multi-select persona IDs (start with "rp" selected as default)
  const [selectedIds, setSelectedIds] = useState<string[]>(["rp"]);
  // Ephemeral per-persona block edits (keyed by persona ID)
  const [editedBlocks, setEditedBlocks] = useState<Record<string, string>>({});
  // Which standard blocks are enabled
  const [blocks, setBlocks] = useState<Record<BlockKey, boolean>>({
    profile: true,
    routine: true,
    constraints: true,
    schema: true,
  });

  function togglePersona(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleBlock(key: BlockKey) {
    setBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const prompt = useMemo(() => {
    const selectedPersonas = DEFAULT_PERSONAS.filter((p) =>
      selectedIds.includes(p.id)
    );
    const personaBlocks = selectedPersonas.map((p) => {
      const text = editedBlocks[p.id] ?? p.block;
      return `## Coach: ${p.name}\n${text}`;
    });

    const sectionBlocks: string[] = [];
    if (blocks.profile && profile) sectionBlocks.push(buildProfileBlock(profile));
    if (blocks.routine) sectionBlocks.push(buildRoutineBlock(program));
    if (blocks.constraints && profile) sectionBlocks.push(buildConstraintsBlock(profile));
    if (blocks.schema) sectionBlocks.push(buildSchemaBlock());

    return assemblePrompt([...personaBlocks, ...sectionBlocks]);
  }, [selectedIds, editedBlocks, blocks, profile, program]);

  const selectedPersonas = DEFAULT_PERSONAS.filter((p) =>
    selectedIds.includes(p.id)
  );

  return (
    <div className="stack">
      {/* Persona grid */}
      <section>
        <p className="tx-up mb-2">Coach personas · select &amp; combine</p>
        <div className="grid grid-cols-2 gap-2">
          {DEFAULT_PERSONAS.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              selected={selectedIds.includes(p.id)}
              onToggle={() => togglePersona(p.id)}
            />
          ))}
        </div>
      </section>

      {/* Selected persona block editors */}
      {selectedPersonas.length > 0 && (
        <section>
          <p className="tx-up mb-2">Selected persona blocks · ephemeral edits</p>
          <div className="stack">
            {selectedPersonas.map((p) => (
              <div key={p.id} className="panel">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="tx-mono text-xs muted">ephemeral</span>
                </div>
                <textarea
                  className="input font-mono text-xs min-h-20 resize-y"
                  value={editedBlocks[p.id] ?? p.block}
                  onChange={(e) =>
                    setEditedBlocks((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Prompt block toggles */}
      <section>
        <p className="tx-up mb-2">Prompt blocks</p>
        <div className="stack">
          {(
            [
              ["profile", "Profile block"],
              ["routine", "Routine structure block"],
              ["constraints", "Constraints block"],
              ["schema", "Output schema block"],
            ] as [BlockKey, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-3 panel cursor-pointer"
            >
              <input
                type="checkbox"
                checked={blocks[key]}
                onChange={() => toggleBlock(key)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm flex-1">{label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Generated prompt preview */}
      <section>
        <p className="tx-up mb-2">Generated prompt</p>
        <div
          className="panel font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto muted"
          style={{ minHeight: "3rem" }}
        >
          {prompt || "(select at least one persona)"}
        </div>
        <button
          className="button mt-2 w-full justify-center"
          disabled={!prompt}
          onClick={() => navigator.clipboard.writeText(prompt)}
        >
          <Copy size={14} /> Copy prompt · {prompt.length.toLocaleString()} chars
        </button>
      </section>
    </div>
  );
}

function PersonaCard({
  persona,
  selected,
  onToggle,
}: {
  persona: CoachPersona;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="text-left p-2 rounded border transition-colors"
      style={{
        background: selected ? "var(--accent-soft)" : "var(--bg-2)",
        borderColor: selected ? "var(--accent)" : "var(--line)",
        color: "var(--fg)",
      }}
    >
      <div
        className="text-xs font-semibold mb-1 leading-tight"
        style={{ color: selected ? "var(--accent)" : "var(--fg)" }}
      >
        {persona.name}
      </div>
      <div className="tx-mono text-[10px] muted leading-snug mb-2">
        {persona.style}
      </div>
      <div className="flex flex-wrap gap-1">
        {persona.tags.map((tag) => (
          <span
            key={tag}
            className="tx-mono text-[9px] px-1 rounded"
            style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Verify the page renders without errors**

Start dev server and open `/prompts`:

```bash
npm run dev
```

Navigate to `http://localhost:3000/prompts`. Verify:
- 9 persona cards in a 2-column grid
- Clicking a card selects it (accent border) and shows its block editor below
- Clicking again deselects it
- Multiple personas can be selected simultaneously
- The generated prompt updates live as personas and toggles change
- Copy button shows char count and copies to clipboard

- [ ] **Step 4: Commit**

```bash
git add src/components/prompts/PromptBuilderClient.tsx
git commit -m "feat(prompts): rebuild persona prompt builder with 9 coaches and block toggles"
```

---

## Self-Review

**Spec coverage:**
- ✅ 9 coach personas in 2-column grid
- ✅ Multi-select persona combining
- ✅ Ephemeral per-persona block editing
- ✅ Prompt block toggles (profile, routine, constraints, schema)
- ✅ Generated prompt preview
- ✅ Copy button with char count

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:** `CoachPersona` defined in Task 1, imported in Task 3. `BlockKey` defined and used within `PromptBuilderClient.tsx` only. `ProfileDocument` and `ProgramDocument` are imported from existing types.
