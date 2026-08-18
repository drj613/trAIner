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

### Catalogue entries and definition registries

Two checked-in registries are the label and ordering source of truth:

```ts
export type MovementDefinition = {
  id: string;
  name: string;
  aliases: string[];
  sortOrder: number;
  allowedModifierCategories: ModifierCategory[];
  allowedModifierIds: string[];
  maxIdentityModifiers: number;
  displayTemplate: string;
};

export type ModifierCategory =
  | "implement"
  | "grip"
  | "position"
  | "stance"
  | "support"
  | "range-of-motion"
  | "laterality"
  | "attachment"
  | "execution";

export type MovementModifierDefinition = {
  id: string;
  name: string;
  aliases: string[];
  category: ModifierCategory;
  exclusiveGroup?: string;
  identity: boolean;
  sortOrder: number;
  implies?: string[];
  excludes?: string[];
};
```

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
  movementId?: string;
  movementModifierIds: string[];
};
```

`id` continues to identify a concrete version. `movementId` identifies the history/navigation parent and resolves its label through `MovementDefinition`. `movementModifierIds` resolves labels and canonical display ordering through `MovementModifierDefinition`, for example:

```ts
{
  id: "barbell-high-bar-squat",
  name: "High Bar Back Squat",
  movementId: "squat",
  movementModifierIds: ["barbell", "back-rack", "high-bar"]
}
```

An entry without a safe movement assignment omits `movementId`, has no movement modifiers, and remains standalone. Bundled definitions are the only movement and modifier definitions in this release. A custom exercise may join an existing bundled movement, use existing bundled modifiers, or remain standalone. Creating user-defined movement families or modifier definitions is out of scope.

The name `movementModifierIds` deliberately distinguishes identity metadata from `ProgramExercise.tags.modifiers`. Existing analysis tags retain their current schema and behavior.

### Normalized runtime identity

A single resolver returns a discriminated result containing:

- The surviving concrete catalogue ID when known.
- The primary movement ID and label.
- Ordered canonical movement modifiers and their labels.
- A display label for the concrete version.
- The immutable performed name supplied by the stored log when one exists.
- The current catalogue version label, separately from the performed name.
- The resolution source: direct catalogue ID, temporary redirect, user override, saved alias, high-confidence legacy-name match, or standalone fallback.
- Whether the input is exact, underspecified, unmatched, or overridden.

All consumers use this resolver rather than independently parsing names or following redirects. Inputs are typed so a routine-slot ID can never be mistaken for a catalogue ID:

```ts
export type ExerciseIdentityInput =
  | { kind: "catalog-reference"; canonicalExerciseId: string }
  | {
      kind: "stored-exercise";
      canonicalExerciseId?: string;
      slotId: string;
      performedName?: string;
    }
  | { kind: "custom-exercise"; exerciseId: string; name: string }
  | { kind: "import-name"; name: string };
