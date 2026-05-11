# Flexible Import Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the resolution step from ~21 required manual actions to ~3–5 by (1) fixing two catalog alias bugs, (2) auto-resolving high-confidence matches and defaulting warmup/cooldown exercises to "custom", and (3) adding a user-controlled exercise catalog so new exercises like "Copenhagen Plank" can be created inline.

**Architecture:** Three independent levers applied in sequence. Lever 1 patches the catalog build config with missing word-order aliases. Lever 2 threads `sectionType` through the parser into `ResolutionItem`, adds a `CUSTOM_ID` sentinel, introduces `buildInitialResolutions()` for pre-filling state, and redesigns `ResolutionStep` with three buckets (auto-resolved / needs-attention / auto-custom). Lever 3 adds a `userExercises` IndexedDB store, extends `matchExercise` to resolve against user-created entries, and wires an "Add to catalog" action into the resolution UI.

**Tech Stack:** TypeScript, React (client components), idb (IndexedDB wrapper), Jest (tests), `bun scripts/build-exercise-catalog.mjs` (catalog rebuild)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/catalog-local-overrides.json` | Modify | Add word-order alias fixes for two exercises |
| `src/lib/catalog/exercises.generated.json` | Regenerated | Rebuilt by catalog:build script |
| `src/lib/catalog/match.test.ts` | Modify | Add alias-fix and user-exercise matching tests |
| `src/lib/programs/types.ts` | Modify | Add `sectionType?` to `ImportWarning`; add `UserExerciseDocument` type |
| `src/lib/storage/appDb.ts` | Modify | Bump DB_VERSION to 3; add `userExercises` object store |
| `src/lib/storage/userExerciseRepo.ts` | Create | CRUD for user-created exercises (IndexedDB) |
| `src/lib/catalog/match.ts` | Modify | Accept `userExercises[]` third param; resolve against them |
| `src/lib/import/parser.ts` | Modify | Thread `sectionType` through normalizeSection → normalizeExercise → warning |
| `src/lib/import/resolution.ts` | Modify | Add `CUSTOM_ID`, `sectionType` on `ResolutionItem`, `buildInitialResolutions()`, CUSTOM_ID guard in `applyResolutions` |
| `src/lib/import/resolution.test.ts` | Modify | Add tests for `buildInitialResolutions` and CUSTOM_ID behavior |
| `src/components/import/ResolutionStep.tsx` | Rewrite | Three-bucket layout, inline search, "Keep as custom", "Add to catalog" |
| `src/components/import/ImportClient.tsx` | Modify | Remove `skipped` state; initialize from `buildInitialResolutions`; load user exercises; pass `onAddToUserCatalog` |

---

## Task 1: Catalog alias fixes

**Files:**
- Modify: `scripts/catalog-local-overrides.json`
- Regenerate: `src/lib/catalog/exercises.generated.json` (via script)
- Modify: `src/lib/catalog/match.test.ts`

### Background
Two catalog entries use "Noun – Type" name ordering (em dash style) that doesn't match how trainers naturally write them. The Jaccard similarity scores 1.0 but the normalized-name lookup fails due to token order.
- `lateral-raise-machine` → name: `"Lateral Raise – Machine"`, needs alias `"machine lateral raise"`
- `slam-medicine-ball` → name: `"Slam – Medicine Ball"`, needs alias `"medicine ball slam"`

- [ ] **Step 1.1: Write the failing tests**

In `src/lib/catalog/match.test.ts`, append inside the `"exercise catalog"` describe block:

```typescript
it("matches 'Machine Lateral Raise' to its catalog entry", () => {
  expect(matchExercise("Machine Lateral Raise")).toMatchObject({
    kind: "matched",
    item: { id: "lateral-raise-machine" },
  });
});

