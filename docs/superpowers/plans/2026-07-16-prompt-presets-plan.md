# Prompt Presets — Implementation Plan

Date: 2026-07-16
Spec: `docs/superpowers/specs/2026-07-16-prompt-presets-design.md` (accepted, committed)
Approach: TDD, one stage at a time. Write the failing tests first, then implement until green, then run the stage verification before moving on.

Script reference (from `package.json`):
- Tests: `npm test` (jest). Filter by file/pattern: `npm test -- <pathOrPattern>`.
- Typecheck: `npm run typecheck` (runs `tsc --noEmit` for both app and test tsconfigs).
- Build: `npm run build` (vite build).
- Lint: `npm run lint` (eslint).

Note on jest + IndexedDB: repo/migration tests use `fake-indexeddb`. `appDb.test.ts` relies on it being available and uses `deleteDB(DB_NAME)` + `resetDbConnection()`; `bodyweightRepo.test.ts` imports `"fake-indexeddb/auto"` at the top. Follow whichever the neighboring file in the same suite already does (see each stage).

---

## Stage 1 — `PromptPresetDocument` type + `promptPresets` store + v9 migration

### (a) Files to touch
- `src/lib/programs/types.ts` — add the document type.
- `src/lib/storage/appDb.ts` — schema entry, `DB_VERSION` bump, migration branch, type import.
- `src/lib/storage/appDb.test.ts` — new migration test suite + `seedV8` helper.

### (b) Tests first — add to `src/lib/storage/appDb.test.ts`
Add a new `describe` block after `describe("DB v8 — kg rawCell rescue")` (ends line 331). Add a `seedV8()` helper that opens the DB at version 8 creating all stores that exist through v8 — this is the identical store set used by `seedV7()` (lines 281–298), because v5→v8 add no new stores. Copy that helper body, opening at version `8`:

```ts
describe("DB v9 — promptPresets store", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });
  afterEach(() => {
    resetDbConnection();
  });

  function seedV8() {
    return openDB(DB_NAME, 8, {
      upgrade(db) {
        db.createObjectStore("profile", { keyPath: "id" });
        db.createObjectStore("programs", { keyPath: "id" });
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("by-program", "programId");
        logs.createIndex("by-day", "dayId");
        const aliases = db.createObjectStore("aliases", { keyPath: "id" });
        aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
        aliases.createIndex("by-exercise", "canonicalExerciseId");
        db.createObjectStore("backups", { keyPath: "id" });
        db.createObjectStore("metrics", { keyPath: "exerciseId" });
        db.createObjectStore("userExercises", { keyPath: "id" });
        db.createObjectStore("bodyweight", { keyPath: "id" });
      },
    });
  }

  it("v9 upgrade creates the promptPresets store without dropping existing data", async () => {
    const v8 = await seedV8();
    await v8.put("programs", { ...demoProgram });
    v8.close();

    const db = await getDb(); // triggers v8 → v9 upgrade
    expect(db.objectStoreNames.contains("promptPresets")).toBe(true);
    await expect(programRepo.list()).resolves.toHaveLength(1);
  });
});
```

`openDB`, `deleteDB`, `getDb`, `DB_NAME`, `resetDbConnection`, `programRepo`, `demoProgram` are all already imported at the top of `appDb.test.ts` (lines 1–10).

### (c) Implementation
1. `src/lib/programs/types.ts` — insert directly after `BackupDocument` (after line 223, before `emptyTags` on line 225):
   ```ts
   export type PromptPresetDocument = {
     id: ID;
     name: string;
     personaIds: string[];
     editedBlocks: Record<string, string>;
     fieldOn: Record<string, boolean>;
     schemaOn: boolean;
     createdAt: ISODate;
     updatedAt: ISODate;
   };
   ```
