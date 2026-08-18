# Exercise Catalogue Normalization and Movement-Family History Design

**Date:** 2026-08-18  
**Status:** Approved in conversation; awaiting written-spec review  
**Branch:** `plan/exercise-normalization`

## Goal

Normalize and deduplicate the generated exercise catalogue, represent each concrete exercise as a version of a primary movement with zero or more canonical modifiers, nest versions beneath their primary movement in catalogue-selection surfaces, and show combined movement-family history while keeping performance metrics separate by concrete version.

## Current State

The application ships a generated, flat catalogue of 3,072 exercises assembled from multiple sources. Catalogue entries have a concrete `id`, name, aliases, equipment, movement-pattern strings, muscles, and general tags. Source data contains duplicates, inconsistent casing and punctuation, uneven metadata, and misleading broad tags such as `strength` in fields that do not reliably identify a primary movement.

Programs and workout logs already preserve a concrete `canonicalExerciseId` when import matching succeeds. All-time history groups entries by `canonicalExerciseId ?? exerciseId`; the Today history drawer prefers a canonical-ID match and falls back to the routine slot ID. Neither surface understands a broader movement family. Existing `ProgramExercise.tags.modifiers` values are LLM-supplied analysis tags and affect volume-role logic; they are not stable identity metadata.

The import flow can persist aliases and can apply path-specific resolutions, but repeated unresolved names are still presented per occurrence. The prompt builder emits exercise names and analysis tags. It does not and should not own catalogue identity.

## Chosen Approach

Keep each concrete exercise's existing catalogue identity and add a normalization layer above it. A concrete catalogue entry receives a primary movement and zero or more canonical movement modifiers. Runtime code resolves legacy IDs, catalogue IDs, custom exercises, and legacy names into a common normalized identity.

This approach preserves current program and log references, allows metrics to remain specific to the performed version, and makes movement-family grouping a derived capability. It avoids replacing every stored exercise with a `{ movementId, modifiers }` tuple and avoids brittle history-time parsing of display names.

Catalogue cleanup and movement-family modeling are one staged pipeline because deduplicated concrete identities must be stable before family metadata is assigned.

## Domain Model

### Catalogue entries

The generated catalogue entry gains app-owned identity metadata:

```ts
export type ExerciseCatalogItem = {
  id: string;
  name: string;
  aliases: string[];
  equipment: string[];
  movementPatterns: string[];
  muscles: {
    primary: string[];
    secondary: string[];
  };
  tags: string[];
  movementId: string;
  movementName: string;
  movementModifierIds: string[];
};
```

`id` continues to identify a concrete version. `movementId` identifies the history/navigation parent. `movementModifierIds` is an ordered, flat canonical list used to describe that version, for example:

```ts
{
  id: "barbell-high-bar-squat",
  name: "High Bar Back Squat",
  movementId: "squat",
  movementName: "Squat",
  movementModifierIds: ["barbell", "back-rack", "high-bar"]
}
```

The name `movementModifierIds` deliberately distinguishes identity metadata from `ProgramExercise.tags.modifiers`. Existing analysis tags retain their current schema and behavior.

### Normalized runtime identity

A single resolver returns a discriminated result containing:

- The surviving concrete catalogue ID when known.
- The primary movement ID and label.
- Ordered canonical movement modifiers and their labels.
- A display label for the concrete version.
- The resolution source: direct catalogue ID, temporary redirect, user override, saved alias, high-confidence legacy-name match, or standalone fallback.
- Whether the input is exact, underspecified, unmatched, or overridden.

All consumers use this resolver rather than independently parsing names or following redirects.

### Global corrections

A new IndexedDB store holds global normalization overrides for both bundled and custom exercises. An override is keyed by the exercise's stable ID and supplies a replacement `movementId` and ordered `movementModifierIds`. Overrides layer over generated defaults and are included in backup export and restore.

Saving a correction immediately changes catalogue nesting and history grouping. It does not rewrite workout sets, notes, dates, or performed-exercise labels.

## Catalogue Build Pipeline

The catalogue builder becomes a deterministic sequence:

```text
source records
  -> field normalization
  -> deterministic deduplication
  -> reviewed merge and family overrides
  -> canonical exercise catalogue
  -> temporary legacy-ID redirects
  -> import-disambiguation table
  -> unresolved near-duplicate report
```

### Field normalization

Normalize whitespace, punctuation variants, casing, aliases, equipment labels, and other source-specific representation differences before comparing records. Preserve user-facing canonical labels selected by precedence rules rather than forcing every display name to machine casing.

### Deduplication

Automatically merge only exact or high-confidence duplicates. Prefer curated records as the surviving base, then combine reviewed aliases, equipment, muscles, movement patterns, and tags without duplicating values. Similar-but-mechanically-distinct exercises must remain separate.

