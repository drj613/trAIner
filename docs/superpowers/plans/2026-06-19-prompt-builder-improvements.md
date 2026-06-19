# Prompt Builder Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LLM prompt builder send all collected athlete context (fixing the injuries-never-sent bug), demand higher-quality programs, add an ad-hoc injuries input, and harden the pasted-JSON importer with a well-tested sanitizer.

**Architecture:** A declarative `profileFields` registry becomes the single source of truth for which profile fields render into the prompt — the per-field toggle UI, the prompt assemblers, and the completeness nudge all derive from it. The generation prompt's schema block is reordered and reworded (affirmative, output-contract-last). A dependency-free `sanitizeJson` + `parseLooseJson` repairs the common LLM JSON breakers at both paste surfaces, feeding a type-branched recovery prompt.

**Tech Stack:** TypeScript, React (Vite, static GitHub Pages build), Jest + React Testing Library. Spec: `docs/superpowers/specs/2026-06-19-prompt-builder-improvements-design.md`.

**Branch:** `feat/prompt-builder-improvements` (already checked out).

**Run commands:** single test file — `npx jest <path>`; typecheck — `npx tsc --noEmit`.

---

## File structure

**New**
- `src/lib/prompts/profileFields.ts` — field registry, `buildProfileFieldsBlock`, `buildConstraintsFieldsBlock`, `missingImportantFields`.
- `src/lib/prompts/profileFields.test.ts`
- `src/lib/import/sanitizeJson.ts` — `sanitizeJson`, `parseLooseJson`, reason types.
- `src/lib/import/sanitizeJson.test.ts`

**Modified**
- `src/lib/prompts/builder.ts` — remove `buildProfileBlock`/`buildConstraintsBlock`; reorder+reword `buildSchemaBlock`; type-branch `buildRecoveryPrompt`.
- `src/lib/prompts/builder.test.ts` — drop removed-function tests; update schema + recovery tests.
- `src/components/prompts/PromptBuilderClient.tsx` — field toggles, nudge, ad-hoc injuries, registry assembly, synthesis wording.
- `src/components/prompts/PromptBuilderClient.test.tsx` — toggle/nudge/ad-hoc tests.
- `src/lib/analysis/llmPrompt.ts` — injuries fix.
- `src/lib/import/parser.ts` — use `parseLooseJson`; `ImportError` with reason.
- `src/lib/import/parser.test.ts` — sanitizer integration + reason tests.
- `src/components/import/ImportClient.tsx` — carry classified reason to recovery prompt.
- `src/components/workout/ModifyAiModal.tsx` — route paste through `parseLooseJson`.

## Phasing

- **Phase A** — registry + context plumbing + injuries fix (foundation).
- **Phase B** — builder UI (toggles, nudge, ad-hoc injuries, synthesis). Depends on A.
- **Phase C** — generation-prompt upgrades. Independent.
- **Phase D** — JSON hardening + recovery prompt. Independent.

Each phase leaves the app green and shippable.

---

## Phase A — Field registry, context plumbing, injuries fix

### Task A1: Create the `profileFields` registry + assemblers + nudge helper

**Files:**
- Create: `src/lib/prompts/profileFields.ts`
- Test: `src/lib/prompts/profileFields.test.ts`

- [ ] **Step 1: Write the failing tests** (includes the injuries-bug reproduction)

```ts
// src/lib/prompts/profileFields.test.ts
import {
  buildProfileFieldsBlock,
  buildConstraintsFieldsBlock,
  missingImportantFields,
  PROFILE_FIELDS,
} from "./profileFields";
import type { ProfileDocument } from "@/lib/programs/types";

const base: ProfileDocument = {
  id: "local-profile",
  name: "Alex",
  goals: ["Hypertrophy"],
  equipment: ["Full gym"],
  constraints: [],
  injuries: [],
  preferences: [],
  trainingAge: "5 years",
  defaultDaysPerWeek: 4,
  updatedAt: "2026-01-01",
};

const allOn = () => new Set(PROFILE_FIELDS.map((f) => f.key));

describe("buildProfileFieldsBlock", () => {
  it("renders enabled, non-empty profile fields under a Profile header", () => {
    const block = buildProfileFieldsBlock(base, allOn());
    expect(block).toContain("## Profile");
    expect(block).toContain("Name: Alex");
    expect(block).toContain("Training age: 5 years");
    expect(block).toContain("Days per week: 4");
    expect(block).toContain("Goals: Hypertrophy");
    expect(block).toContain("Equipment: Full gym");
  });

  it("includes the previously-dropped fields when present", () => {
    const p: ProfileDocument = {
      ...base,
      body: { age: "30", height: "180cm", weight: "82kg" },
      history: ["Ran Starting Strength"],
      schedule: ["Mon/Wed/Fri", "45 min cap"],
      preferences: ["No barbell back squat"],
    };
    const block = buildProfileFieldsBlock(p, allOn());
    expect(block).toContain("Body: age 30, height 180cm, weight 82kg");
    expect(block).toContain("Training history: Ran Starting Strength");
    expect(block).toContain("Schedule: Mon/Wed/Fri, 45 min cap");
    expect(block).toContain("Exercise preferences: No barbell back squat");
  });

  it("omits fields whose toggle is off", () => {
    const enabled = new Set([...allOn()].filter((k) => k !== "goals"));
    const block = buildProfileFieldsBlock(base, enabled);
    expect(block).not.toContain("Goals:");
  });

  it("returns empty string when no profile fields render", () => {
    expect(buildProfileFieldsBlock(base, new Set())).toBe("");
  });
});

describe("buildConstraintsFieldsBlock (injuries bug)", () => {
  it("renders injuries from profile.injuries", () => {
    const p = { ...base, injuries: ["bad knee"] };
    const block = buildConstraintsFieldsBlock(p, allOn());
    expect(block).toContain("## Injuries & constraints");
    expect(block).toContain("- bad knee");
    expect(block.toLowerCase()).toContain("hard constraint");
  });

  it("falls back to legacy constraints when injuries is empty", () => {
    const p = { ...base, injuries: [], constraints: ["avoid overhead"] };
    const block = buildConstraintsFieldsBlock(p, allOn());
    expect(block).toContain("- avoid overhead");
  });

  it("merges ad-hoc injuries with profile injuries", () => {
    const p = { ...base, injuries: ["bad knee"] };
    const block = buildConstraintsFieldsBlock(p, allOn(), ["tweaked lower back"]);
    expect(block).toContain("- bad knee");
    expect(block).toContain("- tweaked lower back");
  });

  it("returns empty string when no injuries anywhere", () => {
    expect(buildConstraintsFieldsBlock(base, allOn(), [])).toBe("");
  });
});

describe("missingImportantFields", () => {
  it("lists enabled important fields that have no data", () => {
    const missing = missingImportantFields(base, allOn(), []).map((f) => f.key);
    expect(missing).toContain("injuries");
    expect(missing).toContain("schedule");
    expect(missing).not.toContain("goals"); // goals has data
    expect(missing).not.toContain("body"); // body is not important
  });

  it("treats injuries as present when ad-hoc injuries exist", () => {
    const missing = missingImportantFields(base, allOn(), ["sore wrist"]).map((f) => f.key);
    expect(missing).not.toContain("injuries");
  });

  it("ignores fields whose toggle is off", () => {
    const enabled = new Set([...allOn()].filter((k) => k !== "injuries"));
    const missing = missingImportantFields(base, enabled, []).map((f) => f.key);
    expect(missing).not.toContain("injuries");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/prompts/profileFields.test.ts`
