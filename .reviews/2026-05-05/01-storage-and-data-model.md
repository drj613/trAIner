# Code Review: Storage and Program Data Model Layer

Reviewer: architecture-reliability-reviewer  
Date: 2026-05-05  
Scope: `src/lib/storage/`, `src/lib/programs/`, `src/lib/workspace/`

## Summary

The layer is reasonably small, well-typed, and tested in spirit (good unit coverage for pure functions). However, it has several **structural reliability problems** that will become harder to fix as the app grows: a half-implemented override system that doesn't actually meet the PRD's scope contract, multiple non-atomic write sequences that can leave the database in inconsistent states, and an IndexedDB schema/migration story that quietly assumes "we will never deploy a v1 user."

Severity legend: **Critical** = data loss / silent corruption / PRD contract broken. **High** = degraded behavior under realistic conditions. **Medium** = bug in edge cases or operator pain. **Low** = style/maintainability.

---

## 1. Override System Integrity

### [Critical] Week-scoped overrides are silently ignored when `replacement` is a single `ProgramDay`
File: `src/lib/programs/overrides.ts:8-15`

The type allows `replacement: ProgramDay | ProgramDay[]`. If a caller stores a week override with a single `ProgramDay`, only the day whose `dayNumber` matches gets replaced; every other day in the week silently passes through unchanged. A typical "swap entire week 2 for a deload week" use case requires an array. There's no validation, no schema-time check, and no test guarding it.

**Fix:** Tighten the discriminated union — `{ scope: "week"; replacement: ProgramDay[] } | { scope: "day"; replacement: ProgramDay }` — and remove the `Array.isArray` runtime branch.

### [Critical] Override layering order does not match the PRD's scope semantics
File: `src/lib/programs/overrides.ts:3-5`

Overrides are applied in **insertion order**, not by scope precedence. A day-scoped override followed by a week-scoped override targeting the same day will have the week override clobber the day override. The PRD specifies "base + week + day" — day should always win over week.

**Fix:** Sort overrides into two passes — apply all `week` first, then all `day`. Add an explicit accumulation test that mixes a week override and a day override targeting the same `(weekNumber, dayId)`.

### [High] Day override loses the original `id` when `replacement` is taken at face value
File: `src/lib/programs/overrides.ts:17-19`

Whatever `replacement.id` is becomes the new day id. If a stored override has a stale or different id, callers that index by day id (e.g., `logRepo.listForDay(dayId)`) will silently lookup against the wrong key.

**Fix:** `return day.id === override.dayId ? { ...replacements[0], id: day.id, dayNumber: day.dayNumber, weekNumber: day.weekNumber } : day;`

### [Medium] No "base" override path even though the PRD asks for it
File: `src/lib/programs/types.ts:100-109`

`ProgramOverride.scope` is `Exclude<ProgramScope, "base">`. Either the "base" scope is intentionally edited via `ProgramDocument.days` directly (needs documentation), or it's a missing capability.

### [Medium] `program.days` returned directly when no overrides present
File: `src/lib/programs/overrides.ts:3`

`getRenderableDays` returns `program.days` directly when `overrides` is empty. Callers may mutate the result and corrupt the saved program in memory. Consider always returning a shallow-copied array.

---

## 2. IndexedDB Usage / Persistence

### [Critical] `programRepo.activate` is non-atomic, can leave two programs both active
File: `src/lib/storage/programRepo.ts:30-49`

Each `this.save` call opens its own IDB write transaction. If the page closes mid-flight, two programs can both have `active: true`.

**Fix:** Use a single `db.transaction("programs", "readwrite")` and iterate inside it.

### [Critical] `restoreBackup` writes to multiple stores via separate transactions; partial restore is possible
File: `src/lib/backup/backup.ts:24-35`

A failure halfway (quota exceeded, tab close) leaves the workspace in a half-restored state. The PRD requires "full workspace export/import must work."

**Fix:** Wrap restore in a single multi-store transaction. Also decide: restore = additive merge or replace? Current behavior is "merge with overwrite" which most users won't expect.

### [High] `programRepo.save` uses `||` for `createdAt`
File: `src/lib/storage/programRepo.ts:21-23`