Ambiguous duplicate candidates are handled through an explicit reviewed merge map. Fuzzy similarity can produce the review report but cannot merge entries by itself. Composite movements such as squat rows must not join ordinary squat history merely because their names contain `squat`.

### Primary movements and modifiers

Assign family and modifier metadata only after concrete entries are deduplicated. Deterministic inference may propose mappings, but reviewed overrides are authoritative. Catalogue entries whose family cannot be assigned safely remain standalone rather than being forced into a misleading family. The generated review report makes these cases visible for later curation.

Modifier identity uses a flat canonical vocabulary in this release. Synonyms normalize to one modifier ID; typed modifier categories are out of scope.

### Build validation

Catalogue generation must fail before writing outputs when it encounters:

- Duplicate surviving concrete IDs.
- Conflicting explicit merge rules.
- Redirect cycles or redirects with missing targets.
- Invalid primary movement or modifier references.
- One removed ID mapped to multiple survivors.
- Unstable ordering or nondeterministic generated output.

Unresolved near-duplicates are reported but do not fail the build.

## Temporary Legacy-ID Compatibility

Every removed concrete ID maps to its surviving concrete ID during the migration window. Runtime resolution and backup restore use the same generated table.

The redirect implementation must contain this exact dated note:

```ts
// TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.
```

Removal is a deliberate code change, not an automatic date-triggered runtime failure. By September 30, 2026, active local databases should already contain rewritten surviving IDs. Backups restored during the window are normalized during restore. Compatibility with pre-migration backups restored after the redirect table is removed is not guaranteed.

## Existing-User Backfill

### IndexedDB migration

A new database migration atomically and idempotently rewrites known removed IDs in:

- Routine exercises, including rendered week variants and override replacements stored in program documents.
- Workout-log entries.
- Saved alias targets.
- Exercise metrics.

The migration preserves workout sets, raw cells, notes, dates, completion state, routine-slot IDs, and stored `exerciseName` values. When duplicate metric keys collapse, derived metrics are rebuilt from the normalized workout logs rather than combined heuristically.

Bundled catalogue metadata is not copied into every routine or log. A surviving `canonicalExerciseId` receives movement-family metadata by resolving against the current bundled catalogue.

### Legacy records without a canonical ID

Use the existing name/alias matcher through the new normalized resolver:

- Exact or high-confidence unambiguous matches normalize automatically.
- Underspecified or ambiguous terms remain unresolved until import or review chooses a concrete version.
- Unknown terms remain visible as standalone exercises and enter a correction/review queue.

No migration silently discards or hides an unknown exercise.

### Backups

Backup export includes global normalization overrides. Restore validates and restores them and rewrites legacy IDs while the compatibility table exists. Backup and migration behavior use the same canonical redirect function so their results cannot diverge.

## Import Resolution

### Group repeated names

Unresolved and underspecified import items are grouped by normalized raw name. A routine containing eight occurrences of `back squat` across base days, exercise-level week variants, and override replacements presents one decision showing the occurrence count. One selection fans out to every grouped path.

The user can choose `resolve occurrences separately` when identical text intentionally refers to different concrete exercises.

### Underspecified names

A reviewed import-disambiguation table identifies names that match a family or generic version but omit an important concrete choice. For example:

```text
"Back squat" - used 8 times

Choose version:
- Back Squat - unspecified bar position
- Back Squat - High Bar
- Back Squat - Low Bar
```

The selected concrete ID applies only to the current import by default. An explicit `Remember this interpretation` action persists a global alias for future imports. Exact names such as `High Bar Back Squat` resolve automatically and do not require this choice.

The generic `Back Squat` remains a valid concrete version with `back-rack` but no bar-position modifier. High-bar and low-bar versions keep distinct concrete IDs and metrics.

### Prompt boundary

The prompt builder, emitted routine JSON schema, and prompt tests are unchanged. LLMs continue to provide names and the existing analysis tags. Catalogue identity, disambiguation, and specificity are handled entirely after parsing during import.

## Catalogue and Selection UI

The exercise library, add-exercise picker, and replace-exercise picker show one row per primary movement with concrete versions nested beneath it. Selecting a primary movement alone is not sufficient to add an exercise; the user selects a concrete version, including a generic/unspecified version when one exists.

Search indexes both levels. A family query such as `squat` returns the Squat family and relevant nested versions. A modifier query such as `high bar` reveals and highlights the matching version beneath its family. Standalone/unreviewed exercises remain searchable and selectable.

Catalogue detail exposes `Change primary movement/modifiers`. Saving is a global correction. The editor uses canonical movement and modifier choices but does not expose internal IDs as ordinary copy.