2. `src/lib/storage/appDb.ts`:
   - Line 3 import: add `PromptPresetDocument` to the `@/lib/programs/types` import list.
   - Line 7: change `export const DB_VERSION = 8;` → `9`.
   - Add to the `TrainerDb` interface (after the `bodyweight` block, lines 40–43):
     ```ts
     promptPresets: {
       key: string;
       value: PromptPresetDocument;
     };
     ```
   - Add the migration branch inside `upgrade`, after the v7→v8 block (after line 164, still inside the `upgrade` fn):
     ```ts
     // v8 → v9: add promptPresets store. Create-only; no existing data to migrate.
     if (oldVersion < 9) {
       if (!db.objectStoreNames.contains("promptPresets")) {
         db.createObjectStore("promptPresets", { keyPath: "id" });
       }
     }
     ```

### (d) Verification
```
npm test -- appDb
npm run typecheck
```

---

## Stage 2 — `promptPresetRepo`

### (a) Files to touch
- `src/lib/storage/promptPresetRepo.ts` (new).
- `src/lib/storage/promptPresetRepo.test.ts` (new).

### (b) Tests first — `src/lib/storage/promptPresetRepo.test.ts`
Model on `bodyweightRepo.test.ts` (import `"fake-indexeddb/auto"`, `deleteDB(DB_NAME)` in `beforeEach`, `resetDbConnection` in `afterEach`). A small factory keeps cases terse:

```ts
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { promptPresetRepo } from "./promptPresetRepo";
import { DB_NAME, resetDbConnection } from "./appDb";
import type { PromptPresetDocument } from "@/lib/programs/types";

const make = (over: Partial<PromptPresetDocument> = {}): PromptPresetDocument => ({
  id: "p1",
  name: "Push focus",
  personaIds: ["rp"],
  editedBlocks: {},
  fieldOn: { goals: true },
  schemaOn: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});
afterEach(() => resetDbConnection());

describe("promptPresetRepo", () => {
  it("save then list returns the preset", async () => {
    await promptPresetRepo.save(make());
    const all = await promptPresetRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Push focus");
  });

  it("save twice with same id overwrites (single row)", async () => {
    await promptPresetRepo.save(make({ name: "A" }));
    await promptPresetRepo.save(make({ name: "B" }));
    const all = await promptPresetRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("B");
  });

  it("two different ids with the same name coexist", async () => {
    await promptPresetRepo.save(make({ id: "p1", name: "Dup" }));
    await promptPresetRepo.save(make({ id: "p2", name: "Dup" }));
    expect(await promptPresetRepo.list()).toHaveLength(2);
  });

  it("stamps createdAt once and advances updatedAt on re-save", async () => {
    await promptPresetRepo.save(make({ createdAt: "", updatedAt: "" }));
    const first = (await promptPresetRepo.list())[0];
    expect(first.createdAt).not.toBe("");
    expect(first.updatedAt).not.toBe("");
    await new Promise((r) => setTimeout(r, 2));
    await promptPresetRepo.save({ ...first, name: "edited" });
    const second = (await promptPresetRepo.list())[0];
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.createdAt);
  });

  it("remove deletes a single preset by id", async () => {
    await promptPresetRepo.save(make());
    await promptPresetRepo.remove("p1");
    expect(await promptPresetRepo.list()).toHaveLength(0);
  });
});
```

### (c) Implementation — `src/lib/storage/promptPresetRepo.ts`
Exactly the shape in the spec (thin repo, `put` upsert, `save` stamps timestamps like `programRepo.save`):

```ts
import { getDb } from "./appDb";
import type { PromptPresetDocument } from "@/lib/programs/types";

export const promptPresetRepo = {
  async list(): Promise<PromptPresetDocument[]> {
    return (await getDb()).getAll("promptPresets");
  },

  async save(preset: PromptPresetDocument): Promise<void> {
    const now = new Date().toISOString();
    await (await getDb()).put("promptPresets", {
      ...preset,
      updatedAt: now,
      createdAt: preset.createdAt || now,
    });
  },

  async remove(id: string): Promise<void> {
    await (await getDb()).delete("promptPresets", id);
  },
};
```

