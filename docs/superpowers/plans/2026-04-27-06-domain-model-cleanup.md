# Domain Model Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the canonical type boundaries in `src/lib/programs/types.ts` — make `import` optional on `ProgramDocument`, add a `SectionType` string union, introduce an `effectiveWeekNumber` utility, and remove the dummy `import` field from the manual demo program.

**Architecture:** All changes are confined to `types.ts`, `sample.ts`, and a new `src/lib/programs/domain.ts` utility file. No component code changes. The parser, overrides, and storage layers already handle the shapes correctly — this pass makes the types honest so TypeScript enforces invariants the code already assumes.

**Tech Stack:** TypeScript, Jest.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/programs/types.ts` | Make `import` optional; add `SectionType` union |
| Modify | `src/lib/programs/sample.ts` | Remove dummy `import` field from `demoProgram` |
| Create | `src/lib/programs/domain.ts` | `effectiveWeekNumber`, `normalizeSectionType`, `isRestDay` utilities |
| Create | `src/lib/programs/domain.test.ts` | Unit tests for domain utilities |
| Modify | `src/lib/import/parser.ts` | Use `normalizeSectionType` for section classification |

---

## Task 1: Make `import` optional on `ProgramDocument`

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify: `src/lib/programs/sample.ts`

The `import` field is required but meaningless for manually-created programs. Making it optional lets `source: "manual"` programs drop the dummy `rawJson: null` boilerplate.

- [ ] **Step 1.1: Update the type in `types.ts`**

In `src/lib/programs/types.ts`, change the `import` field from required to optional:

```ts
// BEFORE:
export type ProgramDocument = {
  // ...
  import: {
    rawJson: unknown;
    warnings: ImportWarning[];
  };
  // ...
};

// AFTER:
export type ProgramDocument = {
  // ...
  import?: {
    rawJson: unknown;
    warnings: ImportWarning[];
  };
  // ...
};
```

- [ ] **Step 1.2: Check TypeScript for any callers that now need optional chaining**

```bash
bun run build 2>&1 | grep "import\." | head -20
```

Expected: one or two errors in `parser.test.ts` where `review.program.import.rawJson` is accessed without optional chaining.

- [ ] **Step 1.3: Fix `parser.test.ts` — add `?.` operator**

In `src/lib/import/parser.test.ts`, change:

```ts
// BEFORE:
expect(review.program.import.rawJson).toEqual(example);

// AFTER:
expect(review.program.import?.rawJson).toEqual(example);
```

- [ ] **Step 1.4: Remove dummy `import` field from `sample.ts`**

In `src/lib/programs/sample.ts`, delete the `import` field entirely from `demoProgram`:

```ts
// DELETE these lines:
  import: {
    rawJson: null,
    warnings: []
  },
```

- [ ] **Step 1.5: Build check**

```bash
bun run build 2>&1 | tail -5
```

Expected: clean compile.

- [ ] **Step 1.6: Run tests**

```bash
bun run test --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 1.7: Commit**

```bash
git add src/lib/programs/types.ts src/lib/programs/sample.ts src/lib/import/parser.test.ts
git commit -m "refactor(types): make ProgramDocument.import optional for manual programs"
```

---

## Task 2: Add `SectionType` union

**Files:**
- Modify: `src/lib/programs/types.ts`

`ProgramSection.type` is currently `string`, which allows any value. Narrowing it to a union enforces the vocabulary shared between the parser, the component's `sectionKind()` function, and future diff tooling.

- [ ] **Step 2.1: Add the union type before `ProgramSection`**

In `src/lib/programs/types.ts`, insert after the `ProgramScope` definition:

```ts
export type SectionType =
  | "warmup"
  | "explosive"
  | "strength"
  | "power"
  | "hypertrophy"
  | "accessory"
  | "metcon"
  | "cardio"
  | "conditioning"
  | "rehab"
  | "mobility"
  | "cooldown"
  | "training";
```