it("matches 'Medicine Ball Slam' to its catalog entry", () => {
  expect(matchExercise("Medicine Ball Slam")).toMatchObject({
    kind: "matched",
    item: { id: "slam-medicine-ball" },
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
npx jest src/lib/catalog/match.test.ts -t "Machine Lateral Raise|Medicine Ball Slam"
```
Expected: FAIL with `"kind": "unmatched"` in the received value.

- [ ] **Step 1.3: Add aliases to overrides**

In `scripts/catalog-local-overrides.json`, append two entries before the final `]`. The file is a flat JSON array — add a comma after the last entry first.

Find the last `}` before the closing `]` and insert:

```json
  ,
  {
    "id": "lateral-raise-machine",
    "aliases": ["machine lateral raise"]
  },
  {
    "id": "slam-medicine-ball",
    "aliases": ["medicine ball slam"]
  }
```

- [ ] **Step 1.4: Rebuild the catalog**

```bash
npm run catalog:build
```
Expected output includes: `applied 48 overrides` (was 46, now 48).

- [ ] **Step 1.5: Run tests to confirm they pass**

```bash
npx jest src/lib/catalog/match.test.ts
```
Expected: all PASS.

- [ ] **Step 1.6: Commit**

```bash
git add scripts/catalog-local-overrides.json src/lib/catalog/exercises.generated.json src/lib/catalog/match.test.ts
git commit -m "fix: add word-order aliases for lateral-raise-machine and slam-medicine-ball"
```

---

## Task 2: UserExercise type and storage

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify: `src/lib/storage/appDb.ts`
- Create: `src/lib/storage/userExerciseRepo.ts`

### Background
User-created exercises need an IndexedDB store so they survive page reloads and get consulted during future imports. The type is intentionally minimal — just an id and a name. The id prefix `user-` distinguishes them from catalog entries.

- [ ] **Step 2.1: Add `UserExerciseDocument` type**

In `src/lib/programs/types.ts`, after the `AliasDocument` type, add:

```typescript
export type UserExerciseDocument = {
  id: ID;
  name: string;
  createdAt: ISODate;
};
```

- [ ] **Step 2.2: Add `userExercises` store to DB schema**

In `src/lib/storage/appDb.ts`, update `TrainerDb` and the migration:

```typescript
// In the TrainerDb interface, add after the `metrics` store:
userExercises: {
  key: string;
  value: UserExerciseDocument;
};
```

Update the import at the top of the file:
```typescript
import type { AliasDocument, BackupDocument, ProfileDocument, ProgramDocument, UserExerciseDocument, WorkoutLogDocument } from "@/lib/programs/types";
```

Update `DB_VERSION` and add the v3 migration:
```typescript
export const DB_VERSION = 3;
```

Inside the `upgrade(db, oldVersion)` callback, after the existing `if (oldVersion < 2)` block:
```typescript
// v2 → v3: add userExercises store
if (oldVersion < 2) {
  if (!db.objectStoreNames.contains("metrics")) {
    db.createObjectStore("metrics", { keyPath: "exerciseId" });
  }
}

if (oldVersion < 3) {
  if (!db.objectStoreNames.contains("userExercises")) {
    db.createObjectStore("userExercises", { keyPath: "id" });
  }
}
```

> Note: The `if (!db.objectStoreNames.contains(...))` guard is required because the `upgrade` callback receives `oldVersion` at the start of the connection — if the store already exists from a fresh install that jumped straight to v3 (via v1→v3 path), attempting to re-create it would throw.

Wait — the existing upgrade code does NOT have the `contains` guard for metrics. Don't change the existing blocks. Only add the new `oldVersion < 3` block:

```typescript
// Replace just the metrics block with the corrected pattern, then add v3:
if (oldVersion < 2) {
  if (!db.objectStoreNames.contains("metrics")) {
    db.createObjectStore("metrics", { keyPath: "exerciseId" });
  }
}

if (oldVersion < 3) {
  if (!db.objectStoreNames.contains("userExercises")) {
    db.createObjectStore("userExercises", { keyPath: "id" });
  }
}
```

- [ ] **Step 2.3: Create `userExerciseRepo.ts`**

Create `src/lib/storage/userExerciseRepo.ts`:

```typescript
import { getDb } from "./appDb";
import type { UserExerciseDocument } from "@/lib/programs/types";

export const userExerciseRepo = {
  async list(): Promise<UserExerciseDocument[]> {
    return (await getDb()).getAll("userExercises");
  },

  async get(id: string): Promise<UserExerciseDocument | undefined> {
    return (await getDb()).get("userExercises", id);
  },

  async save(name: string): Promise<UserExerciseDocument> {
    const doc: UserExerciseDocument = {
      id: `user-${crypto.randomUUID()}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    await (await getDb()).put("userExercises", doc);
    return doc;
  },
};
```

- [ ] **Step 2.4: Write tests for `userExerciseRepo`**

Create `src/lib/storage/userExerciseRepo.test.ts`:

```typescript
import { userExerciseRepo } from "./userExerciseRepo";
import { resetDbConnection } from "./appDb";

beforeEach(() => {
  resetDbConnection();
});

describe("userExerciseRepo", () => {
  it("saves and retrieves a user exercise by id", async () => {
    const saved = await userExerciseRepo.save("Copenhagen Plank");
    const fetched = await userExerciseRepo.get(saved.id);
    expect(fetched).toMatchObject({ id: saved.id, name: "Copenhagen Plank" });
  });

  it("assigns an id prefixed with 'user-'", async () => {
    const saved = await userExerciseRepo.save("Dead Hang");
    expect(saved.id).toMatch(/^user-/);
  });

  it("trims whitespace from the name", async () => {
    const saved = await userExerciseRepo.save("  Wall Walk  ");
    expect(saved.name).toBe("Wall Walk");
  });

  it("lists all saved exercises", async () => {
    await userExerciseRepo.save("Exercise A");
    await userExerciseRepo.save("Exercise B");
    const list = await userExerciseRepo.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const names = list.map((e) => e.name);
    expect(names).toContain("Exercise A");
    expect(names).toContain("Exercise B");
  });

  it("returns undefined for a missing id", async () => {
    const result = await userExerciseRepo.get("user-does-not-exist");
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2.5: Run tests**

```bash
npx jest src/lib/storage/userExerciseRepo.test.ts
```
Expected: all 5 PASS.

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/programs/types.ts src/lib/storage/appDb.ts src/lib/storage/userExerciseRepo.ts src/lib/storage/userExerciseRepo.test.ts
git commit -m "feat: add UserExercise type, DB store v3, and userExerciseRepo"
```

---

## Task 3: User exercise matching

**Files:**
- Modify: `src/lib/catalog/match.ts`
- Modify: `src/lib/import/parser.ts`
- Modify: `src/lib/catalog/match.test.ts`

### Background
When a user resolves "Copenhagen Side Plank" to a user-created exercise (id: `user-{uuid}`), an alias is saved via `aliasRepo`. On the next import, `matchExercise` finds the alias and looks up the catalog for the canonical exercise — but user exercises don't exist in `exerciseCatalog`, so the match silently falls through to "unmatched". This task fixes that by making `matchExercise` accept a `userExercises` array and returning a catalog-shaped item for user exercises.

- [ ] **Step 3.1: Write failing tests**

In `src/lib/catalog/match.test.ts`, append a new describe block:

```typescript
describe("user exercise matching", () => {
  const userExercises = [
    { id: "user-abc123", name: "Copenhagen Plank", createdAt: "2026-05-06T00:00:00Z" },
  ];
  const userAliases = [
    {
      id: "alias-1",
      alias: "Copenhagen Side Plank",
      normalizedAlias: "copenhagen side plank",
      canonicalExerciseId: "user-abc123",
      createdAt: "2026-05-06T00:00:00Z",
    },
  ];

  it("resolves a user exercise via a saved alias", () => {
    const result = matchExercise("Copenhagen Side Plank", userAliases, userExercises);
    expect(result).toMatchObject({
      kind: "matched",
      item: { id: "user-abc123", name: "Copenhagen Plank" },
      via: "user-alias",
    });
  });

  it("resolves a user exercise by exact normalized name when no alias exists", () => {
    const result = matchExercise("Copenhagen Plank", [], userExercises);
    expect(result).toMatchObject({
      kind: "matched",
      item: { id: "user-abc123", name: "Copenhagen Plank" },
    });
  });

  it("returns unmatched when user exercises are empty and no catalog match", () => {
    const result = matchExercise("Copenhagen Side Plank", [], []);
    expect(result.kind).toBe("unmatched");
  });
});
```

Add the `UserExerciseDocument` import at the top of `match.test.ts` — the test passes inline literals so no actual import is needed; the type inference comes from the function signature once updated.

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
npx jest src/lib/catalog/match.test.ts -t "user exercise matching"
```
Expected: FAIL — `matchExercise` doesn't accept a third argument yet.

- [ ] **Step 3.3: Update `matchExercise` signature and logic**

Replace the entire `src/lib/catalog/match.ts`:

```typescript
import { exerciseCatalog, type ExerciseCatalogItem } from "./exercises";
import { normalizeExerciseName, similarity } from "./normalize";
import type { AliasDocument, ExerciseSuggestion, UserExerciseDocument } from "@/lib/programs/types";

export type MatchResult =
  | { kind: "matched"; item: ExerciseCatalogItem; via: "canonical" | "alias" | "normalized" | "user-alias" | "user-exercise" }
  | { kind: "unmatched"; suggestions: ExerciseSuggestion[] };

function userExToItem(ex: UserExerciseDocument): ExerciseCatalogItem {
  return {
    id: ex.id,
    name: ex.name,
    aliases: [],
    equipment: [],
    movementPatterns: [],
    muscles: { primary: [], secondary: [] },
    tags: [],
  };
}

export function matchExercise(
  name: string,
  userAliases: AliasDocument[] = [],
  userExercises: UserExerciseDocument[] = [],
): MatchResult {
  const normalized = normalizeExerciseName(name);

  const canonical = exerciseCatalog.find((item) => item.id === normalized);
  if (canonical) return { kind: "matched", item: canonical, via: "canonical" };

  const userAlias = userAliases.find((alias) => alias.normalizedAlias === normalized);
  if (userAlias) {
    const catalogItem = exerciseCatalog.find((exercise) => exercise.id === userAlias.canonicalExerciseId);
    if (catalogItem) return { kind: "matched", item: catalogItem, via: "user-alias" };
    const userItem = userExercises.find((ex) => ex.id === userAlias.canonicalExerciseId);
    if (userItem) return { kind: "matched", item: userExToItem(userItem), via: "user-alias" };
  }

  const exactAlias = exerciseCatalog.find((item) =>
    item.aliases.some((alias) => normalizeExerciseName(alias) === normalized),
  );
  if (exactAlias) return { kind: "matched", item: exactAlias, via: "alias" };

  const normalizedName = exerciseCatalog.find((item) => normalizeExerciseName(item.name) === normalized);
  if (normalizedName) return { kind: "matched", item: normalizedName, via: "normalized" };

  const userExMatch = userExercises.find((ex) => normalizeExerciseName(ex.name) === normalized);
  if (userExMatch) return { kind: "matched", item: userExToItem(userExMatch), via: "user-exercise" };

  return {
    kind: "unmatched",
    suggestions: exerciseCatalog
      .map((item) => ({ exerciseId: item.id, name: item.name, score: similarity(name, item.name) }))
      .filter((suggestion) => suggestion.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
  };
}
```

- [ ] **Step 3.4: Update `parseProgramJson` to accept and pass user exercises**

In `src/lib/import/parser.ts`, update the two function signatures:

```typescript
// Change parseProgramJson signature:
export function parseProgramJson(
  input: string,
  profileSnapshot?: ProfileDocument,
  aliases: AliasDocument[] = [],
  userExercises: UserExerciseDocument[] = [],
): ImportReview {
  // ... existing try/catch ...
  return normalizePayload(payload, profileSnapshot, aliases, userExercises);
}

// Change normalizePayload signature:
export function normalizePayload(
  payload: ImportPayload,
  profileSnapshot?: ProfileDocument,
  aliases: AliasDocument[] = [],
  userExercises: UserExerciseDocument[] = [],
): ImportReview {
  // ... existing code ...
  const days = detectDays(payload).map((day, index) =>
    normalizeDay(day, index + 1, warnings, aliases, userExercises),
  );
  // ... rest unchanged ...
}
```

Update `normalizeDay`, `normalizeSection`, `normalizeGroup`, `normalizeExercise` to thread `userExercises` through. Only `normalizeExercise` uses it:

```typescript
function normalizeDay(
  day: ImportPayload,
  fallbackDayNumber: number,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
): ProgramDay {
  const sections = arrayOfRecords(day.sections).map((section, index) =>
    normalizeSection(section, `days.${fallbackDayNumber}.sections.${index}`, warnings, aliases, userExercises),
  );
  // ... rest unchanged ...
}

function normalizeSection(
  section: ImportPayload,
  path: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
): ProgramSection {
  const groups = arrayOfRecords(section.exercise_groups ?? section.groups).map((group, index) =>
    normalizeGroup(group, `${path}.groups.${index}`, warnings, aliases, userExercises),
  );
  // ... rest unchanged ...
}

function normalizeGroup(
  group: ImportPayload,
  path: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
): ProgramGroup {
  const exercises = arrayOfRecords(group.exercises).map((exercise, index) =>
    normalizeExercise(exercise, `${path}.exercises.${index}`, warnings, aliases, userExercises),
  );
  // ... rest unchanged ...
}

function normalizeExercise(
  exercise: ImportPayload,
  path: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
): ProgramExercise {
  const name = stringFrom(exercise.name, "Unnamed Exercise").replace(/^[a-z]\.\s+/i, "");
  const match = matchExercise(name, aliases, userExercises);
  // ... rest unchanged ...
}
```

Add the `UserExerciseDocument` import at the top of `parser.ts`:
```typescript
import type { AliasDocument, ImportWarning, ProfileDocument, ProgramDay, ProgramDocument, ProgramExercise, ProgramGroup, ProgramSection, UserExerciseDocument } from "@/lib/programs/types";
```

- [ ] **Step 3.5: Run tests**

```bash
npx jest src/lib/catalog/match.test.ts src/lib/import/parser.test.ts
```
Expected: all PASS.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/catalog/match.ts src/lib/import/parser.ts src/lib/catalog/match.test.ts
git commit -m "feat: extend matchExercise to resolve user-created catalog entries"
```

---

## Task 4: Resolution types and auto-resolve logic

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify: `src/lib/import/resolution.ts`
- Modify: `src/lib/import/resolution.test.ts`

### Background
`ResolutionItem` needs to carry `sectionType` so the UI can default warmup/cooldown items to "custom". The `CUSTOM_ID` sentinel (`"__custom__"`) stored in the `resolutions` map replaces the separate `skipped` Set. `buildInitialResolutions()` pre-fills the map so `ImportClient` starts with most items already handled.

- [ ] **Step 4.1: Add `sectionType` to `ImportWarning`**

In `src/lib/programs/types.ts`, update `ImportWarning`:

```typescript
export type ImportWarning = {
  path: string;
  rawName?: string;
  message: string;
  suggestions?: ExerciseSuggestion[];
  sectionType?: string;
};
```

- [ ] **Step 4.2: Thread `sectionType` through the parser**

In `src/lib/import/parser.ts`, update `normalizeSection` to extract and pass the section type downward:

```typescript
function normalizeSection(
  section: ImportPayload,
  path: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
): ProgramSection {
  const sectionType = normalizeSectionType(stringFrom(section.type, "training"));
  const groups = arrayOfRecords(section.exercise_groups ?? section.groups).map((group, index) =>
    normalizeGroup(group, `${path}.groups.${index}`, warnings, aliases, userExercises, sectionType),
  );
  return {
    id: newId("section"),
    type: sectionType,
    name: stringFrom(section.name ?? section.type, "Training"),
    groups,
  };
}

function normalizeGroup(
  group: ImportPayload,
  path: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  sectionType: string,
): ProgramGroup {
  const exercises = arrayOfRecords(group.exercises).map((exercise, index) =>
    normalizeExercise(exercise, `${path}.exercises.${index}`, warnings, aliases, userExercises, sectionType),
  );
  return {
    id: newId("group"),
    type: normalizeGroupType(optionalString(group.type)),
    notes: optionalString(group.notes),
    exercises,
  };
}

function normalizeExercise(
  exercise: ImportPayload,
  path: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  sectionType: string,
): ProgramExercise {
  const name = stringFrom(exercise.name, "Unnamed Exercise").replace(/^[a-z]\.\s+/i, "");
  const match = matchExercise(name, aliases, userExercises);
  const tags = isRecord(exercise.tags)
    ? {
        primary: stringArray(exercise.tags.primary),
        secondary: stringArray(exercise.tags.secondary),
        incidental: stringArray(exercise.tags.incidental),
        modifiers: stringArray(exercise.tags.modifiers),
      }
    : emptyTags();

  if (match.kind === "unmatched") {
    warnings.push({
      path,
      message: `${name} was imported without a catalog match.`,
      rawName: name,
      suggestions: match.suggestions,
      sectionType,
    });
  }

  return {
    id: newId("exercise"),
    name,
    canonicalExerciseId: match.kind === "matched" ? match.item.id : undefined,
    sets: optionalNumber(exercise.sets),
    reps: optionalString(exercise.reps),
    load: optionalString(exercise.load ?? exercise.weight),
    rest: optionalString(exercise.rest),
    tempo: normalizeTempo(exercise),
    notes: optionalString(exercise.notes),
    tags,
  };
}
```

- [ ] **Step 4.3: Write tests for resolution logic**

In `src/lib/import/resolution.test.ts`, add a new describe block after the existing tests:

```typescript
import {
  extractUnresolvedExercises,
  applyResolutions,
  buildInitialResolutions,
  CUSTOM_ID,
} from "./resolution";

// ... existing tests remain unchanged ...

describe("CUSTOM_ID sentinel", () => {
  it("applyResolutions skips exercises resolved to CUSTOM_ID (no canonicalExerciseId set)", () => {
    const program = makeProgram("Incline Treadmill Walk");
    const resolutions = [
      { path: "days.1.sections.0.groups.0.exercises.0", canonicalId: CUSTOM_ID },
    ];
    const patched = applyResolutions(program, resolutions);
    expect(
      patched.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId,
    ).toBeUndefined();
  });
});

describe("buildInitialResolutions", () => {
  it("pre-selects the top suggestion when score >= 0.65", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Bench Press",
        sectionType: "strength",
        suggestions: [
          { exerciseId: "barbell-bench-press", name: "Barbell Bench Press", score: 0.67 },
          { exerciseId: "dumbbell-bench-press", name: "Dumbbell Bench Press", score: 0.50 },
        ],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe("barbell-bench-press");
  });

  it("does NOT pre-select when top score < 0.65", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Med Ball Chest Pass",
        sectionType: "explosive",
        suggestions: [
          { exerciseId: "medicine-ball-chest-pass", name: "Medicine Ball Chest Pass", score: 0.60 },
        ],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBeUndefined();
  });

  it("sets CUSTOM_ID for warmup section items regardless of suggestions", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Wrist CARs",
        sectionType: "warmup",
        suggestions: [
          { exerciseId: "hip-cars", name: "Hip CARs", score: 0.33 },
        ],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe(CUSTOM_ID);
  });

  it("sets CUSTOM_ID for cooldown section items", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Dead Hang",
        sectionType: "cooldown",
        suggestions: [],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe(CUSTOM_ID);
  });

  it("sets CUSTOM_ID for items with no suggestions", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "SkiErg",
        sectionType: "metcon",
        suggestions: [],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBe(CUSTOM_ID);
  });

  it("leaves items with moderate scores (< 0.65) and non-auto-custom sections unresolved", () => {
    const items = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Row Erg",
        sectionType: "conditioning",
        suggestions: [{ exerciseId: "row", name: "Row", score: 0.50 }],
      },
    ];
    const result = buildInitialResolutions(items);
    expect(result["days.1.sections.0.groups.0.exercises.0"]).toBeUndefined();
  });
});

describe("extractUnresolvedExercises with sectionType", () => {
  it("carries sectionType from warning into ResolutionItem", () => {
    const warningsWithType: ImportWarning[] = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Wrist CARs was imported without a catalog match.",
        rawName: "Wrist CARs",
        suggestions: [],
        sectionType: "warmup",
      },
    ];
    const items = extractUnresolvedExercises(warningsWithType);
    expect(items[0].sectionType).toBe("warmup");
  });

  it("defaults sectionType to 'strength' when warning has no sectionType", () => {
    const warningsWithoutType: ImportWarning[] = [
      {
        path: "days.1.sections.0.groups.0.exercises.0",
        message: "Old Exercise was imported without a catalog match.",
        rawName: "Old Exercise",
        suggestions: [],
      },
    ];
    const items = extractUnresolvedExercises(warningsWithoutType);
    expect(items[0].sectionType).toBe("strength");
  });
});
```

- [ ] **Step 4.4: Run tests to confirm they fail**

```bash
npx jest src/lib/import/resolution.test.ts
```
Expected: FAIL — `buildInitialResolutions`, `CUSTOM_ID` not yet exported; `sectionType` not on `ResolutionItem`.

- [ ] **Step 4.5: Update `resolution.ts`**

Replace the entire `src/lib/import/resolution.ts`:

```typescript
import type {
  ImportWarning,
  ExerciseSuggestion,
  ProgramDocument,
  ProgramDay,
  ProgramSection,
  ProgramGroup,
  ProgramExercise,
} from "@/lib/programs/types";

export const CUSTOM_ID = "__custom__";

const AUTO_CUSTOM_SECTION_TYPES = new Set(["warmup", "cooldown"]);
const AUTO_RESOLVE_THRESHOLD = 0.65;

export type ResolutionItem = {
  path: string;
  rawName: string;
  sectionType: string;
  suggestions: ExerciseSuggestion[];
};

export type Resolution = {
  path: string;
  canonicalId: string;
};

export function extractUnresolvedExercises(
  warnings: ImportWarning[],
): ResolutionItem[] {
  const items: ResolutionItem[] = [];
  for (const w of warnings) {
    const rawName = w.rawName ?? w.message.split(" was imported")[0];
    const isExerciseWarning =
      w.rawName !== undefined ||
      /^.+ was imported without a catalog match\.$/.test(w.message);
    if (!isExerciseWarning) continue;
    items.push({
      path: w.path,
      rawName,
      sectionType: w.sectionType ?? "strength",
      suggestions: w.suggestions ?? [],
    });
  }
  return items;
}

export function buildInitialResolutions(
  items: ResolutionItem[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (AUTO_CUSTOM_SECTION_TYPES.has(item.sectionType) || item.suggestions.length === 0) {
      result[item.path] = CUSTOM_ID;
    } else if (item.suggestions[0].score >= AUTO_RESOLVE_THRESHOLD) {
      result[item.path] = item.suggestions[0].exerciseId;
    }
  }
  return result;
}

export function applyResolutions(
  program: ProgramDocument,
  resolutions: Resolution[],
): ProgramDocument {
  const resMap = new Map(resolutions.map((r) => [r.path, r.canonicalId]));

  function patchExercise(ex: ProgramExercise, path: string): ProgramExercise {
    if (ex.canonicalExerciseId) return ex;
    const id = resMap.get(path);
    if (!id || id === CUSTOM_ID) return ex;
    return { ...ex, canonicalExerciseId: id };
  }

  function patchGroup(g: ProgramGroup, path: string): ProgramGroup {
    return {
      ...g,
      exercises: g.exercises.map((ex, i) =>
        patchExercise(ex, `${path}.exercises.${i}`),
      ),
    };
  }

  function patchSection(s: ProgramSection, path: string): ProgramSection {
    return {
      ...s,
      groups: s.groups.map((g, i) => patchGroup(g, `${path}.groups.${i}`)),
    };
  }

  function patchDay(d: ProgramDay, index: number): ProgramDay {
    const dayPath = `days.${index + 1}`;
    return {
      ...d,
      sections: d.sections.map((s, i) =>
        patchSection(s, `${dayPath}.sections.${i}`),
      ),
    };
  }

  return { ...program, days: program.days.map((d, i) => patchDay(d, i)) };
}
```

- [ ] **Step 4.6: Run tests**

```bash
npx jest src/lib/import/resolution.test.ts src/lib/import/parser.test.ts
```
Expected: all PASS.

- [ ] **Step 4.7: Commit**

```bash
git add src/lib/programs/types.ts src/lib/import/parser.ts src/lib/import/resolution.ts src/lib/import/resolution.test.ts
git commit -m "feat: add sectionType, CUSTOM_ID sentinel, and buildInitialResolutions to resolution logic"
```

---

## Task 5: ResolutionStep UI redesign

**Files:**
- Rewrite: `src/components/import/ResolutionStep.tsx`

### Design
Three visual groups:
1. **Auto-resolved** (collapsed by default, expandable) — items where `resolutions[path]` is set to a catalog/user id (not CUSTOM_ID)
2. **Needs attention** (always expanded) — items with `resolutions[path]` undefined; shows suggestions with score badges, "Keep as custom" button, inline catalog search, "Create as new exercise" option
3. **Importing as custom** (informational footer) — items where `resolutions[path] === CUSTOM_ID`; shows names with "Map to catalog" link that puts them back into needs-attention

Progress bar: (resolved + custom) / total.

The "create" flow: when inline search has a typed query but no matching result is selected, show a "Create '[query]' as exercise" option. Selecting it calls `onAddToUserCatalog(path, query)`.

- [ ] **Step 5.1: Rewrite `ResolutionStep.tsx`**

```typescript
"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { CUSTOM_ID, type ResolutionItem } from "@/lib/import/resolution";
import type { UserExerciseDocument } from "@/lib/programs/types";

type Props = {
  items: ResolutionItem[];
  resolutions: Record<string, string>;
  userExercises: UserExerciseDocument[];
  onChange: (path: string, canonicalId: string) => void;
  onAddToUserCatalog: (path: string, name: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
};

export function ResolutionStep({
  items,
  resolutions,
  userExercises,
  onChange,
  onAddToUserCatalog,
  onBack,
  onNext,
}: Props) {
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [searchState, setSearchState] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<Set<string>>(new Set());

  const resolved = useMemo(
    () => items.filter((i) => resolutions[i.path] && resolutions[i.path] !== CUSTOM_ID),
    [items, resolutions],
  );
  const pending = useMemo(
    () => items.filter((i) => !resolutions[i.path]),
    [items, resolutions],
  );
  const custom = useMemo(
    () => items.filter((i) => resolutions[i.path] === CUSTOM_ID),
    [items, resolutions],
  );

  const handled = resolved.length + custom.length;
  const progress = items.length > 0 ? (handled / items.length) * 100 : 100;
  const allHandled = pending.length === 0;

  function getResolvedName(path: string): string {
    const id = resolutions[path];
    if (!id || id === CUSTOM_ID) return "";
    const catalogItem = exerciseCatalog.find((e) => e.id === id);
    if (catalogItem) return catalogItem.name;
    const userItem = userExercises.find((e) => e.id === id);
    return userItem?.name ?? id;
  }

  function getSearchResults(query: string) {
    if (!query.trim()) return [];
    const q = normalizeExerciseName(query);
    const catalogResults = exerciseCatalog
      .filter((e) => normalizeExerciseName(e.name).includes(q) || e.aliases.some((a) => normalizeExerciseName(a).includes(q)))
      .slice(0, 6)
      .map((e) => ({ id: e.id, name: e.name, isUser: false }));
    const userResults = userExercises
      .filter((e) => normalizeExerciseName(e.name).includes(q))
      .map((e) => ({ id: e.id, name: e.name, isUser: true }));
    return [...userResults, ...catalogResults].slice(0, 6);
  }

  async function handleCreate(path: string, name: string) {
    const s = new Set(adding);
    s.add(path);
    setAdding(s);
    try {
      await onAddToUserCatalog(path, name);
      setSearchState((prev) => ({ ...prev, [path]: "" }));
    } finally {
      const s2 = new Set(adding);
      s2.delete(path);
      setAdding(s2);
    }
  }

  return (
    <div className="stack">
      {/* Progress banner */}
      <div
        className="panel"
        style={{
          background: pending.length > 0 ? "rgba(var(--warn-rgb, 230,182,100), 0.08)" : "var(--bg-2)",
          borderColor: pending.length > 0 ? "var(--warn, #e6b664)" : "var(--line)",
        }}
      >
        <p className="text-sm font-semibold mb-1">
          {handled} of {items.length} handled
        </p>
        <p className="text-xs muted">
          {pending.length > 0
            ? `${pending.length} exercise${pending.length > 1 ? "s" : ""} need attention`
            : "All exercises resolved — ready to proceed."}
        </p>
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Pending items */}
      {pending.length > 0 && (
        <div className="stack">
          <p className="tx-up text-[10px]">Needs attention</p>
          {pending.map((item) => (
            <PendingCard
              key={item.path}
              item={item}
              searchQuery={searchState[item.path] ?? ""}
              onSearchChange={(q) => setSearchState((prev) => ({ ...prev, [item.path]: q }))}
              searchResults={getSearchResults(searchState[item.path] ?? "")}
              onSelect={(id) => { onChange(item.path, id); setSearchState((prev) => ({ ...prev, [item.path]: "" })); }}
              onKeepCustom={() => onChange(item.path, CUSTOM_ID)}
              onCreate={(name) => handleCreate(item.path, name)}
              adding={adding.has(item.path)}
            />
          ))}
        </div>
      )}

      {/* Auto-resolved items */}
      {resolved.length > 0 && (
        <div className="stack">
          <button
            type="button"
            className="flex items-center gap-1.5 tx-up text-[10px]"
            onClick={() => setAutoExpanded((v) => !v)}
          >
            {autoExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Auto-resolved ({resolved.length})
          </button>
          {autoExpanded &&
            resolved.map((item) => (
              <div key={item.path} className="panel flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs muted tx-mono">imported</p>
                  <p className="text-sm font-semibold">{item.rawName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs muted tx-mono">resolved to</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                    {getResolvedName(item.path)}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] muted underline"
                    onClick={() => onChange(item.path, "")}
                  >
                    change
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Custom items */}
      {custom.length > 0 && (
        <div
          className="panel"
          style={{ background: "var(--bg-2)", borderStyle: "dashed" }}
        >
          <p className="tx-up text-[10px] mb-1">Importing as custom (no history tracking)</p>
          <div className="flex flex-wrap gap-1.5">
            {custom.map((item) => (
              <span
                key={item.path}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
              >
                {item.rawName}
                <button
                  type="button"
                  title="Map to catalog"
                  onClick={() => onChange(item.path, "")}
                  style={{ color: "var(--fg-4)" }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <p className="text-[10px] muted mt-1">
            Click × on any exercise above to map it to the catalog instead.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-2">
        <button type="button" className="button secondary flex-1" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="button flex-1"
          disabled={!allHandled}
          onClick={onNext}
        >
          Review import →
        </button>
      </div>
    </div>
  );
}

type PendingCardProps = {
  item: ResolutionItem;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: { id: string; name: string; isUser: boolean }[];
  onSelect: (id: string) => void;
  onKeepCustom: () => void;
  onCreate: (name: string) => Promise<void>;
  adding: boolean;
};

function PendingCard({
  item,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelect,
  onKeepCustom,
  onCreate,
  adding,
}: PendingCardProps) {
  const showCreate = searchQuery.trim().length > 0 && searchResults.length === 0;

  return (
    <div className="panel stack">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs muted tx-mono">imported · {item.sectionType}</p>
          <p className="text-sm font-semibold">{item.rawName}</p>
        </div>
        <button
          type="button"
          className="button secondary shrink-0"
          style={{ fontSize: "0.7rem", padding: "2px 8px" }}
          onClick={onKeepCustom}
        >
          Keep as custom
        </button>
      </div>

      {item.suggestions.length > 0 && (
        <div className="stack">
          <p className="tx-up text-[10px]">Suggestions</p>
          {item.suggestions.map((s) => (
            <button
              key={s.exerciseId}
              type="button"
              className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
              style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
              onClick={() => onSelect(s.exerciseId)}
            >
              <span className="font-mono text-[11px] shrink-0" style={{ color: "var(--fg-3)" }}>
                ○
              </span>
              <span className="flex-1">{s.name}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0"
                style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
              >
                {Math.round(s.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Inline search */}
      <div className="stack">
        <div
          className="flex items-center gap-2 rounded px-2 py-1.5"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
        >
          <Search size={12} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
          <input
            className="flex-1 bg-transparent outline-none text-xs"
            placeholder="Search catalog…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearchChange("")}>
              <X size={11} style={{ color: "var(--fg-3)" }} />
            </button>
          )}
        </div>
        {searchQuery &&
          searchResults.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
              style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
              onClick={() => onSelect(r.id)}
            >
              <span className="flex-1">{r.name}</span>
              {r.isUser && (
                <span
                  className="text-[10px] px-1 rounded font-mono shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  yours
                </span>
              )}
            </button>
          ))}
        {showCreate && (
          <button
            type="button"
            className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
            style={{ background: "var(--bg-2)", borderColor: "var(--line)", borderStyle: "dashed" }}
            disabled={adding}
            onClick={() => onCreate(searchQuery.trim())}
          >
            <span className="flex-1">
              {adding ? "Creating…" : `Create "${searchQuery.trim()}" as exercise`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Run existing tests (they don't import ResolutionStep, so should still pass)**

```bash
npx jest
```
Expected: all PASS (ResolutionStep has no unit tests; it's tested via the UI in step 6).

- [ ] **Step 5.3: Commit**

```bash
git add src/components/import/ResolutionStep.tsx
git commit -m "feat: redesign ResolutionStep with 3-bucket layout, inline search, and keep-as-custom"
```

---

## Task 6: ImportClient wiring

**Files:**
- Modify: `src/components/import/ImportClient.tsx`

### Background
`ImportClient` must: (1) load user exercises alongside aliases before parsing, (2) initialize `resolutions` from `buildInitialResolutions()` instead of empty, (3) remove the `skipped` / `allNoSuggestionHandled` state entirely, (4) handle "add to user catalog" by persisting and updating local state, (5) pass new props to `ResolutionStep`, and (6) filter CUSTOM_ID out of the alias-saving and `applyResolutions` calls.

- [ ] **Step 6.1: Rewrite `ImportClient.tsx`**

Replace the entire file:

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { parseProgramJson, type ImportReview } from "@/lib/import/parser";
import {
  extractUnresolvedExercises,
  applyResolutions,
  buildInitialResolutions,
  CUSTOM_ID,
  type ResolutionItem,
} from "@/lib/import/resolution";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";
import { ResolutionStep } from "./ResolutionStep";
import type { UserExerciseDocument } from "@/lib/programs/types";

type Step = "paste" | "resolve" | "confirm";

export function ImportClient() {
  const [step, setStep] = useState<Step>("paste");
  const [json, setJson] = useState("");
  const [review, setReview] = useState<ImportReview | undefined>();
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [userExercises, setUserExercises] = useState<UserExerciseDocument[]>([]);

  useEffect(() => {
    userExerciseRepo.list().then(setUserExercises);
  }, []);

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
              st + sec.groups.reduce((gt, grp) => gt + grp.exercises.length, 0),
            0,
          ),
        0,
      ) ?? 0,
    [review],
  );

  async function handleValidate() {
    setParseError(null);
    try {
      const [aliases, userExs] = await Promise.all([
        aliasRepo.list(),
        userExerciseRepo.list(),
      ]);
      setUserExercises(userExs);
      const result = parseProgramJson(json, undefined, aliases, userExs);
      setReview(result);
      const initial = buildInitialResolutions(extractUnresolvedExercises(result.warnings));
      setResolutions(initial);
      if (extractUnresolvedExercises(result.warnings).length > 0) {
        setStep("resolve");
      } else {
        setStep("confirm");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse error");
    }
  }

  function handleResolutionChange(path: string, canonicalId: string) {
    setResolutions((prev) => {
      if (!canonicalId) {
        const next = { ...prev };
        delete next[path];
        return next;
      }
      return { ...prev, [path]: canonicalId };
    });
  }

  async function handleAddToUserCatalog(path: string, name: string) {
    const ex = await userExerciseRepo.save(name);
    setUserExercises((prev) => [...prev, ex]);
    setResolutions((prev) => ({ ...prev, [path]: ex.id }));
  }

  async function handleSave() {
    if (!review) return;
    setSaveError(null);

    try {
      const catalogResolutions = unresolvedItems
        .filter((item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID)
        .map((item) => ({ path: item.path, canonicalId: resolutions[item.path] }));

      const resolvedProgram =
        catalogResolutions.length > 0
          ? applyResolutions(review.program, catalogResolutions)
          : review.program;

      await Promise.all(
        unresolvedItems
          .filter((item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID)
          .map((item) =>
            aliasRepo.save({
              alias: item.rawName,
              canonicalExerciseId: resolutions[item.path],
            }),
          ),
      );

      await programRepo.save(resolvedProgram);
      setSavedMessage(`"${resolvedProgram.title}" saved.`);
      setStep("paste");
      setJson("");
      setReview(undefined);
      setResolutions({});
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save program.",
      );
    }
  }

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
        <button
          type="button"
          className="button"
          disabled={!json.trim()}
          onClick={() => void handleValidate()}
        >
          Validate →
        </button>
      </div>
    );
  }

  if (step === "resolve" && review) {
    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Resolve exercises</h1>
        <ResolutionStep
          items={unresolvedItems}
          resolutions={resolutions}
          userExercises={userExercises}
          onChange={handleResolutionChange}
          onAddToUserCatalog={handleAddToUserCatalog}
          onBack={() => setStep("paste")}
          onNext={() => setStep("confirm")}
        />
      </div>
    );
  }

  if (step === "confirm" && review) {
    const resolvedCount = unresolvedItems.filter(
      (i) => resolutions[i.path] && resolutions[i.path] !== CUSTOM_ID,
    ).length;
    const customCount = unresolvedItems.filter(
      (i) => resolutions[i.path] === CUSTOM_ID,
    ).length;

    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Confirm import</h1>
        <section className="panel stack">
          <h2 className="font-bold">{review.program.title}</h2>
          <p className="muted text-sm">
            {review.program.days.length} day(s) · {exerciseCount} exercise(s)
          </p>
          {resolvedCount > 0 && (
            <p className="text-sm" style={{ color: "var(--good, green)" }}>
              {resolvedCount} exercise(s) mapped to catalog
            </p>
          )}
          {customCount > 0 && (
            <p className="text-sm muted">
              {customCount} exercise(s) imported as custom (no history tracking)
            </p>
          )}
        </section>
        {saveError && (
          <p className="text-sm" style={{ color: "var(--bad, red)" }}>
            {saveError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              unresolvedItems.length > 0 ? setStep("resolve") : setStep("paste")
            }
          >
            ← Back
          </button>
          <button type="button" className="button flex-1" onClick={() => void handleSave()}>
            <Save size={14} /> Save program
          </button>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 6.2: Run all tests**

```bash
npx jest
```
Expected: all PASS. Check especially `resolution.test.ts` and `parser.test.ts`.

- [ ] **Step 6.3: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

Navigate to `/import`. Paste the 4-day routine JSON from the plan context. Verify:
- "Validate →" parses successfully
- Resolution step shows the grouped UI
- ~10 exercises auto-resolved (expand "Auto-resolved" to confirm: Bench Press, Back Squat, etc.)
- ~5 exercises auto-custom (warmup/cooldown section): Wrist CARs, Wall Walk, Dead Hang etc.
- ~5 exercises in "Needs attention": Row Erg, SkiErg, Incline Treadmill Walk, Med Ball Chest Pass, etc.
- Clicking "Keep as custom" moves an item to the custom footer
- Inline search finds catalog entries by name
- Typing "Copenhagen Plank" with no results shows "Create 'Copenhagen Plank' as exercise"
- Clicking "Create" creates a user exercise, resolves the item, shows it in the auto-resolved section with "yours" badge in search
- "Review import →" becomes enabled when all items are resolved or custom
- Save succeeds, program appears in the program list

- [ ] **Step 6.4: Commit**

```bash
git add src/components/import/ImportClient.tsx
git commit -m "feat: wire ImportClient to auto-resolve, keep-as-custom, and user catalog flows"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Fix "Machine Lateral Raise" and "Medicine Ball Slam" catalog bugs | Task 1 |
| Auto-pre-select suggestions ≥ 0.65 confidence | Task 4 (buildInitialResolutions) |
| Warmup/cooldown items default to custom | Task 4 (AUTO_CUSTOM_SECTION_TYPES) |
| "Keep as custom" for all items | Task 5 (PendingCard), Task 4 (CUSTOM_ID sentinel) |
| No-suggestion items auto-custom | Task 4 (suggestions.length === 0 → CUSTOM_ID) |
| Inline catalog search beyond 3 suggestions | Task 5 (getSearchResults + search input) |
| "Add to catalog" flow | Task 5 (showCreate + onAddToUserCatalog) + Task 3 (user exercise matching) |
| User exercises searchable on future imports | Task 3 (matchExercise user-alias path) |
| Confirm screen shows resolved vs custom count | Task 6 (updated confirm step) |

**No placeholder check:** All steps contain actual code. No "TBD" or "similar to above".

**Type consistency check:**
- `CUSTOM_ID` exported from `resolution.ts`, imported in `ResolutionStep.tsx` and `ImportClient.tsx` ✓
- `ResolutionItem.sectionType: string` defined in Task 4, used in Task 5 (`item.sectionType`) ✓
- `UserExerciseDocument` defined in Task 2, used in `match.ts` (Task 3), `userExerciseRepo.ts` (Task 2), `ResolutionStep` props (Task 5), `ImportClient` state (Task 6) ✓
- `buildInitialResolutions(items: ResolutionItem[])` defined in Task 4, called in Task 6 after `extractUnresolvedExercises` ✓
- `onAddToUserCatalog: (path: string, name: string) => Promise<void>` defined in Task 5 props, implemented in Task 6 ✓
- `handleResolutionChange` now accepts empty string `""` to un-resolve (move back to pending) — consistent with Task 5's `onChange(item.path, "")` call for "change" and custom item X buttons ✓