```

Only `catalog-reference.canonicalExerciseId` and the optional canonical field on `stored-exercise` enter direct catalogue-ID/redirect lookup. `slotId` is never compared with catalogue IDs or redirects; it is retained only as a final standalone grouping key. Direct-ID lookup compares the raw canonical input before name normalization, fixing the current failure to recognize hyphenated IDs as IDs.

Resolver precedence depends on the input kind:

1. A supplied canonical ID: exact current catalogue ID, then temporary legacy redirect.
2. A supplied custom-exercise ID: exact user exercise.
3. An import/stored name: saved user alias, reviewed underspecified-name rule, unique canonical name, unique catalogue alias, then unique custom-exercise name.
4. If no concrete exercise is identified, a matching `normalized-name` override may still return a family-classified identity with `concreteExerciseId: undefined`.
5. Otherwise return standalone/unmatched; stored exercises use `slotId` only for the standalone group key.

An `exercise-id` movement/modifier override applies after a bundled or custom concrete exercise is identified. A `normalized-name` override is deliberately reachable after name matching fails and before standalone fallback.

### Resolver integration and invalidation

The pure resolver accepts generated catalogue maps, movement/modifier registries, temporary redirects, saved aliases, user exercises, and normalization overrides as an explicit context. A shared `ExerciseNormalizationProvider` loads that context and exposes a versioned `useExerciseNormalization` hook.

All identity-affecting writes publish one `trainer-exercise-identity-changed` refresh signal after their transaction commits: normalization-override save/remove, alias save/remove, user-exercise save/remove, database migration completion, and backup restore. The provider responds by atomically reloading aliases, user exercises, and overrides and incrementing its context version. Bulk migration/restore publishes once after all stores commit. Catalogue, analysis, picker, and history selectors depend on that version and recompute without reloading logs or the page.

Implementation includes an inventory of every direct catalogue lookup. These consumers must migrate to the resolver or document that they intentionally require only an exact concrete catalogue record:

- Catalogue matching, import parsing, initial resolution, and saved-alias handling.
- Analysis muscle lookup and any analysis code resolving catalogue metadata.
- Library, add-exercise picker, and replace-exercise picker.
- Shared workout-history aggregation, all-time `HistoryClient`, and the Today drawer path in `WorkoutDayClient`.
- Migration and backup normalization.

No history or analysis surface may group by `canonicalExerciseId ?? exerciseId` directly after this work. Focused tests change an override after initial render and assert that analysis lookup, library nesting, all-time history, and Today history all observe the same new classification without reloading logs or the page.

### Global corrections

A new IndexedDB store holds global normalization overrides for bundled, custom, and name-only legacy exercises:

```ts
export type NormalizationOverrideDocument = {
  id: string; // exactly `${targetKind}:${normalizedTargetValue}`
  targetKind: "exercise-id" | "normalized-name";
  targetValue: string;
  movementId: string | null;
  movementModifierIds: string[];
  updatedAt: string;
};
```

An `exercise-id` target must identify a bundled or user-created exercise. A `normalized-name` target supports legacy history with no stable canonical ID. Target values are normalized before the deterministic ID is formed, and the object-store key path makes `(targetKind, targetValue)` unique. Save is an upsert for that target. Backup validation rejects duplicate or conflicting targets before opening the restore write transaction.

`movementId: null` explicitly clears a bad assignment and returns the target to standalone; null requires an empty modifier list. Mapping an unknown name to an existing concrete catalogue version uses a `remembered` alias instead of duplicating concrete identity in this override store.

Overrides layer over generated defaults and are included in backup export and restore. Save validation requires a valid target, a bundled movement, modifier IDs present in that movement's exact `allowedModifierIds`, canonical modifier order, complete implication closure, no exclusion conflicts, and compatibility with exclusive groups and the family maximum.

Saving a correction immediately changes catalogue nesting and history grouping. It does not rewrite workout sets, notes, dates, or performed-exercise labels. Historical rows continue to display their stored performed name; a separate current-family/version badge reflects the corrected classification. History consumers subscribe to normalization-override changes and recompute without requiring a page reload.

## Catalogue Build Pipeline

The current 3,072-entry generated catalogue is frozen as a checked-in `catalog-v1` input snapshot. Ordinary normalization builds do not fetch remote sources. The existing multi-source ingestion scripts remain optional tooling for a future deliberate refresh, but their output must become a newly reviewed snapshot before it can enter this pipeline.

`package.json` changes `catalog:build` to invoke only the offline snapshot compiler. The current live-fetch script is renamed/retargeted as `catalog:ingest-sources`; it writes only a staging candidate under `scripts/catalog-normalization/staging/` and is physically unable to overwrite `src/lib/catalog/*.generated.json`. Production build/CI runs an offline `catalog:check` that recompiles to a temporary directory and compares hashes with the committed generated outputs. The live ingestion command is never part of ordinary build, test, or CI scripts.

The catalogue compiler becomes a deterministic sequence:

```text
frozen catalog-v1 snapshot
  -> field normalization
  -> deterministic deduplication
  -> reviewed merge and family/signature assignment
  -> approved modifier-variant generation
  -> signature and ID collision validation
  -> alias classification
  -> canonical exercise catalogue
  -> temporary legacy-ID redirects
  -> import-disambiguation table
  -> unresolved near-duplicate and variant-coverage report
```

The checked-in curation inputs and audit artifacts have fixed paths:

- `scripts/catalog-normalization/catalog-v1.snapshot.json` — immutable copy of the current 3,072-entry catalogue.
- `scripts/catalog-normalization/catalog-v1.sha256` — expected snapshot digest; compilation fails on mismatch.
- `scripts/catalog-normalization/movements.json` — movement definitions and family constraints.
- `scripts/catalog-normalization/modifiers.json` — modifier definitions, aliases, categories, exclusive groups, implications, and exclusions.
- `scripts/catalog-normalization/merges.json` — cumulative concrete-ID merge manifest.
- `scripts/catalog-normalization/assignments.json` — reviewed existing-entry movement/signature assignments and metadata overrides.
- `scripts/catalog-normalization/alias-classifications.json` — unique, underspecified, and removed-noise outcomes for every collision.
- `scripts/catalog-normalization/disambiguations.json` — reviewed import-choice rules and non-identity phrase rules.
- `scripts/catalog-normalization/variant-rules.json` — the only variant rules eligible for compilation.
- `scripts/catalog-normalization/reviews/variant-candidates.json` — committed Luna max proposals and rationale.
- `scripts/catalog-normalization/reviews/variant-adversarial-review.json` — committed Luna max approve/reject/revise decisions and reasons.

The normalized compiler writes:

- `src/lib/catalog/exercises.generated.json`.
- `src/lib/catalog/movements.generated.json`.
- `src/lib/catalog/modifiers.generated.json`.
- `src/lib/catalog/legacyRedirects.generated.json`.
- `src/lib/catalog/importDisambiguations.generated.json`.
- `reports/catalog-normalization-report.json`.

Every input and output schema is versioned. The report records the input schema versions, snapshot hash, compiler version, candidate/review artifact hashes, output hashes, and per-stage counts. Ordinary builds consume these committed artifacts and perform no network access.

The concrete-ID merge manifest is cumulative and maps every removed ID directly to its final surviving ID. Chained mappings are flattened during validation. An entry cannot be removed without either a surviving concrete target or an explicit decision to retain it as standalone. The cumulative merge manifest remains as catalogue-build provenance after temporary runtime redirects expire.

### Field normalization

Normalize whitespace, punctuation variants, casing, aliases, equipment labels, and other source-specific representation differences before comparing records. Preserve user-facing canonical labels selected by precedence rules rather than forcing every display name to machine casing.

### Deduplication

Automatically merge only exact or high-confidence duplicates. Prefer curated records as the surviving base, then combine reviewed aliases, equipment, muscles, movement patterns, and tags without duplicating values. Similar-but-mechanically-distinct exercises must remain separate.

Ambiguous duplicate candidates are handled through the explicit reviewed merge manifest. Fuzzy similarity can produce the review report but cannot merge entries by itself. Composite movements such as squat rows must not join ordinary squat history merely because their names contain `squat`.

Every normalized canonical-name or alias token must compile to exactly one classified outcome: one concrete exercise, one reviewed underspecified-choice set, or removal as an incorrect/noisy alias. The currently observed alias collisions are finite curation work; the compiler cannot preserve first-match-wins behavior. A unique canonical-name match does not silently override a conflicting alias—the conflict still requires an explicit classification.

### Primary movements and modifiers

Assign family and modifier metadata only after concrete entries are deduplicated. Deterministic inference may propose mappings, but reviewed overrides are authoritative. Catalogue entries whose family cannot be assigned safely remain standalone rather than being forced into a misleading family. The generated review report makes these cases visible for later curation.

Runtime exercise identity remains the flat `movementModifierIds` list approved above. The compiler uses modifier categories, implications, exclusions, identity flags, and family allowlists to validate that list and prevent invalid combinations. Synonyms normalize to one modifier ID. Categories are build-time constraints, not a nested runtime storage model.

### Modifier-driven variant expansion

The initial normalization release adds no more than 300 reviewed concrete variants across these Tier-1 families:

- Squat.
- Bench press.
- Deadlift and hinge.
- Row.
- Pull-up and pulldown.
- Overhead and landmine press.
- Lunge and split squat.
- Push-up.
- Curl.
- Triceps extension and pushdown.
- Raise and fly.
- Loaded carry.

Front squat is a Squat-family version. `paused` is an allowed coarse identity modifier only in family rules that explicitly approve it. Numeric pause duration, numeric tempo, load, weighted/unweighted annotations, RPE/RIR, light/heavy, pain-free depth, deload, top-set/back-off instructions, distance, and alternative prescriptions such as `assisted or bodyweight` are not identity and never create separate concrete IDs.

Variant expansion uses approved positive rules, never a Cartesian product:

```ts
export type VariantRule = {
  id: string;
  movementId: string;
  movementModifierIds: string[];
  metadataFromExerciseId: string;
  metadataOverrides?: Partial<Pick<
    ExerciseCatalogItem,
    "equipment" | "movementPatterns" | "muscles" | "tags"
  >>;
  approvedAliases: string[];
  coverageTier: 1 | 2;
  status: "candidate" | "approved" | "rejected";
};
```

Every generated variant names an existing reviewed catalogue entry as its metadata base. The compiler copies equipment, movement patterns, muscles, and tags from that base, then applies explicit reviewed overrides. The base must belong to the same movement and be compatible with the generated implement/support modifiers. Empty metadata and blind inheritance across incompatible implements are build failures. The semantic review must verify every override that changes muscle emphasis, equipment, or movement classification because analysis consumes these fields directly.

The canonical signature is independent of display text:

```text
<movementId>|<modifier-id-1>|<modifier-id-2>|...
```

Modifier implications are expanded and IDs are placed in registry order before computing the signature. Existing catalogue IDs win: when an existing entry already has the signature, the rule attaches metadata and reviewed aliases to that entry instead of generating a duplicate. A genuinely new approved signature receives a deterministic ID such as `squat--barbell--back-rack--high-bar`. Later vocabulary or signature changes require an explicit merge/redirect rule.

Existing display names remain stable. New display names use the movement family's reviewed template rather than concatenating tokens mechanically. A generated alias must retain every identity-defining modifier; generic aliases such as `squat`, `bench press`, `row`, and `deadlift` become reviewed underspecified-choice rules rather than aliases on multiple versions.

The compiler enforces exclusive groups rather than assuming an entire category is mutually exclusive. For example, `back-rack` and `high-bar` may share a broad position category but belong to different exclusive groups, while `high-bar` and `low-bar` share one bar-height group. It rejects implication cycles, implication/exclusion conflicts after transitive closure, asymmetric exclusions, missing exclusive-group definitions, and any `identity: false` modifier in a signature. It also enforces canonical order, the family allowlist, the family maximum, uniqueness of signatures/IDs/display names, and the global 300-entry Tier-1 cap. Composite movements remain standalone unless an explicit ID-based family assignment says otherwise.

Catalogue curation has two semantic review passes in addition to compiler validation:

1. A Luna max subagent inspects the frozen snapshot, import fixtures, existing match tests, modifier registry, and movement rules, then proposes the complete Tier-1 candidate rule set and rationale.
2. A separate Luna max adversarial review rejects nonsensical, redundant, prescription-only, misleadingly named, or mechanically inconsistent candidates and verifies representative coverage across all 12 families.

Only rules marked `approved` after both passes can be compiled into the canonical catalogue. The generated coverage report lists proposed, approved, rejected, colliding, and unresolved variants by family and rule, allowing a human spot-check before the normalized catalogue is accepted.

### Build validation

Catalogue generation must fail before writing outputs when it encounters:

- Duplicate surviving concrete IDs.
- Conflicting explicit merge rules.
- Redirect cycles or redirects with missing targets.
- Invalid primary movement or modifier references.
- One removed ID mapped to multiple survivors.
- An unclassified normalized canonical-name or alias collision.
- A merge chain that is not flattened to a current survivor.
- A candidate or rejected variant entering canonical output.
- A modifier combination that violates category exclusivity, implication, exclusion, family allowlist, canonical order, or family maximum rules.
- An implication cycle, asymmetric exclusion, closure conflict, undefined exclusive group, or non-identity modifier in a signature.
- A generated variant with a missing/incompatible metadata base, empty required metadata, or unreviewed metadata conflict.
- More than 300 new approved Tier-1 variants.
- A generated alias that drops an identity-defining modifier.
- Unstable ordering or nondeterministic generated output.

Unresolved near-duplicates are reported but do not fail the build.

## Temporary Legacy-ID Compatibility

Every removed concrete ID maps to its surviving concrete ID during the migration window. Runtime resolution and backup restore use the same generated table.

The redirect implementation must contain this exact dated note:

```ts
// TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.
```

Removal is a deliberate code change, not an automatic date-triggered runtime failure. By September 30, 2026, the actively used local database is expected to contain rewritten surviving IDs. Backups restored during the window are normalized during restore. Compatibility with skipped application releases, databases that never ran the migration, or pre-migration backups restored after the redirect table is removed is explicitly not guaranteed. This is an accepted single-user tradeoff; no startup migration audit or long-term compatibility epoch is required.

The dated removal applies to the runtime redirect output and version-1 backup compatibility path. The checked-in merge manifest remains because it is the reproducible explanation of how the normalized catalogue was produced.

## Existing-User Backfill

### IndexedDB migration

A version-10 database migration atomically and idempotently rewrites only fields that are explicitly catalogue references:

- `ProgramExercise.canonicalExerciseId` throughout base days, expanded exercise-level week variants, and stored override replacements.
- `WorkoutLogEntry.canonicalExerciseId`.
- `AliasDocument.canonicalExerciseId`.
- `ImportWarning.suggestions[].exerciseId` in stored program import metadata.

It never rewrites `ProgramExercise.id` or `WorkoutLogEntry.exerciseId`; those are routine-slot identities used to connect a log entry to its programmed slot. It also leaves user-exercise IDs unchanged.

The migration preserves workout sets, raw cells, notes, dates, completion state, routine-slot IDs, and stored `exerciseName` values. The existing metrics store and repository have no production consumers, are omitted from backups, and are not user data. Version 10 deletes that object store and the unused repository instead of migrating or rebuilding it. Workout logs remain the sole history source of truth.

`AliasDocument` gains `provenance: "legacy-auto" | "remembered"`. Version 10 treats every pre-existing alias as `legacy-auto` because the old importer saved all resolutions automatically. It deletes a legacy alias when its normalized token is now an underspecified choice, an alias collision, or removed noise. It retains and redirects only legacy aliases whose token still has one unique concrete outcome. New aliases are created only by `Remember this interpretation` and use `remembered`. Backup version 2 preserves this provenance. This prevents an old automatically saved `bench press`, `front squat`, or similar alias from bypassing the new disambiguation flow.

Bundled catalogue metadata is not copied into every routine or log. A surviving `canonicalExerciseId` receives movement-family metadata by resolving against the current bundled catalogue.

### Legacy records without a canonical ID

Use the new normalized resolver for records without `canonicalExerciseId`:

- Unique direct-name or alias matches populate `canonicalExerciseId` on the program exercise or log entry during migration.
- Underspecified or ambiguous terms remain unresolved until import or review chooses a concrete version.
- Unknown terms remain visible as standalone exercises. A `Needs review` list is derived from unresolved programs and logs at read time rather than persisted as a second queue.

No migration silently discards or hides an unknown exercise.

### Backups

`BackupDocument` advances from version 1 to version 2 and adds `normalizationOverrides`. Export reads the new store. Restore accepts version 2, validates every override against bundled movement/modifier definitions, and restores it atomically with the other user stores. Version-1 backups are accepted and their legacy IDs are rewritten only while the temporary compatibility table exists; their aliases pass through the same `legacy-auto` classification/purge rules as the database migration, and absent overrides default to an empty list. An older client must reject a version-2 backup as unsupported rather than silently discard its new field.

Backup and database migration use the same canonical redirect function so their results cannot diverge. After the September 30 removal, version-1 backup compatibility is not guaranteed as stated above.

## Import Resolution

### Typed match and resolution records

The catalogue matcher returns:

```ts
export type MatchResult =
  | { kind: "matched"; item: ExerciseCatalogItem; via: MatchVia }
  | {
      kind: "underspecified";
      movementId: string;
      candidates: ExerciseSuggestion[];
      matchedModifierIds: string[];
      nonIdentityAnnotations: string[];
    }
  | {
      kind: "unmatched";
      suggestions: ExerciseSuggestion[];
      nonIdentityAnnotations: string[];
    };

export type ResolutionOccurrence = {
  path: string;
  rawName: string;
  kind: "underspecified" | "unmatched";
  candidates: ExerciseSuggestion[];
};

export type ResolutionGroup = {
  groupKey: string;
  normalizedRawName: string;
  kind: "underspecified" | "unmatched";
  occurrences: ResolutionOccurrence[];
  occurrenceCount: number;
  remember: boolean;
};
```

Persisted `ImportWarning` records gain an optional resolution discriminator, candidate IDs, matched modifier IDs, and non-identity annotations so an imported program can be reviewed after reload. Old warnings without these fields remain valid. `ResolutionGroup` is derived from warnings for the UI; occurrence paths remain the patching authority.

Reviewed phrase rules in `disambiguations.json` separate identity from prescription text while preserving the original exercise name in the program and log. Deterministic rules remove `weighted`, `competition`, load/RPE wording, pain-free-depth wording, and similar approved non-identity annotations from the match query. A numeric pause such as `2-second paused` canonicalizes to the one coarse `paused` identity plus a non-identity duration annotation. Alternative prescriptions containing `or`, such as `assisted or bodyweight neutral-grip pull-up`, return an underspecified/unmatched choice rather than being stripped into one silent match.

Fuzzy similarity remains suggestion-only. `buildInitialResolutions` cannot auto-select an underspecified set or finalize a fuzzy suggestion solely because it exceeds the old `0.65` threshold.

### Group repeated names

The importer uses a tri-state concrete match result: `matched`, `underspecified`, or `unmatched`. A saved user alias is checked before a reviewed underspecified-name rule; therefore `Remember this interpretation` can intentionally suppress the choice on later imports. When an underspecified rule applies, parsing leaves `canonicalExerciseId` unset and emits a typed resolution item even if a generic concrete catalogue entry has the same name. This makes the choice reachable instead of letting the current exact-alias matcher finalize it first.

Unmatched and underspecified import items are grouped by normalized raw name and resolution kind. A routine containing eight occurrences of `back squat` across base days, supported exercise-level week variants, and override replacement exercises presents one decision showing the count of stored exercise occurrences. One selection fans out to every grouped path through the existing raw-name guards.

The user can choose `resolve occurrences separately` when identical text intentionally refers to different concrete exercises. Existing duplicate-day/path ambiguity safeguards remain authoritative: grouping cannot bypass them, and an import with structurally ambiguous paths cannot finalize those resolutions until the structural ambiguity is corrected. Exercise-level variants nested inside an override replacement remain unsupported and ignored with their existing structural warning; they are not counted or promised as fan-out targets.

### Underspecified names

A reviewed import-disambiguation table identifies names that match a family or generic version but omit an important concrete choice. For example:

```text
"Back squat" - used 8 times

Choose version:
- Back Squat - unspecified bar position
- Back Squat - High Bar
- Back Squat - Low Bar
```

The selected concrete ID applies only to the current import by default. `applyResolutions` may populate the still-empty `canonicalExerciseId` on underspecified items. Import save persists no alias for an ordinary grouped or occurrence-level selection. An explicit `Remember this interpretation` action marks that resolution group for alias persistence, and only marked groups are passed to alias saving.

Remembered aliases cannot be ambiguous. If occurrence-level resolution maps one normalized raw name to multiple concrete IDs, `Remember` is disabled for those occurrences and the existing conflict-dropping deduplication behavior is preserved. If a different remembered alias already occupies the normalized token, import save rejects the overwrite and directs the user to the correction surface to remove or replace the old mapping deliberately. `aliasRepo.save` never silently changes an existing token to a different target. Exact names such as `High Bar Back Squat` resolve automatically and do not require this choice.

The generic `Back Squat` remains a valid concrete version with `back-rack` but no bar-position modifier. High-bar and low-bar versions keep distinct concrete IDs and metrics.

### Prompt boundary

The prompt builder, emitted routine JSON schema, and prompt tests are unchanged. LLMs continue to provide names and the existing analysis tags. Catalogue identity, disambiguation, and specificity are handled entirely after parsing during import.

## Catalogue and Selection UI

The exercise library, add-exercise picker, and replace-exercise picker show one row per primary movement with concrete versions nested beneath it. Selecting a primary movement alone is not sufficient to add an exercise; the user selects a concrete version, including a generic/unspecified version when one exists.

Search indexes both levels. A family query such as `squat` returns the Squat family and relevant nested versions. A modifier query such as `high bar` reveals and highlights the matching version beneath its family. Standalone/unreviewed exercises remain searchable and selectable.

Catalogue detail exposes `Change primary movement/modifiers`. Saving is a global correction. The editor uses bundled movement and modifier choices but does not expose internal IDs as ordinary copy.

The Library adds a `Needs review` section derived from unresolved program exercises, log entries, and user exercises. It is not a separately persisted queue. A shared normalization correction sheet is reachable from this section, catalogue/custom-exercise detail, all-time history rows, and the Today drawer. It supports three explicit actions:

- Map the normalized name to an existing concrete catalogue version and create a global `remembered` alias.
- Assign the current bundled/custom/name-only target to an existing movement plus compatible bundled modifiers.
- Leave or return the target to standalone.

Library search and exercise pickers include user exercises and standalone unresolved names alongside bundled families. The ordinary workout exercise editor links to the shared correction sheet rather than duplicating identity controls among sets/reps/load fields.

## History Behavior

### Shared aggregation boundary

Move family-aware history aggregation into shared workout-history utilities. Both all-time history and the Today drawer consume the same normalized entry-row model:

```ts
export type ExerciseHistoryRow = {
  logId: string;
  entryIndex: number;
  performedAt: string;
  performedDate: string;
  performedName: string;
  concreteExerciseId?: string;
  movementId?: string;
  currentVersionLabel?: string;
  sets: string[];
  note?: string;
  volumeLb: number;
};
```

Aggregation iterates every matching `WorkoutLogEntry`; it never uses `find`, so two entries from one workout cannot collapse into one. An entry appears when it contains at least one recorded set or an exercise note, whether the enclosing workout is complete or still in progress. Skipped workouts without exercise data do not create exercise-history rows.

Rows sort by `performedAt` descending, then `logId`, then `entryIndex`, giving deterministic order to same-day and same-workout entries. `performedDate` remains the local calendar label. Set labels preserve their logged units, while volume comparisons use the existing normalized-pound calculation.

### All-time history

The history index contains one item per primary movement plus standalone exercises that lack a safe family mapping. A family index row may show only comparable family-level facts: total distinct workout logs and most-recent performed date. It does not show a family PR, best set, or volume trend.

Opening a movement shows a combined chronological list of entries for every concrete version. Each row uses the immutable stored `exerciseName` as its primary performed label when available. A separate current version/family badge uses current catalogue metadata, making a global correction retroactively change grouping without rewriting what the user originally logged.

Replace the current all-time exercise-detail placeholder with the actual combined session table.

Performance summaries remain separate by concrete version:

- No family-wide PR.
- No family-wide best set.
- No family-wide volume trend.
- Each concrete version displays its own session count, best, last result, and trend. Session count is the number of distinct workout logs containing that version. When one workout contains the same version more than once, version-summary volume sums those entries into one chronological session bucket; the combined history table still shows each entry separately.

Exact duplicates collapsed by catalogue deduplication share one concrete history. Mechanically distinct versions do not.

### Today history drawer

Opening history from any version loads recent rows for its entire movement family. Every row shows the performed name and current version badge. The currently selected concrete version is visually emphasized, and a version filter can narrow the combined list without changing the default family-wide view.

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
- Exercise cumulative merge-manifest conflicts, chain flattening, retained standalone entries, and ambiguous-report generation.
- Classify every normalized canonical-name/alias collision as unique, underspecified, or removed-noise; reject every unclassified collision.
- Reject redirect cycles, missing targets, duplicate survivors, and invalid movement/modifier references.
- Prove frozen snapshot compilation performs no network access and is byte-for-byte reproducible.
- Prove `catalog:build`/`catalog:check` are offline and the optional live ingestion command cannot write production generated outputs.
- Validate modifier synonym normalization, implication expansion, category exclusivity, exclusions, family allowlists, canonical ordering, and per-family maximums.
- Emit and consume both movement and modifier runtime registries; reject a modifier whose exact ID is not allowed by its family even when its broad category is allowed.
- Reject implication cycles, asymmetric exclusions, closure conflicts, undefined exclusive groups, and non-identity modifiers in signatures.
- Preserve an existing ID when a generated rule matches its signature; reject duplicate signatures, conflicting IDs, and conflicting display names.
- Require a compatible metadata base for every generated variant and verify reviewed equipment/muscle/tag overrides reach analysis lookup.
- Reject non-identity prescription details as concrete variants, including pause duration, tempo, load, RPE, pain-free depth, and assisted/bodyweight alternatives.
- Permit curated coarse `paused` rules while canonicalizing every pause duration to the same identity.
- Enforce the 300-entry Tier-1 cap and require approved status for every emitted generated variant.
- Produce and review family-level proposed/approved/rejected/collision/coverage counts for all 12 Tier-1 families.
- Snapshot stable catalogue, redirect, disambiguation, and duplicate-report outputs.

### Migration and backup

- Upgrade representative version-9 IndexedDB fixtures containing programs, week variants, override replacements, logs, aliases, import-warning suggestions, and the obsolete metrics store.
- Assert every known catalogue reference is rewritten while routine-slot `id`/`exerciseId` fields and every performance field remain unchanged.
- Assert unknown IDs remain visible and untouched.
- Assert the unused metrics store is deleted and history still derives from logs.
- Purge ambiguous/noisy legacy-auto aliases, retain only uniquely classified legacy aliases, and preserve new remembered-alias provenance.
- Run the migration twice and prove the second pass is a no-op.
- Round-trip normalization overrides through a version-2 backup.
- Reject duplicate/conflicting override targets and prove repeated saves upsert the deterministic target key.
- Accept and migrate version-1 backups during the compatibility window, reject unsupported future versions, and prove no new field is silently discarded.
- Verify already-normalized data remains valid when the redirect table is absent.

### Import

- Collapse repeated `back squat` occurrences into one choice with the correct count.
- Return `underspecified` before exact-name/alias finalization when a reviewed disambiguation rule applies and no saved alias exists.
- Parse reviewed non-identity phrases without changing stored names; canonicalize numeric paused wording to coarse `paused`; keep `or` alternatives unresolved.
- Fan one choice across base days, supported exercise-level variants, and override replacement exercises without bypassing name/path guards.
- Exclude unsupported variants nested inside override replacements from grouping and preserve their structural warning.
- Keep a choice import-local by default.
- Persist a global alias only through `Remember this interpretation`.
- Let a remembered alias take precedence over the underspecified-name rule on later imports.
- Disable remembered persistence when one normalized name resolves to multiple IDs; reject silent overwrite of an existing remembered alias.
- Allow occurrence-level expansion through `resolve separately`.
- Bypass the choice for exact concrete names.
- Resolve raw hyphenated catalogue IDs before name normalization.
- Prove a routine-slot ID equal to a catalogue/redirect ID is never treated as canonical when `canonicalExerciseId` is absent.
- Keep fuzzy suggestions suggestion-only regardless of the old `0.65` threshold.
- Preserve existing name-guard behavior for base/variant resolution paths.

### History and UI

- Nest concrete versions under primary movements in library and picker surfaces.
- Find families and versions through search.
- Aggregate every matching log entry into family history while preserving immutable performed labels and current classification badges.
- Preserve two same-family entries in one log and deterministically order same-day entries by timestamp, log ID, and entry index.
- Keep metrics separated by concrete version.
- Count distinct logs for version sessions and combine same-version entries only within version-summary session buckets.
- Default the Today drawer to combined family history, emphasize the active version, and filter by version.
- Apply global corrections immediately to existing history grouping without relabeling performed names or requiring a reload.
- Keep standalone/unknown exercises visible and correctable.
- Exercise correction-sheet actions for concrete alias mapping, bundled family/modifier assignment, and clearing back to standalone across catalogue IDs, user-exercise IDs, and normalized-name targets.
- Resolve a matching normalized-name override to a family-classified identity with no concrete exercise ID before standalone fallback.
- Reject invalid correction targets, noncanonical modifier order, incomplete implications, exclusion conflicts, and family-incompatible modifiers.
- Inventory direct catalogue lookups and prove one live override update reaches analysis, library nesting, all-time history, and Today history through the shared provider.
- Prove alias, user-exercise, override, migration, and backup-restore writes each trigger one atomic identity-context refresh; bulk operations publish only after commit.

### Quality gates

Run focused tests during each task, then the complete unit/integration suite, type checking, linting, production build, and targeted end-to-end exercise-import/history coverage before completion.

## Delivery Order

1. Freeze and hash the current catalogue snapshot; define canonical movements, build-time modifier constraints, cumulative merge rules, and compiler validations.
2. Deduplicate existing entries and assign reviewed movement/signature metadata.
3. Dispatch Luna max to propose up to 300 Tier-1 modifier variants, then run a separate Luna max adversarial semantic review and resolve every rejection/collision before approval.
4. Generate the normalized catalogue, temporary redirects, disambiguation data, and near-duplicate/variant-coverage report.
5. Add the shared runtime normalization resolver and global override persistence.
6. Migrate existing IDs, delete the metrics store/repository, and update versioned backup/restore.
7. Group and disambiguate repeated import names with local-by-default choices.
8. Nest catalogue and selection surfaces.
9. Implement shared family-history aggregation and both history presentations.
10. Run full catalogue, migration, backup, import, history, UI, end-to-end, and quality-gate verification.

## Out of Scope

- Asking LLMs to emit movement or modifier IDs.
- Changing the prompt builder or routine JSON schema.
- Replacing all stored exercise references with `{ movementId, modifiers }` tuples.
- Combining PRs, best sets, or volume trends across concrete versions.
- Automatically fuzzy-merging ambiguous exercises.
- Guaranteeing restoration of pre-migration backups after the September 30, 2026 compatibility removal.
- User-created movement families or modifier definitions.
- Generating every possible modifier combination or exceeding 300 new Tier-1 variants.
- Treating numeric pauses/tempo, load, RPE, pain-free depth, or other programming prescriptions as exercise identity.