`createdAt: program.createdAt || now` — `""` (empty string from malformed import) silently becomes "now." Use `??` or explicit length check.

### [High] `aliasRepo.save` collapses two distinct aliases that normalize to the same string
File: `src/lib/storage/aliasRepo.ts:14-22`

`id` is set to `normalizedAlias`. Two saves of "Strict Pull-up" and "strict-pullup" both produce id `"strict pullup"` and the second `put` silently overwrites the first with a possibly different `canonicalExerciseId`.

### [High] DB schema bumped to v2 with no upgrade path between v1 and v2
File: `src/lib/storage/appDb.ts:6, 42-71`

`upgrade` only contains "create if not exists" guards. `oldVersion` is never used. Future schema changes (renaming an index, fixing alias schema) can't be migrated correctly.

**Fix:** Use `oldVersion`/`newVersion` parameters and structure migrations as discrete blocks per version.

### [High] No error handling on `getDb()` failures or quota errors
Throughout the storage layer. A single quota failure on an export becomes a silent data-loss event.

### [High] `resetDbConnection` doesn't await `close()`, races with concurrent operations
File: `src/lib/storage/appDb.ts:81-85`

Any outstanding `getDb().then(db => db.put(...))` continues against the old db reference after reset.

---

## 3. Type Safety Gaps

### [Medium] `BackupDocument` storage type drifts from runtime shape
Two backups exported with the same ISO timestamp silently overwrite each other. `stats.ts:27` exploits `b.id.localeCompare(a.id)` — any change to id derivation breaks `stats.lastSnapshotAt`.

**Fix:** Use `crypto.randomUUID()` for id; add explicit `exportedAt` index.

### [Medium] `ProfileDocument.id: "local-profile"` is a literal type but `profileRepo.save` overrides whatever the caller passed
The defense is good but the type contract is misleading. Consider `Omit<ProfileDocument, "id" | "updatedAt">` for the parameter.

### [Medium] `ProgramDocument.import.rawJson: unknown` survives across export → restore unchecked
Non-JSON-clonable objects silently become `null`/missing on restore.

### [Medium] `effectiveWeekNumber` and `programDaysPerWeek` disagree about the default for `weekNumber: 0`

### [Low] `normalizeSectionType` fallback to `"training"` is ambiguous with the legitimate `"training"` type

---

## 4. PRD Alignment

- Override types support week and day. No base override needed if base lives in `program.days`, but this should be documented.
- Override renderer does not enforce scope layering order (Critical 1.2).
- Override renderer has latent bug for week-scoped single-day replacements (Critical 1.1).
- No validation that day overrides target days that exist in `program.days`.

---

## 5. Test Coverage Gaps

| Area | Gap |
|---|---|
| `getRenderableDays` week scope | Zero tests |
| Override scope precedence (week + day same day) | Zero tests |
| `programRepo.activate` atomicity | Happy-path only |
| `restoreBackup` partial failure | Zero tests |
| `aliasRepo.save` collision | Zero tests |
| DB migration v1 → v2 | Zero tests |
| `exportBackup` round-trip with exotic `rawJson` values | Zero tests |

---

## 6. Naming / Structure Concerns

- **[Medium]** Two notions of "active program": `ProgramDocument.active: boolean` and `ProgramDocument.status?: "active" | "draft" | "archived"` — collapse to one source of truth.
- **[Low]** `routineMeta.ts` should be renamed `programMeta.ts` or folded into `domain.ts`.
- **[Low]** `BackupDocument.version: 1` has no migration plan — every backup from v1 users breaks when v2 ships.

---

## Recommended Priority Order

1. Make `restoreBackup` and `programRepo.activate` use single multi-store transactions.
2. Tighten `ProgramOverride.replacement` to a discriminated union; add week-scope tests; enforce layering precedence.
3. Add `oldVersion`-aware migration logic in `appDb.ts` before any v3 work.
4. Resolve `active` vs `status` duality on `ProgramDocument`.
5. Decide and document `restoreBackup` semantics: replace vs merge.
6. Add validation on override save against current `program.days`.