Expected: FAIL — `Cannot find module './profileFields'`.

- [ ] **Step 3: Implement the registry module**

```ts
// src/lib/prompts/profileFields.ts
import type { ProfileDocument } from "@/lib/programs/types";

export type FieldGroup = "profile" | "constraints";

export type ProfileField = {
  key: string;
  label: string;
  group: FieldGroup;
  important: boolean;
  hasData: (p: ProfileDocument) => boolean;
  render: (p: ProfileDocument) => string | null;
};

const join = (values: string[] | undefined): string => (values ?? []).join(", ");

export const PROFILE_FIELDS: ProfileField[] = [
  {
    key: "basics",
    label: "Basics (name · days/week)",
    group: "profile",
    important: false,
    hasData: (p) => Boolean(p.name),
    render: (p) => {
      const lines: string[] = [];
      if (p.name) lines.push(`Name: ${p.name}`);
      if (typeof p.defaultDaysPerWeek === "number") {
        lines.push(`Days per week: ${p.defaultDaysPerWeek}`);
      }
      return lines.length ? lines.join("\n") : null;
    },
  },
  {
    key: "history",
    label: "Training history",
    group: "profile",
    important: true,
    hasData: (p) => Boolean(p.trainingAge) || (p.history?.length ?? 0) > 0,
    render: (p) => {
      const lines: string[] = [];
      if (p.trainingAge) lines.push(`Training age: ${p.trainingAge}`);
      if (p.history?.length) lines.push(`Training history: ${join(p.history)}`);
      return lines.length ? lines.join("\n") : null;
    },
  },
  {
    key: "goals",
    label: "Goals",
    group: "profile",
    important: true,
    hasData: (p) => p.goals.length > 0,
    render: (p) => (p.goals.length ? `Goals: ${join(p.goals)}` : null),
  },
  {
    key: "equipment",
    label: "Equipment",
    group: "profile",
    important: true,
    hasData: (p) => p.equipment.length > 0,
    render: (p) => (p.equipment.length ? `Equipment: ${join(p.equipment)}` : null),
  },
  {
    key: "schedule",
    label: "Schedule",
    group: "profile",
    important: true,
    hasData: (p) => (p.schedule?.length ?? 0) > 0,
    render: (p) => (p.schedule?.length ? `Schedule: ${join(p.schedule)}` : null),
  },
  {
    key: "body",
    label: "Body",
    group: "profile",
    important: false,
    hasData: (p) => Object.values(p.body ?? {}).some((v) => v && v !== "—"),
    render: (p) => {
      const b = p.body ?? {};
      const parts: string[] = [];
      if (b.age) parts.push(`age ${b.age}`);
      if (b.height) parts.push(`height ${b.height}`);
      if (b.weight) parts.push(`weight ${b.weight}`);
      if (b.bodyfat) parts.push(`bodyfat ${b.bodyfat}`);
      return parts.length ? `Body: ${parts.join(", ")}` : null;
    },
  },
  {
    key: "preferences",
    label: "Exercise preferences",
    group: "profile",
    important: false,
    hasData: (p) => (p.preferences?.length ?? 0) > 0,
    render: (p) =>
      p.preferences?.length ? `Exercise preferences: ${join(p.preferences)}` : null,
  },
  {
    key: "injuries",
    label: "Injuries",
    group: "constraints",
    important: true,
    hasData: (p) => (p.injuries ?? p.constraints).length > 0,
    render: (p) => {
      const items = p.injuries ?? p.constraints;
      return items.length ? items.map((i) => `- ${i}`).join("\n") : null;
    },
  },
];

const HARD_CONSTRAINT_DIRECTIVE =
  "Treat these as hard constraints — never program a movement that aggravates them; substitute a pain-free alternative that preserves the training stimulus and note the swap.";

export function buildProfileFieldsBlock(
  profile: ProfileDocument,
  enabled: Set<string>,
): string {
  const chunks = PROFILE_FIELDS.filter(
    (f) => f.group === "profile" && enabled.has(f.key),
  )
    .map((f) => f.render(profile))
    .filter((c): c is string => Boolean(c));
  return chunks.length ? ["## Profile", ...chunks].join("\n") : "";
}

export function buildConstraintsFieldsBlock(
  profile: ProfileDocument,
  enabled: Set<string>,
  extraInjuries: string[] = [],
): string {
  const chunks = PROFILE_FIELDS.filter(
    (f) => f.group === "constraints" && enabled.has(f.key),
  )
    .map((f) => f.render(profile))
    .filter((c): c is string => Boolean(c));
  const extra = extraInjuries
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => `- ${i}`);
  const all = [...chunks, ...extra];
  if (!all.length) return "";
  return ["## Injuries & constraints", HARD_CONSTRAINT_DIRECTIVE, ...all].join("\n");
}

export function missingImportantFields(
  profile: ProfileDocument,
  enabled: Set<string>,
  extraInjuries: string[] = [],
): ProfileField[] {
  return PROFILE_FIELDS.filter((f) => {
    if (!f.important || !enabled.has(f.key)) return false;
    if (f.key === "injuries" && extraInjuries.some((i) => i.trim())) return false;
    return !f.hasData(profile);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/prompts/profileFields.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/profileFields.ts src/lib/prompts/profileFields.test.ts
git commit -m "feat(prompts): field registry with injuries fix and full context plumbing"
```

