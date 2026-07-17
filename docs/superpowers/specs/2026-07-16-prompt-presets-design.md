# Prompt Presets — Design Spec

Date: 2026-07-16
Status: Approved for planning
Scope: `src/components/prompts/PromptBuilderClient.tsx`, `src/lib/programs/types.ts`, `src/lib/storage/*`, `src/lib/backup/backup.ts`

## Problem

Every control in the prompt builder is ephemeral React state (`PromptBuilderClient.tsx` lines 20–27):
`selectedIds`, `editedBlocks`, `fieldOn`, `schemaOn`, `adhocInjuries`. All of it is lost on reload or navigation. A user who tunes a favorite configuration — say "Powerbuilder + Physique, goals/equipment/injuries on, schema on, RP block reworded" — has to rebuild it by hand every session. This is friction between intent and logging (PRODUCT.md: "No friction between intent and logging") and it makes the builder feel like a toy rather than an instrument the user owns.

## Design overview

Add **prompt presets**: a named, saved snapshot of the builder's *durable* configuration, persisted in IndexedDB, restorable with one tap, and carried in backups. Presets are quiet and local-first — no cloud, consistent with the rest of the app.

A preset captures the four durable dimensions of builder state:

- `personaIds` — which coach personas are selected
- `editedBlocks` — persona block text the user actually edited (diffed against defaults; see Data model)
- `fieldOn` — which profile/constraint field toggles are on
- `schemaOn` — whether the output-schema block is included

Ad-hoc injuries (`adhocInjuries`) are **excluded by design** — they are session-scoped "this prompt only" data (the UI already labels them "ephemeral", `PromptBuilderClient.tsx` line 213). They are never written to a preset and never touched on load.

## Data model

New document type in `src/lib/programs/types.ts`, placed directly after `BackupDocument` (lines 214–223). This is the correct home: it is the file every persisted document type lives in (`ProgramDocument`, `WorkoutLogDocument`, `BodyweightEntry`, `BackupDocument`), and it already defines `ID` and `ISODate`. The prompt-builder-specific types (`CoachPersona`, `ProfileField`) live under `src/lib/prompts/`, but those are content/config, not persisted records — persisted records belong with the other documents.

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

`editedBlocks` invariant: it stores **only** personas whose block text the user actually changed. At save time each entry in the live `editedBlocks` state is compared against the *current* `DEFAULT_PERSONAS[id].block`; an entry is kept only if the persona still exists in `DEFAULT_PERSONAS` and its text differs. This matters because the live `editedBlocks` state can hold `editedBlocks[p.id] = p.block` verbatim after the user focuses/blurs the textarea without changing anything (the textarea is controlled by `editedBlocks[p.id] ?? p.block`, `PromptBuilderClient.tsx` line 149; typing writes the current value on every change). Storing verbatim-equal blocks would freeze a persona to a stale copy of a default that later improves. Diffing keeps a preset minimal and lets unedited personas track future default edits (see Staleness semantics).

`id` is generated with `crypto.randomUUID()` (matches `programRepo.duplicate`, `programRepo.ts` line 73). `createdAt`/`updatedAt` are `new Date().toISOString()`.

## Storage & migration

### Object store

New `promptPresets` store, `keyPath: "id"`. Add to the `TrainerDb` schema interface in `appDb.ts` (alongside the existing stores, lines 9–44):

```ts
promptPresets: {
  key: string;
  value: PromptPresetDocument;
};
```

Import `PromptPresetDocument` into the existing type-import on `appDb.ts` line 3.

### Migration: DB_VERSION 8 → 9

Bump `DB_VERSION` to `9` (`appDb.ts` line 7). Add a create-store-only branch to `upgrade`, following the exact style of the v2/v3/v4 branches (guarded `contains` check, no data touched):

```ts
// v8 → v9: add promptPresets store. Create-only; no existing data to migrate.
if (oldVersion < 9) {
  if (!db.objectStoreNames.contains("promptPresets")) {
    db.createObjectStore("promptPresets", { keyPath: "id" });
  }
}
```

### Repo

New `src/lib/storage/promptPresetRepo.ts`, following `bodyweightRepo.ts` (thin) plus the `save` timestamp stamping from `programRepo.ts`:

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

`save` is an upsert (`put` keyed on `id`), consistent with every other repo. List order is IndexedDB key order; the UI sorts for display (see UI behavior).

## Backup round-trip

`BackupDocument` (`types.ts` lines 214–223) gains one optional field:

```ts
promptPresets?: PromptPresetDocument[];
```

Optional, so every existing backup JSON (which lacks the key) still validates — same pattern already used for `userExercises` and `bodyweight`.

**Export** — `exportBackup()` in `src/lib/backup/backup.ts` (lines 22–33): add `promptPresets: await promptPresetRepo.list(),` to the returned object, and import `promptPresetRepo` at the top.