## History Behavior

### Shared aggregation boundary

Move family-aware history aggregation into shared workout-history utilities. Both all-time history and the Today drawer consume the same normalized session-row model. A row contains its concrete version ID and label in addition to date, sets, note, and volume.

### All-time history

The history index contains one item per primary movement plus standalone exercises that lack a safe family mapping. Opening a movement shows a combined chronological list of sessions for every concrete version. Each session clearly names its version, using movement modifiers when available and the stored exercise name as a fallback.

Replace the current all-time exercise-detail placeholder with the actual combined session table.

Performance summaries remain separate by concrete version:

- No family-wide PR.
- No family-wide best set.
- No family-wide volume trend.
- Each concrete version displays its own session count, best, last result, and trend.

Exact duplicates collapsed by catalogue deduplication share one concrete history. Mechanically distinct versions do not.

### Today history drawer

Opening history from any version loads recent sessions for its entire movement family. Every row identifies the concrete performed version. The currently selected version is visually emphasized, and a version filter can narrow the combined list without changing the default family-wide view.

The drawer and all-time history use the same identity fallback behavior, so an unresolved record remains visible and correctable on both surfaces.

## Error Handling

The runtime resolver never drops a session because identity metadata is absent. Missing catalogue entries, unknown legacy IDs, and unmatched names become standalone normalized results labeled from stored data. They are exposed for correction instead of throwing during history rendering.

Import distinguishes three outcomes:

- Exact/high-confidence concrete match.
- Underspecified match requiring one grouped choice.
- Unmatched name requiring catalogue search or custom handling.

Global override validation rejects nonexistent movement and modifier IDs before saving. Migration and restore failures abort their transaction rather than committing a partially normalized database.

## Testing Strategy

### Catalogue pipeline

- Normalize casing, whitespace, punctuation, aliases, and equipment deterministically.
- Merge exact duplicates while preserving combined reviewed metadata.
- Prefer curated entries as survivors.
- Keep similar-but-distinct and composite movements separate.
- Exercise explicit merge-map conflicts and ambiguous-report generation.
- Reject redirect cycles, missing targets, duplicate survivors, and invalid movement/modifier references.
- Snapshot stable catalogue, redirect, disambiguation, and duplicate-report outputs.

### Migration and backup

- Upgrade representative legacy IndexedDB fixtures containing programs, week variants, override replacements, logs, aliases, and metrics.
- Assert every known legacy ID is rewritten and every performance field remains unchanged.
- Assert unknown IDs remain visible and untouched.
- Rebuild derived metrics correctly after duplicate IDs converge.
- Run the migration twice and prove the second pass is a no-op.
- Round-trip normalization overrides through backup export/restore.
- Restore legacy IDs during the compatibility window.
- Verify already-normalized data remains valid when the redirect table is absent.

### Import

- Collapse repeated `back squat` occurrences into one choice with the correct count.
- Fan one choice across base days, exercise-level variants, and override replacements.
- Keep a choice import-local by default.
- Persist a global alias only through `Remember this interpretation`.
- Allow occurrence-level expansion through `resolve separately`.
- Bypass the choice for exact concrete names.
- Preserve existing name-guard behavior for base/variant resolution paths.

### History and UI

- Nest concrete versions under primary movements in library and picker surfaces.
- Find families and versions through search.
- Aggregate every version into family history while preserving explicit row labels.
- Keep metrics separated by concrete version.
- Default the Today drawer to combined family history, emphasize the active version, and filter by version.
- Apply global corrections immediately to existing history grouping.
- Keep standalone/unknown exercises visible and correctable.

### Quality gates

Run focused tests during each task, then the complete unit/integration suite, type checking, linting, production build, and targeted end-to-end exercise-import/history coverage before completion.

## Delivery Order

1. Define canonical movements, modifiers, reviewed merge rules, and build validations.
2. Generate the deduplicated catalogue, temporary redirects, disambiguation data, and review report.
3. Add the shared runtime normalization resolver and global override persistence.
4. Migrate existing IDs and update backup/restore.
5. Group and disambiguate repeated import names.
6. Nest catalogue and selection surfaces.
7. Implement shared family-history aggregation and both history presentations.
8. Run full migration, backup, import, history, UI, and quality-gate verification.

## Out of Scope

- Asking LLMs to emit movement or modifier IDs.
- Changing the prompt builder or routine JSON schema.
- Replacing all stored exercise references with `{ movementId, modifiers }` tuples.
- Combining PRs, best sets, or volume trends across concrete versions.
- Typed modifier categories in the first release.
- Automatically fuzzy-merging ambiguous exercises.
- Guaranteeing restoration of pre-migration backups after the September 30, 2026 compatibility removal.