### (d) Verification
```
npm test -- promptPresetRepo
npm run typecheck
```

---

## Stage 3 — Backup export / restore round-trip

### (a) Files to touch
- `src/lib/programs/types.ts` — add optional field to `BackupDocument`.
- `src/lib/backup/backup.ts` — export inclusion, restore validation + transaction wiring.
- `src/lib/storage/appDb.test.ts` — extend the existing export/restore suite.

### (b) Tests first — add to `src/lib/storage/appDb.test.ts`
Add cases inside the existing `describe("IndexedDB repositories")` block (lines 13–80). Import `promptPresetRepo` at the top of the file alongside the other repos (line ~7).

```ts
it("exports and restores prompt presets", async () => {
  await programRepo.save(demoProgram);
  await promptPresetRepo.save({
    id: "preset-1",
    name: "Push focus",
    personaIds: ["rp", "pl"],
    editedBlocks: { rp: "custom rp block" },
    fieldOn: { goals: true, equipment: false },
    schemaOn: true,
    createdAt: "",
    updatedAt: "",
  });

  const backup = await exportBackup();
  expect(backup.promptPresets).toHaveLength(1);
  expect(backup.promptPresets?.[0].name).toBe("Push focus");

  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
  await restoreBackup(backup);

  const restored = await promptPresetRepo.list();
  expect(restored).toHaveLength(1);
  expect(restored[0].editedBlocks.rp).toBe("custom rp block");
});

it("restores a backup with no promptPresets field (backward compatibility)", async () => {
  await programRepo.save(demoProgram);
  const backup = await exportBackup();
  const oldBackup = { ...backup, promptPresets: undefined };

  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
  await restoreBackup(oldBackup);

  await expect(programRepo.list()).resolves.toHaveLength(1);
  await expect(promptPresetRepo.list()).resolves.toHaveLength(0);
});
```

### (c) Implementation
1. `src/lib/programs/types.ts` — add to `BackupDocument` (after `bodyweight?` on line 222):
   ```ts
   promptPresets?: PromptPresetDocument[];
   ```
2. `src/lib/backup/backup.ts`:
   - Add import near the other repo imports (after line 7):
     `import { promptPresetRepo } from "@/lib/storage/promptPresetRepo";`
   - In `exportBackup()` (lines 22–33), add to the returned object:
     `promptPresets: await promptPresetRepo.list(),`
   - In `restoreBackup()`:
     - Add optional-field validation after the `bodyweight` block (after line 85), mirroring it:
       ```ts
       if (doc["promptPresets"] !== undefined) {
         if (!isArrayOfObjects(doc["promptPresets"])) {
           throw new Error("Invalid backup: 'promptPresets' must be an array of objects.");
         }
         if (!hasIds(doc["promptPresets"])) {
           throw new Error("Invalid backup: 'promptPresets' entries must have string ids.");
         }
       }
       ```
     - Add `"promptPresets"` to the transaction store list (line 91).
     - Add `tx.objectStore("promptPresets").clear();` with the other clears (after line 98).
     - Add the put loop with the others (after line 105):
       `for (const p of b.promptPresets ?? []) tx.objectStore("promptPresets").put(p);`
   - `resetWorkspace()` needs no change (deletes DB by name).

### (d) Verification
```
npm test -- appDb
npm run typecheck
```

---

## Stage 4 — PromptBuilderClient presets UI

### (a) Files to touch
- `src/components/prompts/PromptBuilderClient.tsx`.
- `src/components/prompts/PromptBuilderClient.test.tsx`.

### (b) Tests first — add to `src/components/prompts/PromptBuilderClient.test.tsx`
The existing suite mocks `@/components/app/LocalDataProvider` and never touches IndexedDB. Add an in-memory mock of the repo so the mount effect and handlers resolve. At the top of the file (with the other `jest.mock` calls):