- [ ] **Step 2.2: Update `ProgramSection` to use the union**

```ts
// BEFORE:
export type ProgramSection = {
  id: ID;
  type: string;
  name: string;
  groups: ProgramGroup[];
};

// AFTER:
export type ProgramSection = {
  id: ID;
  type: SectionType;
  name: string;
  groups: ProgramGroup[];
};
```

- [ ] **Step 2.3: Build to find any type errors**

```bash
bun run build 2>&1 | grep -i "section\|type" | head -20
```

Expected: errors in `parser.ts` where `stringFrom(section.type, "training")` returns `string` instead of `SectionType`. Fix these in Task 4.

- [ ] **Step 2.4: Commit the type definition (build may be red until Task 4)**

```bash
git add src/lib/programs/types.ts
git commit -m "refactor(types): add SectionType union for ProgramSection"
```

---

## Task 3: Create domain utilities

**Files:**
- Create: `src/lib/programs/domain.ts`
- Create: `src/lib/programs/domain.test.ts`

These utilities eliminate scattered inline defaults and ad-hoc string matching across the codebase.

- [ ] **Step 3.1: Write failing tests**

```ts
// src/lib/programs/domain.test.ts
import { effectiveWeekNumber, normalizeSectionType, isRestDay } from "./domain";
import type { ProgramDay } from "./types";

function makeDay(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: "d1",
    dayNumber: 1,
    title: "Day",
    sections: [],
    ...overrides,
  };
}

describe("effectiveWeekNumber", () => {
  it("returns the weekNumber when present", () => {
    expect(effectiveWeekNumber(makeDay({ weekNumber: 3 }))).toBe(3);
  });

  it("returns 1 when weekNumber is undefined", () => {
    expect(effectiveWeekNumber(makeDay({ weekNumber: undefined }))).toBe(1);
  });

  it("returns 1 when weekNumber is 0", () => {
    expect(effectiveWeekNumber(makeDay({ weekNumber: 0 }))).toBe(1);
  });
});

describe("normalizeSectionType", () => {
  it("returns known types unchanged", () => {
    expect(normalizeSectionType("warmup")).toBe("warmup");
    expect(normalizeSectionType("strength")).toBe("strength");
    expect(normalizeSectionType("metcon")).toBe("metcon");
  });

  it("maps unknown type to 'training'", () => {
    expect(normalizeSectionType("mysterious")).toBe("training");
  });

  it("lowercases before matching", () => {
    expect(normalizeSectionType("WARMUP")).toBe("warmup");
    expect(normalizeSectionType("Strength")).toBe("strength");
  });

  it("maps partial matches like 'hypertrophy' → 'hypertrophy'", () => {
    expect(normalizeSectionType("hypertrophy")).toBe("hypertrophy");
  });

  it("maps 'accessory' → 'accessory'", () => {
    expect(normalizeSectionType("accessory")).toBe("accessory");
  });
});

describe("isRestDay", () => {
  it("returns true for day with no sections", () => {
    expect(isRestDay(makeDay({ sections: [] }))).toBe(true);
  });

  it("returns false for day with at least one section", () => {
    expect(
      isRestDay(
        makeDay({
          sections: [{ id: "s1", type: "warmup", name: "Warmup", groups: [] }],
        })
      )
    ).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run to confirm red**

```bash
bun run test -- domain.test --no-coverage
```

Expected: `Cannot find module './domain'`

- [ ] **Step 3.3: Implement `domain.ts`**

```ts
// src/lib/programs/domain.ts
import type { ProgramDay, SectionType } from "./types";

const KNOWN_SECTION_TYPES: SectionType[] = [
  "warmup",
  "explosive",
  "strength",
  "power",
  "hypertrophy",
  "accessory",
  "metcon",
  "cardio",
  "conditioning",
  "rehab",
  "mobility",
  "cooldown",
  "training",
];