**Import** — `restoreBackup()` in the same file (lines 35–108):
1. Add optional-field validation mirroring the `bodyweight` block (lines 78–85): if `doc["promptPresets"] !== undefined`, require `isArrayOfObjects` and `hasIds`.
2. Add `"promptPresets"` to the transaction store list (line 91).
3. `tx.objectStore("promptPresets").clear();` (with the other clears, lines 93–98).
4. `for (const p of b.promptPresets ?? []) tx.objectStore("promptPresets").put(p);` (with the other put loops, lines 100–105).

The `?? []` guard means an old backup with no `promptPresets` field restores cleanly, leaving the store empty. Restore remains atomic (single multi-store transaction).

Note: `resetWorkspace()` deletes the whole database by name, so it needs no change — the new store disappears with the DB.

## UI behavior

A new compact **Presets** section in `PromptBuilderClient.tsx`, rendered as the first `<section>` inside the `stack` (immediately after the no-profile alert, before "Coach personas"). Presets act on the whole builder, so they read first. Quiet register per DESIGN.md: hairline-bordered `panel` rows, label-type header (`tx-up`), no modal, no motion beyond the standard 100–120ms control transitions.

State added to the component:
- `const [presets, setPresets] = useState<PromptPresetDocument[]>([])` — loaded once via `promptPresetRepo.list()` in a `useEffect` on mount, sorted by `updatedAt` descending for display.
- `const [presetName, setPresetName] = useState("")` — the inline save input.

### Structure

- Header: `Presets` (`tx-up`).
- List: one row per saved preset. Each row is a `panel` with the preset name as a text button (tapping loads it) and a small ghost delete affordance (`×`, `aria-label={`Delete ${name}`}`), styled like the ad-hoc-injury remove button (`PromptBuilderClient.tsx` lines 223–230). Empty list renders nothing (quiet by default — no empty-state chrome).
- Save affordance: an inline text input (`placeholder="Name this preset…"`) plus a `Save` button, styled like the ad-hoc injury add row (lines 234–246). No modal.

### Save (create — no update-in-place)

`Save` is disabled when `presetName.trim()` is empty. On click it builds a `PromptPresetDocument` from **current live state** and persists it:

```
name        = presetName.trim()
personaIds  = [...selectedIds]
editedBlocks= diff of live editedBlocks vs DEFAULT_PERSONAS (see Data model invariant)
fieldOn     = { ...fieldOn }          // snapshot of the toggle map
schemaOn    = schemaOn
id          = crypto.randomUUID()     // fresh id every save
createdAt/updatedAt stamped by the repo
```

**Every save creates a new preset** (fresh `id`). This is the simplest correct behavior: no "is this the loaded one?" tracking, no diff-against-loaded logic, and `promptPresetRepo.save` (a `put`) never collides because the id is new. Duplicate names are permitted (rows are identified by `id`, not name); the delete affordance is how the user prunes. After a successful save, refresh `presets` from the repo and clear `presetName`.

The `editedBlocks` diff is computed at save time:

```ts
const editedBlocks: Record<string, string> = {};
for (const [id, text] of Object.entries(liveEditedBlocks)) {
  const def = DEFAULT_PERSONAS.find((p) => p.id === id);
  if (def && text !== def.block) editedBlocks[id] = text;
}
```

### Load (tap a preset name)

Loading **overwrites** the durable builder state and leaves ad-hoc state alone. Precise assignments:

- `setSelectedIds(preset.personaIds.filter((id) => DEFAULT_PERSONAS.some((p) => p.id === id)))`
  Persona ids no longer in `DEFAULT_PERSONAS` are dropped silently.
- `setEditedBlocks(Object.fromEntries(Object.entries(preset.editedBlocks).filter(([id]) => DEFAULT_PERSONAS.some((p) => p.id === id))))`
  Edited blocks for removed personas are dropped. (No merge with prior edits — load replaces the whole map.)
- `setFieldOn(next)` where `next` is built fresh from the *current* `PROFILE_FIELDS`, each key defaulting to `true`, then overridden by `preset.fieldOn[key]` when that key exists in the preset:
  ```ts
  const next = Object.fromEntries(
    PROFILE_FIELDS.map((f) => [f.key, preset.fieldOn[f.key] ?? true]),
  );
  ```
  This makes fields added after the preset was saved default on (matching a fresh builder, `PromptBuilderClient.tsx` lines 22–24), and drops any `fieldOn` key unknown to the current `PROFILE_FIELDS`.
- `setSchemaOn(preset.schemaOn)`.
- `adhocInjuries` and `adhocInput`: **not touched**.

The generated-prompt `useMemo` recomputes from these on the next render, so the preview and copy button update automatically; no extra wiring.

### Delete (tap `×` on a row)

`await promptPresetRepo.remove(preset.id)`, then refresh `presets`. No confirm dialog (single-tap reversible-by-re-save action, quiet register). Deleting a preset never alters the currently loaded builder state.