```ts
let mockPresets: PromptPresetDocument[] = [];
jest.mock("@/lib/storage/promptPresetRepo", () => ({
  promptPresetRepo: {
    list: jest.fn(async () => mockPresets),
    save: jest.fn(async (p) => { mockPresets = [...mockPresets.filter((x) => x.id !== p.id), p]; }),
    remove: jest.fn(async (id) => { mockPresets = mockPresets.filter((x) => x.id !== id); }),
  },
}));
```
Reset `mockPresets = []` in `beforeEach`. Import `PromptPresetDocument` type. Because `list()` is async and runs in a mount effect, load-from-seed tests must `await screen.findBy...` (not `getBy`) for the first render that depends on presets.

New `describe("PromptBuilderClient presets")` cases:

1. **`save creates a preset capturing selections`** — render, click a second persona (`/Powerlifting Specialist/i`), type into the preset-name input (`/name this preset/i`), click `Save`. Assert `promptPresetRepo.save` was called once with `personaIds` containing both `"rp"` and `"pl"` and `schemaOn === true`.

2. **`editedBlocks stores only genuinely edited persona text`** — render (default persona `rp` selected), change the `rp` textarea (`getByLabelText("Hypertrophy Methodologist")`) to `"my custom block"`, name + `Save`. Assert the saved doc's `editedBlocks` equals `{ rp: "my custom block" }`.

3. **`editedBlocks excludes verbatim-default text`** — render, fire a `change` on the `rp` textarea whose value equals the current default block text (`DEFAULT_PERSONAS.find(p => p.id === "rp")!.block`), name + `Save`. Assert saved `editedBlocks` is `{}` (empty).

4. **`load overwrites selections and toggles`** — seed `mockPresets` with a preset `{ personaIds: ["pl"], editedBlocks: {}, fieldOn: { goals: false, ...allOthersTrue }, schemaOn: false }`. Render, `await` the preset row, tap its name. Assert: prompt preview now contains the Powerlifting persona heading and no longer reflects `rp`-only default; `Goals:` text is absent from the preview (goals toggled off); and the schema block is absent. (Use text assertions against the generated-prompt panel.)

5. **`load leaves ad-hoc injuries untouched`** — render, add a temporary injury ("tweaked wrist") via the ad-hoc input, seed + tap a preset, assert `- tweaked wrist` still appears in the constraints block.

6. **Staleness — `persona id no longer in DEFAULT_PERSONAS is skipped on load`** — seed a preset with `personaIds: ["rp", "bogus-removed"]`. Tap it. Assert no throw, the `rp` persona renders, and nothing renders for `"bogus-removed"` (the prompt preview contains the Hypertrophy heading and does not error).

7. **Staleness — `unknown fieldOn key is ignored on load`** — seed a preset with `fieldOn: { goals: true, ancientKey: false }` (all real keys true). Tap it. Assert it loads without error and `Goals:` appears in the preview (the unknown key is dropped, real keys applied).

8. **Staleness — `field absent from preset defaults on`** — seed a preset whose `fieldOn` omits `equipment` entirely (only `{ goals: true }`). Tap it. Assert `Equipment:` still appears in the preview (missing keys default to `true` via the rebuild).

9. **`delete removes a preset row`** — seed one preset, render, `await` the row, click its delete affordance (`/delete .*push focus/i` by `aria-label`), assert the row disappears and `promptPresetRepo.remove` was called with the preset id.

### (c) Implementation — `src/components/prompts/PromptBuilderClient.tsx`
1. Imports:
   - Add `useEffect` to the react import (line 3).
   - `import { promptPresetRepo } from "@/lib/storage/promptPresetRepo";`
   - `import type { PromptPresetDocument } from "@/lib/programs/types";`
2. State (after line 27, with the other `useState`s):
   ```ts
   const [presets, setPresets] = useState<PromptPresetDocument[]>([]);
   const [presetName, setPresetName] = useState("");
   ```
3. Load on mount + a refresh helper:
   ```ts
   const refreshPresets = () =>
     promptPresetRepo.list().then((all) =>
       setPresets([...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
     );
   useEffect(() => { void refreshPresets(); }, []);
   ```