---

### Task A2: Remove the superseded block builders from `builder.ts`

**Files:**
- Modify: `src/lib/prompts/builder.ts` (delete `buildProfileBlock`, `buildConstraintsBlock`)
- Modify: `src/lib/prompts/builder.test.ts` (delete their `describe` blocks)

- [ ] **Step 1: Delete the two functions from `builder.ts`**

Remove the entire `buildProfileBlock` function and the entire `buildConstraintsBlock` function (lines defining them near the top of the file). Leave `buildSchemaBlock`, `buildRecoveryPrompt`, and `assemblePrompt` in place. The `ProfileDocument` import stays only if still referenced; after deletion `builder.ts` no longer needs `ProfileDocument` — remove it from the import on line 1, leaving:

```ts
import type { ProgramDocument } from "@/lib/programs/types";
```

If `ProgramDocument` is now also unused (it is — only the deleted functions used the types), remove the import line entirely.

- [ ] **Step 2: Delete the corresponding tests**

In `src/lib/prompts/builder.test.ts`, delete the `describe("buildProfileBlock", …)` and `describe("buildConstraintsBlock", …)` blocks and the now-unused `profile` fixture / `ProfileDocument` import if nothing else references them. (Keep the `buildSchemaBlock`, `buildRecoveryPrompt`, `assemblePrompt` describes.)

- [ ] **Step 3: Verify the suite is green and types check**

Run: `npx jest src/lib/prompts/builder.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/builder.ts src/lib/prompts/builder.test.ts
git commit -m "refactor(prompts): drop block builders superseded by field registry"
```

---

### Task A3: Fix the same injuries bug in the analysis prompt

**Files:**
- Modify: `src/lib/analysis/llmPrompt.ts:80`
- Test: `src/lib/analysis/llmPrompt.test.ts` (create if absent; otherwise add the case)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analysis/llmPrompt.test.ts  (add this case; create file if missing)
import { buildLlmAnalysisPrompt } from "./llmPrompt";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";

const profile: ProfileDocument = {
  id: "local-profile",
  name: "Alex",
  goals: [],
  equipment: [],
  constraints: [],
  injuries: ["bad shoulder"],
  preferences: [],
  trainingAge: "",
  defaultDaysPerWeek: 4,
  updatedAt: "2026-01-01",
};

const program = {
  id: "p1",
  title: "Test",
  source: "manual",
  active: true,
  days: [],
  overrides: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
} as ProgramDocument;