export function effectiveWeekNumber(day: ProgramDay): number {
  return day.weekNumber && day.weekNumber > 0 ? day.weekNumber : 1;
}

export function normalizeSectionType(raw: string): SectionType {
  const lower = raw.toLowerCase().trim() as SectionType;
  if (KNOWN_SECTION_TYPES.includes(lower)) return lower;
  return "training";
}

export function isRestDay(day: ProgramDay): boolean {
  return day.sections.length === 0;
}
```

- [ ] **Step 3.4: Run tests green**

```bash
bun run test -- domain.test --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/programs/domain.ts src/lib/programs/domain.test.ts
git commit -m "feat(domain): add effectiveWeekNumber, normalizeSectionType, isRestDay utilities"
```

---

## Task 4: Fix parser to use `normalizeSectionType`

**Files:**
- Modify: `src/lib/import/parser.ts`

The parser currently assigns `type: stringFrom(section.type, "training")` which returns `string`. Switch to `normalizeSectionType` to produce a valid `SectionType`.

- [ ] **Step 4.1: Add import at the top of `parser.ts`**

```ts
import { normalizeSectionType } from "@/lib/programs/domain";
```

- [ ] **Step 4.2: Update `normalizeSection` to use `normalizeSectionType`**

Find `normalizeSection` in `src/lib/import/parser.ts` and change the `type` assignment:

```ts
// BEFORE:
  return {
    id: newId("section"),
    type: stringFrom(section.type, "training"),
    name: stringFrom(section.name ?? section.type, "Training"),
    groups
  };

// AFTER:
  return {
    id: newId("section"),
    type: normalizeSectionType(stringFrom(section.type, "training")),
    name: stringFrom(section.name ?? section.type, "Training"),
    groups
  };
```

- [ ] **Step 4.3: Update sample.ts section types to use literal values from `SectionType`**

`sample.ts` already uses `"warmup"` and `"strength"` which are valid — no change needed. Verify:

```bash
bun run build 2>&1 | grep -i "type.*section\|section.*type" | head -10
```

Expected: no type errors.

- [ ] **Step 4.4: Run full test suite**

```bash
bun run test --no-coverage 2>&1 | tail -15
```

Expected: all tests pass including the parser tests.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/import/parser.ts
git commit -m "refactor(parser): use normalizeSectionType to produce typed SectionType"
```

---

## Task 5: Update `programGrid.ts` to use `effectiveWeekNumber`

**Files:**
- Modify: `src/lib/workout/programGrid.ts`

> Skip this task if `programGrid.ts` has not yet been created (Plan 04 not yet executed).

- [ ] **Step 5.1: Check if programGrid.ts exists**

```bash
ls src/lib/workout/programGrid.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

- [ ] **Step 5.2: If it exists, update the week lookup to use `effectiveWeekNumber`**

In `src/lib/workout/programGrid.ts`, add the import:

```ts
import { effectiveWeekNumber } from "@/lib/programs/domain";
```

Change the inline fallback:

```ts
// BEFORE:
    const week = day.weekNumber ?? 1;

// AFTER:
    const week = effectiveWeekNumber(day);
```

- [ ] **Step 5.3: Run programGrid tests**

```bash
bun run test -- programGrid --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add src/lib/workout/programGrid.ts
git commit -m "refactor(programGrid): use effectiveWeekNumber from domain utilities"
```

---

## Task 6: Full build and test verification

- [ ] **Step 6.1: Clean build**

```bash
bun run build 2>&1 | tail -8
```

Expected: clean compile, no type errors.

- [ ] **Step 6.2: Full test suite**

```bash
bun run test --no-coverage 2>&1 | tail -10
```

Expected: all suites pass.

- [ ] **Step 6.3: Type coverage sanity check**

```bash
grep -r "type: string" src/lib/programs/types.ts
```

Expected: no results — `ProgramSection.type` should now be `SectionType`, not `string`.