4. Handlers (place with the other handler functions, e.g. after `toggleField`, lines 42–44):
   ```ts
   async function savePreset() {
     const name = presetName.trim();
     if (!name) return;
     const edited: Record<string, string> = {};
     for (const [id, text] of Object.entries(editedBlocks)) {
       const def = DEFAULT_PERSONAS.find((p) => p.id === id);
       if (def && text !== def.block) edited[id] = text;
     }
     await promptPresetRepo.save({
       id: crypto.randomUUID(),
       name,
       personaIds: [...selectedIds],
       editedBlocks: edited,
       fieldOn: { ...fieldOn },
       schemaOn,
       createdAt: "",
       updatedAt: "",
     });
     setPresetName("");
     await refreshPresets();
   }

   function loadPreset(preset: PromptPresetDocument) {
     setSelectedIds(
       preset.personaIds.filter((id) => DEFAULT_PERSONAS.some((p) => p.id === id)),
     );
     setEditedBlocks(
       Object.fromEntries(
         Object.entries(preset.editedBlocks).filter(([id]) =>
           DEFAULT_PERSONAS.some((p) => p.id === id),
         ),
       ),
     );
     setFieldOn(
       Object.fromEntries(
         PROFILE_FIELDS.map((f) => [f.key, preset.fieldOn[f.key] ?? true]),
       ),
     );
     setSchemaOn(preset.schemaOn);
     // adhocInjuries / adhocInput intentionally untouched
   }

   async function deletePreset(id: string) {
     await promptPresetRepo.remove(id);
     await refreshPresets();
   }
   ```
5. UI section — insert as the **first** `<section>` inside the `stack`, immediately after the no-profile alert block (after line 121, before the "Coach personas" section on line 122). Quiet register: `tx-up` header, `panel` rows, ghost `×` delete styled like the ad-hoc injury remove button (lines 223–230), inline save input styled like the ad-hoc add row (lines 234–246):
   ```tsx
   <section>
     <p className="tx-up mb-2">Presets</p>
     {presets.length > 0 && (
       <div className="stack" style={{ gap: 4 }}>
         {presets.map((preset) => (
           <div key={preset.id} className="flex items-center justify-between panel">
             <button
               type="button"
               className="text-sm text-left flex-1"
               style={{ color: "var(--fg)" }}
               onClick={() => loadPreset(preset)}
             >
               {preset.name}
             </button>
             <button
               type="button"
               aria-label={`Delete ${preset.name}`}
               onClick={() => void deletePreset(preset.id)}
               style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 2px" }}
             >
               ×
             </button>
           </div>
         ))}
       </div>
     )}
     <div className="flex gap-1 mt-2">
       <input
         className="input flex-1"
         style={{ fontSize: 12, padding: "3px 7px" }}
         value={presetName}
         placeholder="Name this preset…"
         onChange={(e) => setPresetName(e.target.value)}
         onKeyDown={(e) => e.key === "Enter" && void savePreset()}
       />
       <button
         type="button"
         className="button"
         style={{ fontSize: 11, padding: "2px 8px" }}
         disabled={!presetName.trim()}
         onClick={() => void savePreset()}
       >
         Save
       </button>
     </div>
   </section>
   ```

### (d) Verification
```
npm test -- PromptBuilderClient
npm run typecheck
npm run lint
```

---

## Stage 5 — Full suite + typecheck + build

### (a) Files to touch
None (verification only).

### (d) Verification
```
npm test
npm run typecheck
npm run build
npm run lint
```
All must pass. `npm run build` confirms the static GitHub Pages bundle still compiles (no server APIs introduced).

---

## Execution notes
- Do each stage's tests → implementation → stage verification before starting the next.
- Stages 1→3 are strictly sequential (each imports the previous). Stage 4 depends only on the repo (Stage 2). Stage 5 last.
- No new dependencies. No config changes. No changes outside the files named per stage.