it("includes injuries (not just legacy constraints) in the analysis prompt", () => {
  expect(buildLlmAnalysisPrompt(program, profile)).toContain("bad shoulder");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/analysis/llmPrompt.test.ts`
Expected: FAIL — output lacks "bad shoulder" (reads empty `constraints`).

- [ ] **Step 3: Apply the one-line fix**

In `src/lib/analysis/llmPrompt.ts:80`, change:

```ts
  if (profile.constraints?.length) lines.push(`- Constraints: ${profile.constraints.join(", ")}`);
```

to:

```ts
  const limitations = profile.injuries ?? profile.constraints;
  if (limitations?.length) lines.push(`- Injuries & constraints: ${limitations.join(", ")}`);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/analysis/llmPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/llmPrompt.ts src/lib/analysis/llmPrompt.test.ts
git commit -m "fix(analysis): send injuries to the routine-analysis prompt"
```

---

## Phase B — Builder UI (toggles, nudge, ad-hoc injuries, synthesis)

### Task B1: Replace block toggles with registry-driven field toggles + assembly

**Files:**
- Modify: `src/components/prompts/PromptBuilderClient.tsx`
- Test: `src/components/prompts/PromptBuilderClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the mock profile in the existing test to include data, and add toggle assertions:

```tsx
// src/components/prompts/PromptBuilderClient.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PromptBuilderClient } from "./PromptBuilderClient";
import type { ProfileDocument } from "@/lib/programs/types";

let mockProfile: ProfileDocument | undefined;

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: mockProfile,
    programs: [],
    loading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

beforeEach(() => {
  mockProfile = {
    id: "local-profile",
    name: "Alex",
    goals: ["Hypertrophy"],
    equipment: ["Full gym"],
    constraints: [],
    injuries: ["bad knee"],
    preferences: [],
    trainingAge: "5 years",
    defaultDaysPerWeek: 4,
    updatedAt: "2026-01-01",
  };
});

function renderBuilder() {
  return render(
    <MemoryRouter>
      <PromptBuilderClient />
    </MemoryRouter>,
  );
}

describe("PromptBuilderClient field toggles", () => {
  it("includes enabled profile fields in the generated prompt", () => {
    renderBuilder();
    expect(screen.getByText(/Goals: Hypertrophy/)).toBeInTheDocument();
    expect(screen.getByText(/- bad knee/)).toBeInTheDocument();
  });

  it("removes a field's text when its toggle is switched off", () => {
    renderBuilder();
    fireEvent.click(screen.getByLabelText("Goals"));
    expect(screen.queryByText(/Goals: Hypertrophy/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx`
Expected: FAIL — no `Goals` checkbox / text yet (old UI has a single "Profile block" toggle).

- [ ] **Step 3: Rewrite the toggle state, assembly, and toggle UI**

In `PromptBuilderClient.tsx`:

Update imports:

```tsx
import {
  buildProfileFieldsBlock,
  buildConstraintsFieldsBlock,
  missingImportantFields,
  PROFILE_FIELDS,
} from "@/lib/prompts/profileFields";
import { buildSchemaBlock, assemblePrompt } from "@/lib/prompts/builder";
```

Replace the `blocks` state and `toggleBlock` with field toggles + schema toggle:

```tsx
  const [fieldOn, setFieldOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, true])),
  );
  const [schemaOn, setSchemaOn] = useState(true);

  function toggleField(key: string) {
    setFieldOn((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const enabled = useMemo(
    () => new Set(Object.entries(fieldOn).filter(([, v]) => v).map(([k]) => k)),
    [fieldOn],
  );
```

Replace the `sectionBlocks` assembly inside the `prompt` `useMemo`:

```tsx
    const sectionBlocks: string[] = [];
    if (profile) {
      sectionBlocks.push(buildProfileFieldsBlock(profile, enabled));
      sectionBlocks.push(
        buildConstraintsFieldsBlock(
          profile,
          enabled,
          enabled.has("injuries") ? adhocInjuries : [],
        ),
      );
    }
    if (schemaOn) sectionBlocks.push(buildSchemaBlock());

    return assemblePrompt([synthesisBlock, ...personaBlocks, ...sectionBlocks]);
  }, [selectedPersonas, editedBlocks, enabled, schemaOn, profile, adhocInjuries]);
```

(`adhocInjuries` is added in Task B3; for B1 add `const adhocInjuries: string[] = [];` as a temporary local just above the memo so this compiles, and remove it in B3 when the real state lands. Mark with `// TEMP: replaced in B3`.)

Replace the "Prompt blocks" `<section>` (the `["profile","routine"...]` map) with registry-driven toggles grouped by group, plus the schema toggle:

```tsx
      <section>
        <p className="tx-up mb-2">Profile fields</p>
        <div className="stack">
          {PROFILE_FIELDS.filter((f) => f.group === "profile").map((f) => (
            <label key={f.key} className="flex items-center gap-3 panel cursor-pointer">
              <input
                type="checkbox"
                checked={fieldOn[f.key]}
                onChange={() => toggleField(f.key)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm flex-1">{f.label}</span>
            </label>
          ))}
        </div>

        <p className="tx-up mb-2 mt-3">Constraints</p>
        <div className="stack">
          {PROFILE_FIELDS.filter((f) => f.group === "constraints").map((f) => (
            <label key={f.key} className="flex items-center gap-3 panel cursor-pointer">
              <input
                type="checkbox"
                checked={fieldOn[f.key]}
                onChange={() => toggleField(f.key)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm flex-1">{f.label}</span>
            </label>
          ))}
        </div>

        <p className="tx-up mb-2 mt-3">Output</p>
        <label className="flex items-center gap-3 panel cursor-pointer">
          <input
            type="checkbox"
            checked={schemaOn}
            onChange={() => setSchemaOn((v) => !v)}
            className="accent-[var(--accent)]"
          />
          <span className="text-sm flex-1">Output schema block</span>
        </label>
      </section>
```

Remove the now-unused `BlockKey` type and the old `blocks`/`toggleBlock` definitions.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prompts/PromptBuilderClient.tsx src/components/prompts/PromptBuilderClient.test.tsx
git commit -m "feat(prompts): per-field include toggles driven by the field registry"
```

---

### Task B2: Add the profile-completeness nudge

**Files:**
- Modify: `src/components/prompts/PromptBuilderClient.tsx`
- Test: `src/components/prompts/PromptBuilderClient.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("PromptBuilderClient nudge", () => {
  it("nudges when an enabled important field is empty", () => {
    mockProfile = { ...mockProfile!, injuries: [], schedule: [] };
    renderBuilder();
    const nudge = screen.getByRole("note");
    expect(nudge).toHaveTextContent(/Injuries/);
    expect(nudge).toHaveTextContent(/Schedule/);
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not nudge when important fields are filled", () => {
    mockProfile = { ...mockProfile!, schedule: ["Mon/Wed/Fri"] }; // injuries already set in beforeEach
    renderBuilder();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx -t nudge`
Expected: FAIL — no element with role `note`.

- [ ] **Step 3: Compute and render the nudge**

Add the computation near `enabled`:

```tsx
  const missing = useMemo(
    () =>
      profile
        ? missingImportantFields(profile, enabled, enabled.has("injuries") ? adhocInjuries : [])
        : [],
    [profile, enabled, adhocInjuries],
  );
```

Render it just above the "Profile fields" section (reusing the warning-banner style already used for the no-profile alert):

```tsx
      {missing.length > 0 && (
        <div
          role="note"
          style={{
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--warn, #e6b664) 12%, var(--bg-2))",
            border: "1px solid var(--warn, #e6b664)",
            borderRadius: "var(--r, 6px)",
            fontSize: 13,
            color: "var(--fg)",
            lineHeight: 1.5,
          }}
        >
          Not yet in your prompt: {missing.map((f) => f.label).join(", ")}.{" "}
          <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Add in Profile →
          </Link>
        </div>
      )}
```

(`Link` is already imported.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prompts/PromptBuilderClient.tsx src/components/prompts/PromptBuilderClient.test.tsx
git commit -m "feat(prompts): profile-completeness nudge for empty high-value fields"
```

---

### Task B3: Add the ad-hoc (temporary) injuries input

**Files:**
- Modify: `src/components/prompts/PromptBuilderClient.tsx`
- Test: `src/components/prompts/PromptBuilderClient.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("PromptBuilderClient ad-hoc injuries", () => {
  it("merges a typed temporary injury into the constraints block", () => {
    renderBuilder();
    const input = screen.getByPlaceholderText(/temporary injury/i);
    fireEvent.change(input, { target: { value: "tweaked lower back" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(/- tweaked lower back/)).toBeInTheDocument();
    expect(screen.getByText(/- bad knee/)).toBeInTheDocument(); // profile injury still present
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx -t "ad-hoc"`
Expected: FAIL — no temporary-injury input.

- [ ] **Step 3: Add the state, the input, and remove the TEMP placeholder**

Add state near the other `useState`s and delete the `// TEMP` `adhocInjuries` local from B1:

```tsx
  const [adhocInjuries, setAdhocInjuries] = useState<string[]>([]);
  const [adhocInput, setAdhocInput] = useState("");

  function addAdhocInjury() {
    const v = adhocInput.trim();
    if (!v || adhocInjuries.includes(v)) return;
    setAdhocInjuries((prev) => [...prev, v]);
    setAdhocInput("");
  }
```

Render the input inside the "Constraints" group, right after the injuries toggle (disabled-looking when the injuries field toggle is off, since it only merges when `enabled.has("injuries")`):

```tsx
        <div className="panel stack" style={{ gap: 6 }}>
          <div className="flex items-center justify-between">
            <span className="text-sm">Temporary injuries (this prompt only)</span>
            <span className="tx-mono text-xs muted">ephemeral</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {adhocInjuries.map((item) => (
              <span
                key={item}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--fg-2)" }}
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => setAdhocInjuries((prev) => prev.filter((i) => i !== item))}
                  style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 1px" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              className="input flex-1"
              style={{ fontSize: 12, padding: "3px 7px" }}
              value={adhocInput}
              placeholder="Add a temporary injury…"
              onChange={(e) => setAdhocInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAdhocInjury()}
            />
            <button type="button" className="button" style={{ fontSize: 11, padding: "2px 8px" }} onClick={addAdhocInjury}>
              Add
            </button>
          </div>
        </div>
```

The assembly memo from B1 already references `adhocInjuries`; with the real state in place it now merges. Confirm the memo dependency array includes `adhocInjuries` (it does).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prompts/PromptBuilderClient.tsx src/components/prompts/PromptBuilderClient.test.tsx
git commit -m "feat(prompts): ad-hoc temporary injuries input merged into constraints"
```

---

### Task B4: Strengthen the multi-coach synthesis wording

**Files:**
- Modify: `src/components/prompts/PromptBuilderClient.tsx` (the `synthesisBlock` string)
- Test: `src/components/prompts/PromptBuilderClient.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("instructs multi-coach prompts to resolve conflicts with explicit rules", () => {
  render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
  // rp is selected by default; select a second persona to trigger synthesis
  fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
  expect(screen.getByText(/resolve each conflict with an explicit rule/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx -t "resolve conflicts"`
Expected: FAIL — phrase not present.

- [ ] **Step 3: Edit the synthesis string**

In the `synthesisBlock` template, replace the Step 2 sentence about avoiding a watered-down average with explicit conflict-resolution. Change the clause:

```
Explain how each coach's methodology shows up where its strengths are most relevant, rather than a watered-down average.
```

to:

```
Explain how each coach's methodology shows up where its strengths are most relevant. Where two coaches genuinely conflict (e.g. hypertrophy volume vs. powerlifting recovery), resolve each conflict with an explicit rule rather than averaging them or splitting the difference.
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/components/prompts/PromptBuilderClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prompts/PromptBuilderClient.tsx src/components/prompts/PromptBuilderClient.test.tsx
git commit -m "feat(prompts): multi-coach synthesis resolves conflicts instead of averaging"
```

---

## Phase C — Generation-prompt upgrades

### Task C1: Reword Output mode (affirmative + rationale + self-audit)

**Files:**
- Modify: `src/lib/prompts/builder.ts` (`conversationMode` inside `buildSchemaBlock`)
- Test: `src/lib/prompts/builder.test.ts`

- [ ] **Step 1: Update the schema tests to the new wording**

Replace the two now-outdated `buildSchemaBlock` cases and add rationale/self-audit assertions:

```ts
  it("defaults to conversational coaching", () => {
    expect(buildSchemaBlock().toLowerCase()).toContain("conversational coaching");
  });
  it("keeps reasoning in chat and out of the JSON", () => {
    expect(buildSchemaBlock()).toMatch(/keep the routine JSON out of this phase|keep all reasoning/i);
  });
  it("requires a pre-emit self-audit of volume, balance, warmups, and injuries", () => {
    const b = buildSchemaBlock().toLowerCase();
    expect(b).toContain("self-audit");
    expect(b).toContain("warmup");
    expect(b).toMatch(/injur|equipment/);
  });
  it("gates JSON emission on the GENERATE IT trigger", () => {
    expect(buildSchemaBlock()).toContain("GENERATE IT");
  });
```

(Delete the old `"defaults to conversational mode"` and `"forbids partial/preview JSON during conversation"` cases.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/prompts/builder.test.ts -t buildSchemaBlock`
Expected: FAIL — new phrases absent.

- [ ] **Step 3: Replace the `conversationMode` string in `buildSchemaBlock`**

```ts
  const conversationMode = `## Output mode

Default to conversational coaching. Ask clarifying questions, surface tradeoffs between approaches, and discuss programming choices with the athlete. Keep the routine JSON out of this phase entirely — discussing in prose keeps the design flexible and easy to revise.

Before the athlete asks for the final routine, make sure you have done the following in the conversation, in prose:
- Stated your key programming decisions: weekly volume per muscle group, intensity scheme (RIR/RPE or %1RM), the progression rule, and the deload plan.
- Run a quick self-audit and fixed any issues — is per-muscle weekly volume within the ranges below? Is the week balanced across movement patterns (push/pull, all major patterns)? Does every session include a warmup? Does every exercise respect the athlete's equipment and injuries?

When the athlete types \`GENERATE IT\` (exactly those words, all caps), switch to emit-only mode for that single response and output the routine JSON described below — and nothing else. Keep all reasoning, rationale, and audit notes in the conversation; the JSON itself carries only the program.

After emitting, return to conversational coaching for any follow-up. If the athlete asks for changes, discuss them in prose until they type \`GENERATE IT\` again.

At the end of every conversational message, append one line: \`Say GENERATE IT (all caps) when you're ready for the final routine.\``;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/prompts/builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/builder.ts src/lib/prompts/builder.test.ts
git commit -m "feat(prompts): affirmative output mode with in-chat rationale and self-audit"
```

---

### Task C2: Add Program requirements + move the output contract to the end

**Files:**
- Modify: `src/lib/prompts/builder.ts` (`buildSchemaBlock` return array)
- Test: `src/lib/prompts/builder.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it("requires a numeric progression scheme and a deload", () => {
    const b = buildSchemaBlock().toLowerCase();
    expect(b).toContain("progression");
    expect(b).toContain("deload");
    expect(b).toMatch(/double progression|load step|%/);
  });
  it("requires a warmup every session and balanced patterns", () => {
    const b = buildSchemaBlock().toLowerCase();
    expect(b).toContain("warmup");
    expect(b).toMatch(/movement pattern|push.*pull/);
  });
  it("ends with the output contract (first char {, last char })", () => {
    const b = buildSchemaBlock();
    const contractIndex = b.indexOf("Output contract");
    expect(contractIndex).toBeGreaterThan(-1);
    // contract is the final section
    expect(b.indexOf("Program requirements")).toBeLessThan(contractIndex);
    expect(b.trimEnd().endsWith("before or after.")).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/prompts/builder.test.ts -t buildSchemaBlock`
Expected: FAIL.

- [ ] **Step 3: Add the constants and reorder the return array**

Add two new constants in `buildSchemaBlock` (near `constraints`/`multiWeekInstructions`):

```ts
  const programRequirements = `## Program requirements
Every routine you emit must include:
- A concrete progressive-overload rule, stated numerically — e.g. double progression ("when all sets reach the top of the rep range at ≤1 RIR, add 2.5–5% load and return to the bottom of the range"), or a defined weekly load step. Avoid vague guidance like "increase over time".
- Periodization with a planned deload — organize multi-week programs into a mesocycle (accumulate volume/intensity across weeks, then a deload week at ~50% volume). Express week-to-week changes using \`weeks\` + \`overrides\`.
- A balanced week — cover the major movement patterns (horizontal/vertical push and pull, hinge, squat) across the week with a sane push:pull ratio; don't leave large gaps or pile redundant volume on one pattern.
- A warmup in every session (a dedicated warmup section or ramp-up sets before heavy work).`;

  const outputContract = `## Output contract (when emitting after GENERATE IT)
Output a single JSON object so the app can import it directly:
- The first character of your reply is \`{\` and the last is \`}\`.
- Use the exact field names and structure from the schema above.
- Use straight ASCII quotes.

Emit only the JSON object — no markdown code fences, no preamble, no commentary before or after.`;
```

Then change the final `return [...]` so the order is: conversation mode, schema definition lines, multi-week, volume constraints, **program requirements**, **output contract LAST**:

```ts
  return [
    conversationMode,
    "## Routine JSON schema (used only when emitting after GENERATE IT)",
    "You MUST use the exact field names shown below. Do not rename or restructure the hierarchy.",
    "  - Top level: `title`, `days`, and optionally `weeks` + `overrides`",
    "  - Each day: `day` (number), `title`, `sections`",
    "  - Each section: `name`, `type`, `groups`",
    "  - Each group: `type`, `exercises`",
    `Valid section types: warmup, explosive, strength, power, hypertrophy, accessory, metcon, cardio, conditioning, rehab, mobility, cooldown, training`,
    `Valid group types: single, superset, circuit, giant-set`,
    multiWeekInstructions,
    constraints,
    "Structural skeleton (all real content should replace the placeholder strings):",
    JSON.stringify(skeleton, null, 2),
    programRequirements,
    outputContract,
  ].join("\n");
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/prompts/builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/builder.ts src/lib/prompts/builder.test.ts
git commit -m "feat(prompts): require progression/deload/warmups; output contract last"
```

---

## Phase D — JSON parser hardening + recovery prompt

### Task D1: Create `sanitizeJson` + `parseLooseJson` (priority test suite)

**Files:**
- Create: `src/lib/import/sanitizeJson.ts`
- Test: `src/lib/import/sanitizeJson.test.ts`

- [ ] **Step 1: Write the comprehensive failing tests**

```ts
// src/lib/import/sanitizeJson.test.ts
import { sanitizeJson, parseLooseJson } from "./sanitizeJson";

describe("sanitizeJson — individual transforms", () => {
  it("strips ```json fences", () => {
    expect(sanitizeJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("strips bare ``` fences", () => {
    expect(sanitizeJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("slices leading preamble and trailing prose (the index-0 bug)", () => {
    expect(sanitizeJson('Here you go:\n{"a":1}')).toBe('{"a":1}');
    expect(sanitizeJson('{"a":1}\n\nLet me know if you want changes!')).toBe('{"a":1}');
  });
  it("normalizes typographic quotes", () => {
    expect(sanitizeJson('{“a”:“b”}')).toBe('{"a":"b"}');
  });
  it("removes line and block comments", () => {
    // assert via JSON.parse: comment removal leaves incidental whitespace/newlines
    expect(JSON.parse(sanitizeJson('{"a":1, // note\n"b":2}'))).toEqual({ a: 1, b: 2 });
    expect(JSON.parse(sanitizeJson('{"a":1, /* x */ "b":2}'))).toEqual({ a: 1, b: 2 });
  });
  it("removes trailing commas in objects and arrays", () => {
    expect(sanitizeJson('{"a":[1,2,],}')).toBe('{"a":[1,2]}');
  });
});

describe("sanitizeJson — string safety", () => {
  it("preserves // inside string values", () => {
    const out = sanitizeJson('{"url":"https://x.io"}');
    expect(JSON.parse(out).url).toBe("https://x.io");
  });
  it("preserves comment-like and comma-brace sequences inside strings", () => {
    const out = sanitizeJson('{"note":"do /* not */ strip, ] this"}');
    expect(JSON.parse(out).note).toBe("do /* not */ strip, ] this");
  });
  it("handles escaped quotes inside strings", () => {
    const out = sanitizeJson('{"note":"she said \\"hi\\","x":1,}');
    expect(JSON.parse(out)).toEqual({ note: 'she said "hi"', x: 1 });
  });
});

describe("sanitizeJson — combinations & passthrough", () => {
  it("repairs fences + smart quotes + trailing comma together", () => {
    const raw = '```json\n{“name”:“A”, "days":[1,2,],}\n```';
    expect(JSON.parse(sanitizeJson(raw))).toEqual({ name: "A", days: [1, 2] });
  });
  it("leaves already-valid JSON byte-stable", () => {
    const valid = '{"a":1,"b":[2,3]}';
    expect(sanitizeJson(valid)).toBe(valid);
  });
});

describe("parseLooseJson", () => {
  it("parses repaired input", () => {
    const r = parseLooseJson('```json\n{"a":1,}\n```');
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });
  it("classifies empty input", () => {
    expect(parseLooseJson("   ")).toEqual({ ok: false, reason: "empty" });
  });
  it("classifies truncated input (unbalanced braces)", () => {
    const r = parseLooseJson('{"days":[{"title":"A"');
    expect(r).toEqual({ ok: false, reason: "truncated" });
  });
  it("classifies other syntax errors", () => {
    const r = parseLooseJson('{"a": that}');
    expect(r).toEqual({ ok: false, reason: "syntax" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/import/sanitizeJson.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sanitizer**

```ts
// src/lib/import/sanitizeJson.ts
export type JsonFailureReason = "empty" | "truncated" | "syntax";
export type RecoveryReason = JsonFailureReason | "not-object" | "no-days";

export type LooseParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: JsonFailureReason };

export function sanitizeJson(raw: string): string {
  let s = raw.trim();
  s = stripFences(s);
  s = sliceBraces(s);
  s = normalizeQuotes(s);
  s = stripComments(s);
  s = removeTrailingCommas(s);
  return s.trim();
}

export function parseLooseJson(raw: string): LooseParseResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };
  const cleaned = sanitizeJson(raw);
  if (!cleaned) return { ok: false, reason: "empty" };
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false, reason: isTruncated(cleaned) ? "truncated" : "syntax" };
  }
}

function stripFences(s: string): string {
  const fenced = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  return fenced ? fenced[1].trim() : s;
}

function sliceBraces(s: string): string {
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s;
}

function normalizeQuotes(s: string): string {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function stripComments(s: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\" && i + 1 < s.length) {
        out += ch + s[i + 1];
        i += 2;
        continue;
      }
      out += ch;
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function removeTrailingCommas(s: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\" && i + 1 < s.length) {
        out += ch + s[i + 1];
        i += 1;
        continue;
      }
      out += ch;
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      if (j < s.length && (s[j] === "}" || s[j] === "]")) continue; // drop trailing comma
    }
    out += ch;
  }
  return out;
}

function isTruncated(s: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return depth > 0 || inString;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/import/sanitizeJson.test.ts`
Expected: PASS (all cases). Comment cases assert via `JSON.parse` equality, so incidental whitespace/newlines left by comment removal don't matter.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/sanitizeJson.ts src/lib/import/sanitizeJson.test.ts
git commit -m "feat(import): dependency-free JSON sanitizer with reason classification"
```

---

### Task D2: Route `parseProgramJson` through the sanitizer + typed `ImportError`

**Files:**
- Modify: `src/lib/import/parser.ts`
- Test: `src/lib/import/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// add to src/lib/import/parser.test.ts
import { parseProgramJson, ImportError } from "./parser";

const DAY = '{"days":[{"title":"A","sections":[{"name":"Main","type":"strength","groups":[{"type":"single","exercises":[{"name":"Squat","sets":3,"reps":"5"}]}]}]}]}';

it("imports JSON that has trailing prose after the closing brace", () => {
  const { program } = parseProgramJson(`${DAY}\n\nLet me know if you want tweaks!`);
  expect(program.days.length).toBe(1);
});

it("repairs smart quotes in pasted JSON", () => {
  const raw = DAY.replace('"title":"A"', "“title”:“A”");
  const { program } = parseProgramJson(raw);
  expect(program.days[0].title).toBe("A");
});

it("throws ImportError with reason 'truncated' for cut-off JSON", () => {
  expect.assertions(2);
  try {
    parseProgramJson('{"days":[{"title":"A"');
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    expect((e as ImportError).reason).toBe("truncated");
  }
});

it("throws ImportError with reason 'no-days' when days are missing", () => {
  try {
    parseProgramJson('{"title":"Empty"}');
  } catch (e) {
    expect((e as ImportError).reason).toBe("no-days");
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/import/parser.test.ts`
Expected: FAIL — `ImportError` not exported; reasons not set.

- [ ] **Step 3: Add `ImportError`, use `parseLooseJson`, classify**

At the top of `parser.ts` add the import and error class:

```ts
import { parseLooseJson, type RecoveryReason } from "@/lib/import/sanitizeJson";

export class ImportError extends Error {
  reason: RecoveryReason;
  constructor(reason: RecoveryReason, message: string) {
    super(message);
    this.name = "ImportError";
    this.reason = reason;
  }
}
```

Replace the body of `parseProgramJson` (the `stripJsonWrapper` + `JSON.parse` + isRecord block):

```ts
export function parseProgramJson(input: string, profileSnapshot?: ProfileDocument, aliases: AliasDocument[] = [], userExercises: UserExerciseDocument[] = []): ImportReview {
  const result = parseLooseJson(input);
  if (!result.ok) {
    const message =
      result.reason === "empty"
        ? "Paste the AI's JSON response first."
        : result.reason === "truncated"
          ? "The pasted JSON looks cut off — paste the full response."
          : "The pasted content is not valid JSON.";
    throw new ImportError(result.reason, message);
  }
  if (!isRecord(result.value)) {
    throw new ImportError("not-object", "The pasted JSON must be an object.");
  }
  return normalizePayload(result.value, profileSnapshot, aliases, userExercises);
}
```

In `normalizePayload`, change the `baseDays.length === 0` throw to an `ImportError`:

```ts
  if (baseDays.length === 0) {
    throw new ImportError(
      "no-days",
      'No workout days found. Make sure you\'re pasting the complete AI response — it should contain a "days" array.'
    );
  }
```

`stripJsonWrapper` is no longer used by `parseProgramJson`. It has no other callers and no tests (verified during planning), so delete the function.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/import/parser.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/parser.ts src/lib/import/parser.test.ts
git commit -m "feat(import): sanitize pasted JSON and classify failures via ImportError"
```

---

### Task D3: Type-branch `buildRecoveryPrompt`

**Files:**
- Modify: `src/lib/prompts/builder.ts`
- Test: `src/lib/prompts/builder.test.ts`

- [ ] **Step 1: Rewrite the recovery tests**

Replace the existing `describe("buildRecoveryPrompt", …)` block:

```ts
describe("buildRecoveryPrompt", () => {
  it("always instructs JSON-only, no fences, straight quotes", () => {
    const p = buildRecoveryPrompt("syntax");
    expect(p).toMatch(/only.*JSON|JSON.*only/i);
    expect(p).toMatch(/no.*fence/i);
    expect(p).toMatch(/straight.*quote/i);
  });
  it("gives a truncation-specific lead and asks for minified output", () => {
    const p = buildRecoveryPrompt("truncated");
    expect(p.toLowerCase()).toContain("cut off");
    expect(p.toLowerCase()).toContain("minified");
  });
  it("explains the required shape for not-object / no-days", () => {
    expect(buildRecoveryPrompt("no-days").toLowerCase()).toContain("days");
    expect(buildRecoveryPrompt("not-object").toLowerCase()).toContain("object");
  });
  it("includes the supplied detail when provided", () => {
    expect(buildRecoveryPrompt("syntax", "Unexpected token x")).toContain("Unexpected token x");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/prompts/builder.test.ts -t buildRecoveryPrompt`
Expected: FAIL — signature/branches not present.

- [ ] **Step 3: Replace `buildRecoveryPrompt`**

```ts
import type { RecoveryReason } from "@/lib/import/sanitizeJson";

export function buildRecoveryPrompt(reason: RecoveryReason, detail?: string): string {
  const contract = [
    "Re-emit ONLY the routine as raw JSON, matching the schema from earlier in this conversation:",
    "- The first character must be `{` and the last must be `}`.",
    "- Use straight ASCII quotes, no markdown code fences, no comments, and no trailing commas.",
    "- No preamble or commentary before or after the JSON.",
    "- Use the exact field names from the schema; do not rename or restructure.",
  ];

  let lead: string;
  switch (reason) {
    case "truncated":
      lead =
        "The previous JSON looks cut off (it ends mid-structure), so it could not be imported. Re-emit the COMPLETE program as a single minified JSON object (no pretty-printing) so it fits in one message.";
      break;
    case "not-object":
      lead =
        "The previous response parsed but was not a JSON object. The top level must be a single JSON object containing a `days` array.";
      break;
    case "no-days":
      lead =
        "The previous JSON had no workout days. The top level must include a `days` array, and each day must contain `sections`.";
      break;
    default:
      lead = detail
        ? `The previous response could not be imported (${detail}).`
        : "The previous response was not valid routine JSON.";
      break;
  }

  return [
    lead,
    "",
    ...contract,
    "",
    "If you need to discuss anything, do that in a separate message after this one — this message must contain only the JSON.",
  ].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/prompts/builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/builder.ts src/lib/prompts/builder.test.ts
git commit -m "feat(prompts): type-branched recovery prompt (truncated/shape/syntax)"
```

---

### Task D4: Wire the classified reason into `ImportClient`

**Files:**
- Modify: `src/components/import/ImportClient.tsx`

- [ ] **Step 1: Track the reason and pass it to the recovery prompt**

Add the import and a reason state:

```tsx
import { parseProgramJson, ImportError, type ImportReview } from "@/lib/import/parser";
import type { RecoveryReason } from "@/lib/import/sanitizeJson";
```

```tsx
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason>("syntax");
```

In `handleValidate`'s `catch`, capture the reason:

```tsx
    } catch (err) {
      if (err instanceof ImportError) {
        setRecoveryReason(err.reason);
        setParseError(err.message);
      } else {
        setRecoveryReason("syntax");
        setParseError(err instanceof Error ? err.message : "Parse error");
      }
    }
```

Update the recovery-button handler to use the reason:

```tsx
              onClick={() => {
                const prompt = buildRecoveryPrompt(recoveryReason, parseError ?? undefined);
                void navigator.clipboard.writeText(prompt).catch(() => {});
              }}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Run the app (`npm run dev` or the project's dev command), go to Import, paste `{"days":[{"title":"A"` (truncated), click Validate → error shows; click "Copy recovery prompt" → clipboard contains the "cut off … minified" wording.

- [ ] **Step 4: Commit**

```bash
git add src/components/import/ImportClient.tsx
git commit -m "feat(import): pass classified failure reason to the recovery prompt"
```

---

### Task D5: Harden the second paste surface (`ModifyAiModal`)

**Files:**
- Modify: `src/components/workout/ModifyAiModal.tsx`

- [ ] **Step 1: Replace the bare `JSON.parse` with `parseLooseJson`**

Add the import:

```tsx
import { parseLooseJson } from "@/lib/import/sanitizeJson";
```

Replace the parse block in `handleApply`:

```tsx
  function handleApply() {
    setError(null);
    const result = parseLooseJson(json);
    if (!result.ok) {
      setError(
        result.reason === "truncated"
          ? "The pasted JSON looks cut off — paste the full output from your AI assistant."
          : "Invalid JSON — paste the full output from your AI assistant.",
      );
      return;
    }
    const raw = result.value;

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      setError("The pasted JSON must be an object.");
      return;
    }

    try {
      const { program } = normalizePayload(raw as Record<string, unknown>);
      const parsedDay = program.days[0];
      if (!parsedDay) {
        setError("No day found in the pasted JSON.");
        return;
      }
      const remapped = remapExerciseIds(currentDay, {
        ...parsedDay,
        id: currentDay.id,
        dayNumber: currentDay.dayNumber,
      });
      onApply(remapped);
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
```

Note: `normalizePayload` now throws `ImportError` for no-days; the existing `catch` handles it as an `Error` and shows its message — acceptable here.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/workout/ModifyAiModal.tsx
git commit -m "feat(workout): sanitize pasted JSON in the modify-with-AI modal"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx jest`
Expected: all suites pass.

- [ ] **Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; production build succeeds (static export).

- [ ] **Manual smoke (prompt builder)**

Open the Prompts page: toggle individual profile fields and confirm the generated prompt updates; with injuries empty, confirm the nudge appears and links to Profile; add a temporary injury and confirm it appears under "## Injuries & constraints"; select two coaches and confirm the conflict-resolution sentence appears.

- [ ] **Commit any final fixes, then push the branch**

```bash
git push -u origin feat/prompt-builder-improvements
```

---

## Self-review notes (author)

- **Spec coverage:** Track 1 → A1/A2/A3 + B (assembly); Track 2 → C1/C2 + B4; Track 3 → B1/B2/B3; Track 4 → D1–D5. All spec sections map to tasks.
- **Type consistency:** `RecoveryReason` defined once in `sanitizeJson.ts`, consumed by `parser.ts` (`ImportError`), `builder.ts` (`buildRecoveryPrompt`), and `ImportClient.tsx`. `LooseParseResult` / `parseLooseJson` shape is consistent across D1/D2/D5. Field `key`s in the registry match the toggle state keys and the `enabled` set used by assemblers and the nudge.
- **Verified during planning:** `llmPrompt.ts` exports `buildLlmAnalysisPrompt(program, profile?)` (Task A3 uses it); `stripJsonWrapper` has no external callers and no tests, so Task D2 deletes it after swapping in `parseLooseJson`; `ModifyAiModal` already imports `normalizePayload` from `parser.ts`.