## Staleness semantics

Presets store a diff, not a frozen copy of the whole builder, so they age gracefully as the app's defaults and field set evolve:

1. **Unedited personas always render the current default.** The builder's textarea and prompt assembly use `editedBlocks[p.id] ?? p.block` (`PromptBuilderClient.tsx` lines 66, 149). A preset only writes `editedBlocks` entries for personas the user actually edited, so any persona the user left alone falls through to the *current* `DEFAULT_PERSONAS` block after loading. Improving a default block benefits every preset that didn't override it.
2. **An edited persona's snapshot wins.** If the preset holds an `editedBlocks[id]`, that saved text is loaded and shown, overriding the current default for that persona — the user's deliberate wording is preserved.
3. **A persona id no longer in `DEFAULT_PERSONAS` is skipped silently on load** — filtered out of both `selectedIds` and `editedBlocks` (see Load). No error, no placeholder row.
4. **`fieldOn` keys unknown to the current `PROFILE_FIELDS` are ignored** on load (the `next` map is built from `PROFILE_FIELDS`, so unknown preset keys are never read). Newly added fields default on.

Net effect: an old preset loads into today's builder without crashing or resurrecting deleted content, while still honoring the specific edits and toggles the user chose to save.

## Test plan

The codebase tests repos (`bodyweightRepo.test.ts`), migrations (`appDb.test.ts`), and components (`PromptBuilderClient.test.tsx`), so all three layers get coverage.

### Repo tests — `src/lib/storage/promptPresetRepo.test.ts` (new)

Follow `bodyweightRepo.test.ts` (import `fake-indexeddb/auto`, `deleteDB(DB_NAME)` in `beforeEach`, `resetDbConnection` in `afterEach`):
- `save` then `list` returns the preset.
- `save` twice with the same `id` overwrites (single row) — proves `put`/upsert.
- Two saves with different ids yield two rows even with identical `name` — proves rows are id-keyed and duplicate names coexist.
- `save` stamps `createdAt` on first write and preserves it while advancing `updatedAt` on re-save (assert `createdAt` unchanged, `updatedAt` changes).
- `remove` deletes a single preset by id.

### Migration + backup tests — add to `src/lib/storage/appDb.test.ts`

New `describe("DB v9 — promptPresets store")`, following the `DB v8` block (lines 270–331), with a `seedV8()` helper (openDB at version 8 creating all v1–v8 stores; copy the store set from `seedV7` — none of v5–v8 add stores, so the store list is identical):
- v9 upgrade creates the `promptPresets` store and preserves pre-existing data in other stores (seed a program in the v8 DB, open via `getDb()`, assert the program still lists and `db.objectStoreNames.contains("promptPresets")`).

Extend the existing export/restore `describe("IndexedDB repositories")` block:
- `exportBackup` includes saved presets; round-trip through `restoreBackup` restores them (mirror the `userExercises` round-trip test, lines 32–64).
- Restoring a backup with `promptPresets: undefined` succeeds and leaves the store empty (mirror the backward-compat tests at lines 66–79 and 178–189).

### Component tests — add to `src/components/prompts/PromptBuilderClient.test.tsx`

The existing test mocks `@/components/app/LocalDataProvider` and never touches IndexedDB. Add `jest.mock("@/lib/storage/promptPresetRepo", ...)` with an in-memory array backing `list`/`save`/`remove` so the component's mount effect and handlers resolve without a real DB. New `describe("PromptBuilderClient presets")`:
- **Save creates a preset:** select a second persona, edit its block, type a name, click `Save` → the row appears; assert `promptPresetRepo.save` was called with `personaIds` including the selection and `editedBlocks` containing only the edited persona (diff invariant).
- **editedBlocks diff excludes verbatim-default text:** focus a persona textarea without changing it (or set it to its default), save → the saved `editedBlocks` omits that persona.
- **Load overwrites selections/toggles:** with a preset present (seed the mock), tap its name → assert the prompt preview reflects the preset's personas and toggles, and a previously-selected-but-not-in-preset persona is deselected.
- **Load leaves ad-hoc injuries alone:** add a temporary injury, load a preset → `- <injury>` still appears in the constraints block.
- **Staleness — unknown persona id skipped:** seed a preset whose `personaIds` contains a bogus id → load does not throw and only valid personas render.

## Out of scope

- Update-in-place / "overwrite this preset" UX — every save creates a new preset; pruning is via delete.
- Rename of an existing preset.
- Reordering, folders, tags, or search over presets.
- Persisting ad-hoc injuries or `adhocInput` (excluded by design).
- Auto-saving the last-used builder state as an implicit preset, or restoring builder state on reload without an explicit load.
- Export/import of a single preset as a standalone file (presets travel only inside the full workspace backup).
- Sharing presets between devices or any networked sync (local-first; out of scope permanently).
- Confirm dialogs or undo for delete.
