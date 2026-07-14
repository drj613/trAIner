# Working-volume semantics and override diagnostics

## Final TDD implementation plan

## Objective

Correct false-positive routine analysis caused by treating ordinary warmups, activation drills, mobility work, rehabilitation work, and similar preparation as productive working volume.

The implementation must:

* Add an explicit exercise-level working-volume signal.
* Preserve it through JSON import, backup, editing, swapping, and manual routine construction.
* Apply one shared resolution rule across all set-based analyzers.
* Distinguish total prescribed sets from productive working sets.
* Continue counting all programmed activity toward exercise complexity and estimated duration.
* Correct canonical muscle duplication within each tag tier.
* Align unmatched-exercise warning paths with resolution paths.
* Support unmatched-exercise resolution inside override replacement days.
* Detect inert or ineffective overrides without blocking import.
* Stop generated prompts from teaching models to emit no-op overrides.
* Preserve the application’s local, permissive, diagnostic architecture.
* Introduce every behavioral change through a failing test.
* Keep every committed repository state type-safe, test-green, and build-green.

---

# Product decisions

1. Add `countsTowardVolume?: boolean` to each program exercise.
2. Explicit exercise values are authoritative.
3. Section type is a fallback for legacy or manually created content, not an authoritative signal.
4. Exact normalized modifiers may override the section fallback for obvious preparation work.
5. All productive-set analyzers operate on the same resolved working-exercise population.
6. Weekly muscle-volume ranges remain advisory planning references.
7. Explicit athlete-requested specialization may exceed preferred ranges.
8. Programming warnings remain non-blocking.
9. `totalSets` retains its current meaning: all prescribed sets.
10. Add `workingSets`: only sets contributing to productive working-volume analysis.
11. Exercise count continues to include all exercise objects.
12. Estimated duration continues to use all prescribed sets.
13. Only within-tier muscle duplication is corrected.
14. Existing cross-tier additive weighting remains unchanged.
15. AI-provided muscle tags remain the primary instance-level source.
16. Canonical catalog tags remain fallback and matching metadata.
17. Manual exercise swaps preserve the routine slot’s volume role.
18. Populated injury fields remain user-omittable.
19. Circuit-round modelling remains out of scope.
20. Automatic progression remains out of scope.
21. Imports remain permissive.
22. Override diagnostics are warnings, not rejection conditions.
23. Existing routines will re-grade dynamically under the corrected analysis semantics.
24. Every committed change must pass type-checking, tests, and build.

---

# TDD operating rules

For every behavioral phase:

1. Write the smallest failing test expressing the desired behavior.
2. Run the focused test and verify that it fails for the expected reason.
3. Implement the minimum production change.
4. Run the focused test until green.
5. Run the related test directory.
6. Run the complete gate.
7. Refactor only while the complete gate remains green.
8. Commit only after the phase is fully green.

The required gate is:

```text
bun run typecheck
bun run test
bun run build
```

Local red states are expected during TDD. Red states must not be committed.

---

# Phase 0 — Activate real TypeScript checking

This phase changes no product behavior.

It must be completed as one atomic green commit because activating the test TypeScript project exposes ten existing errors immediately.

## 0.1 Verify the current failure

Before editing, run:

```text
tsc --noEmit -p tsconfig.test.json --listFilesOnly
```

Confirm that none of the repository’s test files are currently included because `tsconfig.test.json` inherits the production exclusion:

```json
"exclude": [
  "node_modules",
  "src/**/*.test.ts",
  "src/**/*.test.tsx"
]
```

Use a known test file such as:

```text
src/lib/analysis/session.test.ts
```

as the verification target.

This is a local red verification step, not a separate commit.

## 0.2 Activate the test project

Update `tsconfig.test.json` so its own exclusion replaces the inherited production exclusion:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

Retain the project’s existing test-specific JSX, module-resolution, and environment-type configuration where already present.

The load-bearing requirement is:

```json
"exclude": ["node_modules"]
```

The test TypeScript project must include all current test files.

## 0.3 Add the type-check command

Add:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json"
  }
}
```

If the repository uses equivalent command wrappers, preserve its conventions while checking both projects.

## 0.4 Fix all ten surfaced test errors

Fix these in the same atomic commit that activates test checking.

### `toDisplayAnalysis.test.ts`

Complete the periodization fixture with:

```ts
peakDetected
intensityProgression
```

### `RoutineAnalysisCard.test.tsx`

Fix the six readonly tuple errors caused by:

```ts
as const
```

Use a mutable `DimensionKey[]`, remove `as const`, or use the explicit typed-array pattern already used by `LlmAnalysisSheet.test.tsx`.

Do not weaken the production type.

### `backup.test.ts`

At both failing locations, cast the global IndexedDB mock to its actual mocked surface:

```ts
const indexedDbMock =
  global.indexedDB as unknown as {
    deleteDatabase: jest.Mock;
  };
```

Do not cast it to `IDBDatabase`.

`deleteDatabase` belongs to the `IDBFactory` surface represented by `global.indexedDB`.

### `sessionState.test.ts`

Remove or correct the unsupported `exerciseId` property from the fresh object literal whose target type only supports fields such as `notes`.

## 0.5 Verify test-file inclusion

Run:

```text
tsc --noEmit -p tsconfig.test.json --listFilesOnly
```

Confirm that all test files are included, including:

```text
src/lib/analysis/session.test.ts
```

## 0.6 Phase gate

Run:

```text
bun run typecheck
bun run test
bun run build
```

Commit the configuration activation and all ten existing error fixes together.

Suggested commit:

```text
chore: activate test typechecking and fix surfaced errors
```

---

# Phase 1 — Preserve the exercise volume-role field

Phase 1 covers model, import, storage, backup, editing, and swapping only.

It must not reference the section-default map introduced in Phase 2.

## 1.1 Red parser tests

Add tests for:

```json
{
  "countsTowardVolume": true
}
```

and:

```json
{
  "counts_toward_volume": false
}
```

Assert:

* Explicit `true` survives normalization.
* Explicit `false` survives normalization.
* String `"true"` is rejected and becomes `undefined`.
* Missing values remain `undefined`.
* Unknown unrelated fields continue to be discarded.

These tests must initially fail because `normalizeExercise` builds a fresh object literal and drops the new field.

## 1.2 Add the model field

Update `ProgramExercise`:

```ts
type ProgramExercise = {
  id: string;
  name: string;
  canonicalExerciseId?: string;
  sets?: number;
  reps?: string;
  load?: string;
  rest?: string;
  tempo?: string;
  notes?: string;
  countsTowardVolume?: boolean;
  tags: {
    primary: string[];
    secondary: string[];
    incidental: string[];
    modifiers: string[];
  };
};
```

## 1.3 Add boolean-only parsing

Add:

```ts
function optionalBoolean(
  value: unknown,
): boolean | undefined {
  return typeof value === "boolean"
    ? value
    : undefined;
}
```

In `normalizeExercise`:

```ts
const countsTowardVolume =
  optionalBoolean(raw.countsTowardVolume) ??
  optionalBoolean(raw.counts_toward_volume);
```

Explicit `false` must survive the nullish-coalescing expression.

Copy it into the normalized object literal:

```ts
return {
  id,
  name,
  canonicalExerciseId,
  sets,
  reps,
  load,
  rest,
  tempo,
  notes,
  countsTowardVolume,
  tags,
};
```

## 1.4 Red persistence tests

Add tests proving:

* Backup export/import preserves explicit `true`.
* Backup export/import preserves explicit `false`.
* Exercise editing preserves an existing value.
* Exercise swapping preserves explicit `true`.
* Exercise swapping preserves explicit `false`.
* Exercise swapping preserves `undefined`.

Backup data already stores whole program documents, so no bespoke backup migration should be necessary.

## 1.5 Update reconstruction paths

Update any production path that rebuilds a `ProgramExercise` object rather than spreading it.

Exercise swap should preserve:

```ts
countsTowardVolume:
  existingExercise.countsTowardVolume
```

The explicit assignment is acceptable even when the existing spread already preserves it.

Do not infer a replacement value from catalog metadata.

## 1.6 Phase gate

Run parser, backup, edit, and swap tests, followed by:

```text
bun run typecheck
bun run test
bun run build
```

Suggested commits:

```text
test: define volume-role import persistence
feat: preserve countsTowardVolume through program flows
```

Each commit must be green. Combine them if repository conventions favor one atomic red-green commit.

---

# Phase 2 — Shared defaults and resolver

## 2.1 Red tests for exhaustive section defaults

Add tests covering exactly all 13 current section types:

```ts
warmup: false
explosive: true
strength: true
power: true
hypertrophy: true
accessory: true
metcon: true
cardio: false
conditioning: true
rehab: false
mobility: false
cooldown: false
training: true
```

There is no `rest` section type.

Rest days contain no sections and do not invoke the exercise resolver.

## 2.2 Add the exhaustive default map

Create:

```ts
export const DEFAULT_COUNTS_BY_SECTION:
  Record<SectionType, boolean> = {
    warmup: false,
    explosive: true,
    strength: true,
    power: true,
    hypertrophy: true,
    accessory: true,
    metcon: true,
    cardio: false,
    conditioning: true,
    rehab: false,
    mobility: false,
    cooldown: false,
    training: true,
  };
```

The exhaustive `Record` must fail type-checking when a future section type is introduced without a default.

Both `metcon` and `conditioning` remain `true`.

## 2.3 Red tests for resolver precedence

Add tests proving:

1. Explicit `true` overrides a warmup section.
2. Explicit `false` overrides a strength section.
3. Exact modifier `activation` resolves false.
4. Modifier matching trims whitespace.
5. Modifier matching ignores case.
6. `warmup` and `warm-up` resolve false.
7. `cooldown` and `cool-down` resolve false.
8. `mobility` resolves false.
9. `rehab` resolves false.
10. `prehab` resolves false.
11. `skill` does not automatically resolve false.
12. `technique` does not automatically resolve false.
13. `primer` does not automatically resolve false.
14. Ambiguous legacy `training` work resolves true.
15. Metcon resolves true.
16. Conditioning resolves true.

## 2.4 Implement the resolver

Use:

```ts
const NON_VOLUME_MODIFIERS = new Set([
  "warmup",
  "warm-up",
  "activation",
  "mobility",
  "cooldown",
  "cool-down",
  "rehab",
  "prehab",
]);
```

Implement:

```ts
export function resolveCountsTowardVolume(
  exercise: ProgramExercise,
  sectionType: SectionType,
): boolean {
  if (
    typeof exercise.countsTowardVolume ===
    "boolean"
  ) {
    return exercise.countsTowardVolume;
  }

  const modifiers = new Set(
    exercise.tags.modifiers.map((value) =>
      value.trim().toLowerCase(),
    ),
  );

  for (const modifier of modifiers) {
    if (NON_VOLUME_MODIFIERS.has(modifier)) {
      return false;
    }
  }

  return (
    DEFAULT_COUNTS_BY_SECTION[sectionType] ??
    true
  );
}
```

Correct semantic statement:

> Explicit exercise values are authoritative. Exact modifiers and section type provide conservative defaults for legacy or manually created content.

## 2.5 Red manual-builder tests

After the shared map exists, add tests proving newly constructed manual exercises receive:

* Warmup: `false`
* Mobility: `false`
* Cardio: `false`
* Rehab: `false`
* Strength: `true`
* Hypertrophy: `true`
* Metcon: `true`
* Conditioning: `true`
* Training: `true`

## 2.6 Implement manual-builder defaults

Update `draftToProgram` or the relevant construction function:

```ts
countsTowardVolume:
  DEFAULT_COUNTS_BY_SECTION[
    selectedSectionType
  ],
```

Do not create a duplicate local table.

If the builder cannot create all 13 section types, test every section it currently exposes and separately test the exhaustive map.

## 2.7 Phase gate

Run resolver and builder tests, followed by the full gate.

Suggested commits:

```text
test: define volume-role defaults and precedence
feat: add shared working-volume resolver
test: define manual-builder volume defaults
feat: assign manual-builder volume defaults
```

---

# Phase 3 — Weekly volume gating

## 3.1 Red tests

Add tests proving:

* Warmup activation contributes zero effective volume.
* Mobility work contributes zero effective volume.
* Explicit `true` inside a warmup contributes volume.
* Explicit `false` inside a hypertrophy section contributes zero.
* Conditioning defaults to contributing volume.
* Metcon defaults to contributing volume.
* Ordinary legacy strength work still contributes.

## 3.2 Implement volume gating

In `countWeeklyVolume`, retain section context and gate before adding any muscle credit:

```ts
if (
  !resolveCountsTowardVolume(
    exercise,
    section.type,
  )
) {
  continue;
}
```

Apply the gate to:

* Primary tags
* Secondary tags
* Incidental tags
* Full-body expansion

Do not change:

* Weekly median aggregation
* Existing landmark values
* Goal gating
* Scoring weights
* Cross-tier weighting

## 3.3 Phase gate

Run volume tests and the complete gate.

Suggested commits:

```text
test: define gated weekly volume behavior
feat: gate weekly volume analysis
```

---

# Phase 4 — Within-tier canonical muscle deduplication

This is a separate change from working-volume gating.

## 4.1 Red tests

Add cases for:

```ts
["chest", "Chest"]
```

Two aliases mapping to the same canonical muscle.

```ts
["full body", "quads"]
```

Repeated full-body labels:

```ts
["full body", "full body"]
```

Same muscle in separate tiers:

```ts
primary: ["chest"]
secondary: ["chest"]
```

Expected behavior:

* A canonical muscle counts once within one tier.
* After expansion, retain the largest factor within the tier.
* Different tiers retain current additive behavior.

## 4.2 Implement within-tier maximum contribution

For each tier independently:

1. Normalize each raw label.
2. Expand aliases and full-body labels.
3. Build a map from canonical muscle to candidate factor.
4. Retain the largest candidate factor.
5. Apply the current tier multiplier.
6. Add the result to the shared muscle total.

Conceptually:

```ts
const contributions =
  new Map<CanonicalMuscle, number>();

for (const rawLabel of rawLabels) {
  for (
    const expanded of
      expandMuscleLabel(rawLabel)
  ) {
    const previous =
      contributions.get(expanded.muscle) ?? 0;

    contributions.set(
      expanded.muscle,
      Math.max(
        previous,
        expanded.factor,
      ),
    );
  }
}
```

For:

```text
primary: ["full body", "quads"]
```

if full body contributes quadriceps factor `0.5` and explicit quads contributes `1.0`, use:

```text
quads = max(0.5, 1.0) = 1.0
```

Do not produce `1.5`.

If quadriceps also appears in the secondary tier, retain the current cross-tier addition.

## 4.3 Phase gate

Run volume and muscle-mapping tests, followed by the complete gate.

Suggested commits:

```text
test: define within-tier muscle deduplication
fix: deduplicate canonical muscles within tag tiers
```

---

# Phase 5 — Split total and working session sets

The addition of required `workingSets` must be atomic across type, producer, mapper, consumers, and all complete literals.

## 5.1 Red behavioral tests

Create a session containing:

* Warmup exercises
* Mobility exercises
* Strength work
* Explicitly excluded skill practice

Assert:

```text
totalSets = all prescribed sets
workingSets = only resolved working sets
exerciseCount = all exercise objects
estimatedMinutes = totalSets * 3 + 10
```

## 5.2 Red direct-muscle-cap test

Create a glute session whose activation warmup currently pushes primary glute sets beyond the direct-set threshold.

Expected after implementation:

* Activation sets do not count toward the direct glute cap.
* Working hip-thrust sets still count.
* Activation remains in total sets and estimated duration.

## 5.3 Atomic implementation

In one green implementation change:

### Type

Add:

```ts
workingSets: number;
```

to `SessionResult`.

### Producer

Update `session.ts`:

```ts
let exerciseCount = 0;
let totalSets = 0;
let workingSets = 0;
```

For every exercise:

```ts
exerciseCount += 1;

const sets = getEffectiveSets(exercise);

totalSets += sets;

if (
  resolveCountsTowardVolume(
    exercise,
    section.type,
  )
) {
  workingSets += sets;
}
```

Return both values.

### Duration

Retain:

```ts
estimatedMinutes =
  totalSets * 3 + 10;
```

### Classification

Use `workingSets` for:

* The 10–25 working-set range
* Working-set warnings
* Direct primary-muscle caps

Use `totalSets` for:

* Total prescribed activity
* Duration
* General session summary

### Mapper

Update `toDisplayAnalysis.ts`:

```ts
workingSets:
  result.workingSets
```

### Consumers

Update:

* `SessionDisplay`
* `RoutineAnalysisCard`
* `LlmAnalysisSheet`
* `sheetPrompt.ts`
* Any other complete display-facing session object

### Complete test literals

Update in the same implementation commit:

* `toDisplayAnalysis.test.ts`
* `RoutineAnalysisCard.test.tsx`
* `LlmAnalysisSheet.test.tsx`
* Shared `SessionResult` factories
* Any further literals revealed by `bun run typecheck`

The repository must not contain an intermediate commit where the required field is missing from any producer or consumer.

## 5.4 Warning copy

Retain day context:

```text
{day.title}: working sets are above the preferred range.
```

The analysis flattens session warnings, so the title prefix is required.

## 5.5 Display

Render both:

```text
23 total prescribed sets
18 working sets
```

The preferred 10–25 range applies only to working sets.

## 5.6 Phase gate

Run:

```text
bun run typecheck
```

before focused Jest tests, then run session, mapper, component, and sheet tests, followed by the complete gate.

Suggested commits:

```text
test: define total and working session sets
feat: split session set accounting
```

The implementation commit must be atomic across the complete type and display path.

---

# Phase 6 — Gate movement-balance analysis

## 6.1 Red tests

Add tests proving:

* Warmup band pull-aparts do not change push/pull working ratios.
* Activation work does not change upper/lower working ratios.
* Non-volume handstand practice does not satisfy vertical-push working coverage.
* Explicitly volume-counting work inside a warmup section affects balance.
* A pure-mobility routine returns null or empty working ratios without throwing.

## 6.2 Implement balance gating

In `balance.ts`, gate every exercise before adding:

* Push sets
* Pull sets
* Upper-body sets
* Lower-body sets
* Movement-pattern totals
* Set-based working coverage

Use:

```ts
resolveCountsTowardVolume(
  exercise,
  section.type,
)
```

Do not count ordinary preparation as working-pattern balance.

## 6.3 Coverage regression

If `coverage.ts` derives results from gated muscle volumes, do not duplicate the filter.

Add a regression test proving excluded work does not reappear through coverage.

## 6.4 Phase gate

Run balance, coverage, and complete analysis tests.

Suggested commits:

```text
test: define working-pattern balance
fix: gate balance analysis
```

---

# Phase 7 — Gate periodization analysis

## 7.1 Red traversal test

Create a week containing low-repetition warmup ramp sets.

Assert they do not affect:

* `heavySetShare`
* Average repetitions
* Average percentage
* Heavy-week classification
* Peak detection

This test must initially fail because the current flattened exercise list loses section context.

## 7.2 Filter during traversal

Do not filter after flattening to `ProgramExercise[]`.

Either return:

```ts
type ExerciseWithSection = {
  exercise: ProgramExercise;
  sectionType: SectionType;
};
```

or filter while traversing:

```ts
function getWorkingWeekExercises(
  days: ProgramDay[],
  weekNumber: number,
): ProgramExercise[] {
  const exercises: ProgramExercise[] = [];

  for (const day of days) {
    if (
      effectiveWeekNumber(day) !==
      weekNumber
    ) {
      continue;
    }

    for (const section of day.sections) {
      for (const group of section.groups) {
        for (
          const exercise of group.exercises
        ) {
          if (
            resolveCountsTowardVolume(
              exercise,
              section.type,
            )
          ) {
            exercises.push(exercise);
          }
        }
      }
    }
  }

  return exercises;
}
```

Every set-derived periodization metric must use this same population:

* Weekly set volume
* Heavy-set share
* Average percentage
* Average repetitions
* Heavy-week classification
* Peak detection
* Deload detection
* Goal-mismatch notes

## 7.3 Red real-deload test

Create a multi-week program with:

* Constant warmup volume
* Reduced working-set volume in the deload
* Reduced working intensity in the deload

Assert:

* Deload is detected.
* Constant warmup work does not mask it.
* Peak is not detected.

## 7.4 Red zero-working-volume test

Use a multi-week pure-mobility routine.

Assert:

```ts
peakDetected === false
deloadDetected === false
```

No result may contain:

* `NaN`
* `Infinity`
* Division-by-zero artifacts

## 7.5 Implement positive-reference guards

Use:

```ts
const volumeDropped =
  maxVolume > 0 &&
  weekVolume <= maxVolume * 0.7;
```

Apply equivalent positive-reference guards to any other proportional comparison that could classify a zero-working-volume routine.

## 7.6 Red goal-mismatch tests

Pin that goal-mismatch notes derive from gated:

* Heavy-set share
* Average percentage
* Average repetitions

## 7.7 Phase gate

Run periodization and full `analyzeProgram` tests.

Suggested commits:

```text
test: define working-set periodization
fix: gate periodization and zero-volume comparisons
```

---

# Phase 8 — Canonical base-day warning paths

This phase fixes the pre-existing index-versus-day-number mismatch before extending override resolution.

## 8.1 Red non-sequential-day test

Import base days:

```json
[
  {"day": 1},
  {"day": 3},
  {"day": 5}
]
```

Place an unmatched exercise on declared Day 3.

Assert the warning path is:

```text
days.3.sections.0.groups.0.exercises.0
```

not:

```text
days.2.sections.0.groups.0.exercises.0
```

Apply a resolution and assert:

* Day 3 is patched.
* Days 1 and 5 remain unchanged.

## 8.2 Compute day number before nested normalization

Refactor `normalizeDay` to calculate `dayNumber` first:

```ts
const dayNumber = numberFrom(
  raw.day ?? raw.dayNumber,
  fallbackDayNumber,
);
```

Then derive:

```ts
const dayPath =
  `${pathPrefix}.${dayNumber}`;
```

Pass the semantic path into section, group, and exercise normalizers.

## 8.3 Shared path builders

Create shared functions:

```ts
function baseExercisePath(
  dayNumber: number,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
): string;
```

```ts
function overrideExercisePath(
  overrideIndex: number,
  dayNumber: number,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
): string;
```

Use them in:

* Warning emission
* Unresolved-exercise extraction
* Base resolution application
* Override resolution application
* Tests

## 8.4 Duplicate base-day diagnostics

Run duplicate declared `dayNumber` checks on normalized base-template days **before** `expandDays`.

Correct order:

```ts
const baseDays = parseBaseDays(...);

diagnoseDuplicateBaseDayNumbers(
  baseDays,
  warnings,
);

const days = expandDays(
  baseDays,
  lengthWeeks,
);
```

Do not check expanded days. Expanded weekly copies legitimately share the same day number.

### Tests

Real duplicate base days:

```json
[
  {"day": 1},
  {"day": 3},
  {"day": 3}
]
```

Expected: duplicate Day 3 structural warning.

Legitimate expansion:

* Base template has Day 1.
* Program expands to four weeks.
* No duplicate-day warning is emitted for the four Day 1 copies.

If duplicate base day numbers make an exercise path ambiguous, do not apply an exercise resolution through that ambiguous path.

## 8.5 Phase gate

Run parser and resolution tests, then the complete gate.

Suggested commits:

```text
test: define canonical base-day resolution paths
fix: align base warning paths with declared day numbers
```

---

# Phase 9 — Override warning propagation and exercise resolution

## 9.1 Red lost-warning test

Create an override replacement containing an unmatched exercise.

Assert the current parser fails to expose it through:

```ts
program.import.warnings
```

## 9.2 Propagate override warnings

Refactor `parseOverrides` so local warnings merge into the shared import-warning collection.

Override warning paths must use:

```text
overrides.{overrideIndex}.days.{dayNumber}.sections.{sectionIndex}.groups.{groupIndex}.exercises.{exerciseIndex}
```

A partial override replacing only declared Day 3 at array position zero must emit:

```text
overrides.0.days.3.sections.0.groups.0.exercises.0
```

not `days.1`.

## 9.3 Shared replacement traversal helper

Add:

```ts
export function getOverrideReplacementDays(
  override: ProgramOverride,
): ProgramDay[] {
  return Array.isArray(
    override.replacement,
  )
    ? override.replacement
    : [override.replacement];
}
```

This normalizes only for traversal.

Do not rewrite stored single-day replacements into arrays.

When updating a replacement:

* Preserve a single replacement as single.
* Preserve an array replacement as array.

Use the helper in:

* Override application
* Runtime diagnostics
* Unresolved-exercise extraction
* Exercise-resolution application
* Tests

## 9.4 Red partial-override resolution test

Create a week override whose only replacement is declared Day 3.

Assert:

* The warning path uses `overrides.0.days.3...`.
* Applying the resolution patches the actual replacement exercise.
* The base Day 3 remains unaffected unless it is separately resolved.
* The replacement exercise receives its canonical ID.
* `countsTowardVolume` is preserved.
* The exercise slot ID is preserved.
* Cross-week history can use the canonical ID.

## 9.5 Extend `applyResolutions`

Traverse:

* `program.days`
* `program.overrides[*].replacement`

Use the same shared path builders used by warning emission.

Patch the actual nested replacement object, not a detached copy.

## 9.6 Remove successfully resolved warnings

`ImportWarning` has no `kind` discriminator.

Only add paths to `resolvedPaths` after an exercise was successfully patched.

Then filter by exact path:

```ts
const remainingWarnings =
  program.import.warnings.filter(
    (warning) =>
      !resolvedPaths.has(warning.path),
  );
```

Preserve:

* Unapplied exercise warnings
* Unrelated structural warnings
* Warnings at other paths

After resolution:

```ts
extractUnresolvedExercises(
  updatedProgram,
)
```

must not return the successfully resolved base or override exercise.

## 9.7 Tests

Add tests proving:

1. Base-day resolution removes its warning.
2. Override resolution removes its warning.
3. Failed resolution leaves the warning.
4. Structural warnings remain.
5. Base and override paths cannot collide.
6. Single replacement shape is preserved.
7. Array replacement shape is preserved.
8. Canonical history linkage remains available.

## 9.8 Phase gate

Run parser, resolution, override, and history tests.

Suggested commits:

```text
test: define override warning and resolution behavior
fix: propagate and resolve override exercise warnings
```

---

# Phase 10 — Override diagnostics

Override diagnostics remain warning-only.

They must not reject or silently delete imported structures.

## 10.1 Effective weeks come from expanded days

Correct parser order:

```ts
const baseDays = parseBaseDays(...);

diagnoseDuplicateBaseDayNumbers(
  baseDays,
  warnings,
);

const days = expandDays(
  baseDays,
  lengthWeeks,
);

const effectiveWeeks = new Set(
  days.map((day) =>
    effectiveWeekNumber(day),
  ),
);

const overrides = parseOverrides(
  raw.overrides,
  {
    expandedDays: days,
    effectiveWeeks,
    warnings,
  },
);
```

Use:

```ts
effectiveWeekNumber(day)
```

not:

```ts
effectiveWeekNumber(
  day.weekNumber,
)
```

The helper accepts a `ProgramDay`.

## 10.2 Red expanded-week test

Create a four-week program expanded from one base template and an override for Week 4.

Assert no out-of-range warning is emitted.

This pins validation to the post-expansion day set rather than the raw base template or a scalar length.

## 10.3 Diagnostic cases

Add tests and warnings for:

### Week override with no replacement days

```text
Week 5 override contains no replacement days. The base weekly template will be used unchanged.
```

### Missing `weekNumber`

```text
A week override is missing `weekNumber` and cannot be applied.
```

### Week absent from effective program weeks

```text
Week 9 override does not match any week represented by this routine and will not be applied.
```

### Replacement day absent from the base template

```text
Week 6 override references Day 5, which does not exist in the base weekly template. That replacement will not be applied.
```

### Empty or rest replacement day

Use neutral wording:

```text
Week 4, Day 2 replaces the base workout with an empty or rest day. Confirm that this is intentional.
```

A day with `sections: []` may deliberately represent rest.

### Imported day-scope override without usable `dayId`

```text
Imported day-scope overrides cannot be applied without a matching internal routine day. Use a week override with replacement day objects instead.
```

Internal edit-generated day-scope overrides remain supported because they contain valid internal IDs.

## 10.4 Warning-only behavior

Do not reject, delete, or mutate an override solely because it is ineffective.

Preserve:

* Raw imported JSON
* Normalized override data
* Existing runtime no-op behavior

The diagnostics explain what will happen.

## 10.5 Runtime diagnostics

Add a pure diagnostics pass for previously stored routines.

Detect the same cases without requiring migration:

* Empty replacement
* Missing week
* Unknown week
* Unknown replacement day
* Empty/rest replacement day
* Inert imported day-scope override

## 10.6 Phase gate

Run override parser, runtime diagnostics, and rendering tests.

Suggested commits:

```text
test: define override diagnostics
feat: add import and runtime override diagnostics
```

---

# Phase 11 — Update all AI-facing prompts

Treat each prompt surface as a separately tested contract.

The three surfaces are:

1. Routine-generation prompt
2. External routine-analysis prompt
3. Modify-with-AI prompt

## 11.1 Generation prompt red tests

Assert the generated prompt:

* Includes `countsTowardVolume`.
* Requires it on every exercise.
* Explains `true`.
* Explains `false`.
* Keeps muscle tags accurate when the field is false.
* Uses “working sets” for the 10–25 range.
* Distinguishes total programmed work from working volume.
* Treats weekly volume ranges as advisory defaults.
* Allows deliberate athlete specialization.
* Requires numeric `sets` to match top-set and back-off prose.
* Prohibits reason-only overrides.
* Prohibits empty override day arrays.
* Contains a real replacement-day override example.
* Does not describe override days as optional when an override exists.

## 11.2 Exercise schema wording

Add:

```json
{
  "name": "Exercise Name",
  "sets": 3,
  "reps": "5-8",
  "countsTowardVolume": true,
  "tags": {
    "primary": ["quads"],
    "secondary": ["glutes"],
    "incidental": [],
    "modifiers": []
  }
}
```

Explain:

```text
Set `countsTowardVolume` to `true` when the prescribed sets are intended to contribute to working strength, hypertrophy, muscular conditioning, or explosive training volume.

Set it to `false` for ordinary warmups, activation drills, mobility work, cooldowns, rehabilitation or prehabilitation work, and low-fatigue practice that is not intended as productive muscular working volume.

Muscle tags still describe anatomical involvement when `countsTowardVolume` is false. The boolean controls analysis, not anatomy.
```

## 11.3 Session wording

Use:

```text
- Listed exercises or protocols per session: generally 4-8. All warmup, mobility, skill, conditioning, and cooldown exercises count toward this number.

- Working sets per session: generally 10-25. Only exercises with `countsTowardVolume: true` count toward this range.

- Estimated session duration: 30-75 minutes, including all programmed work.

- Direct working sets per muscle group per session: generally no more than 8, unless the athlete deliberately requests specialization and accepts the tradeoff.
```

## 11.4 Volume wording

Use:

```text
The weekly volume ranges are default programming guardrails, not mandatory targets for every muscle.

Prioritized hypertrophy muscles should generally fall within their productive ranges. Maintenance muscles may fall below them.

When the athlete explicitly requests specialization above a preferred range, preserve the decision when the recovery and session tradeoffs remain plausible. Acknowledge the tradeoff during conversation rather than automatically reducing the requested volume.

Hard limits are strong caution thresholds, not automatic reasons to reject an explicit athlete request.
```

## 11.5 Audit wording

Add:

```text
Exclude exercises with `countsTowardVolume: false` from working-set, weekly muscle-volume, direct-muscle-set, movement-balance, and periodization calculations.

Do not classify an athlete-requested and acknowledged specialization as an audit failure merely because it departs from a preferred range.
```

## 11.6 Numeric set consistency

Add:

```text
The numeric `sets` value controls the number of workout logging rows.

It must equal the complete prescription described in `reps`, `load`, and `notes`.

Examples:
- One top set plus three back-off sets uses `"sets": 4`.
- One top set plus two back-off sets uses `"sets": 3`.
```

## 11.7 Override skeleton

Remove any example equivalent to:

```json
"days": [
  "OPTIONAL — same structure as base days above. Omit if all weeks are identical."
]
```

Require:

```text
Only emit an override when at least one routine day actually changes.

Every override must contain one or more complete replacement day objects.

An override with omitted `days` or an empty `days` array does not alter the routine and must not be emitted.

If a week is identical to the base template, omit the entire override object.

The `reason` field is descriptive only. It does not alter sets, repetitions, loads, exercises, or effort targets.
```

Provide a structurally valid replacement-day example.

## 11.8 External analysis prompt tests

Update `sheetPrompt.ts` and assert it includes:

```text
Total prescribed sets: 23
Working sets: 18
Preferred working-set range: 10-25
```

Also explain:

* `countsTowardVolume`
* Exclusion from volume, balance, and periodization
* Within-tier canonical-muscle deduplication
* Full-body plus explicit-muscle maximum behavior
* Existing cross-tier additive behavior
* Advisory nature of volume ranges

## 11.9 Modify-with-AI prompt tests

Update the inline exercise example:

```json
{
  "name": "Exercise Name",
  "sets": 3,
  "reps": "8-12",
  "countsTowardVolume": true
}
```

Add:

```text
Preserve `countsTowardVolume` for unchanged exercises.

Use `true` for productive working sets and `false` for ordinary warmup, activation, mobility, cooldown, rehabilitation, prehabilitation, or low-fatigue practice.

Do not remove the field when modifying a day.
```

Where existing routine JSON is supplied, instruct the model to preserve all fields unrelated to the requested modification.

## 11.10 Phase gate

Run all prompt-builder, sheet-prompt, and modify-prompt tests.

Suggested commits:

```text
test: define updated AI prompt contracts
feat: update all AI-facing routine prompts
```

---

# Phase 12 — Full integration testing

## 12.1 Mixed multi-week fixture

Create one realistic imported routine containing:

* Base days numbered 1, 3, and 5
* Activation warmup
* Mobility work
* Handstand practice marked non-volume
* Low-repetition ramp sets marked non-volume
* Working strength work
* Working hypertrophy work
* Working conditioning or metcon work
* Real deload week
* Partial Week 4 override replacing only Day 3
* Unmatched base exercise
* Unmatched override exercise
* Reason-only inert override
* Duplicate muscle aliases
* `full body` plus explicit quadriceps

## 12.2 Integration assertions

Assert:

1. Explicit volume-role booleans survive import.
2. Base warning paths use declared day numbers.
3. Override paths use declared replacement day numbers.
4. Base resolution patches the intended non-sequential day.
5. Override resolution patches the replacement exercise.
6. Successfully resolved warnings disappear.
7. Warmups and mobility contribute zero effective working volume.
8. They remain in total prescribed sets.
9. They remain in estimated duration.
10. They are absent from working sets.
11. Balance ignores them.
12. Low-repetition ramp sets do not inflate heavy-set share.
13. Warmup volume does not mask the deload.
14. Conditioning work remains included.
15. Duplicate aliases count once within a tier.
16. Full-body plus explicit quadriceps retains the larger within-tier contribution.
17. Same muscle across primary and secondary tiers remains additive.
18. Inert override warnings appear.
19. Reason-only overrides do not alter rendered base weeks.
20. Analysis is deterministic.

## 12.3 Pure-mobility fixture

Create a multi-week routine containing only excluded mobility work.

Assert:

```text
totalSets > 0
workingSets = 0
```

Also assert:

* Effective muscle volume is zero.
* Working push/pull ratio is null or empty.
* Working upper/lower ratio is null or empty.
* Working movement coverage is absent.
* `peakDetected` is false.
* `deloadDetected` is false.
* Heavy-set share is not falsely positive.
* Estimated duration is finite.
* No value is `NaN`.
* No value is infinite.
* Analysis does not throw.
* Repeated analysis is identical.

Do not assert the absence of the general “no deload detected” advisory.

## 12.4 Final gate

Run:

```text
bun run typecheck
bun run test
bun run build
```

Verify again that the test TypeScript project includes all test files.

Suggested commit:

```text
test: add full working-volume integration coverage
```

---

# Phase 13 — Documentation and release notes

After all behavior is green, add persistent user-facing explanatory copy:

```text
Working-volume analysis excludes exercises identified as ordinary warmup, activation, mobility, cooldown, rehabilitation, or prehabilitation work.

These exercises still count toward total programmed activity, exercise count, and estimated session duration.
```

Document that existing stored routines will receive updated analysis results when reopened.

No data migration is required because scores are recomputed dynamically and the new exercise field is optional.

Do not add:

* Warning-dismissal state
* Automatic program changes
* Circuit-round storage
* Structured duration logging
* Structured RIR or RPE logging
* Per-user volume landmark tables
* Injury enforcement
* Provider-specific prompt variants
* Recursive partial override merging

Suggested commit:

```text
docs: explain working-volume analysis changes
```

---

# Final commit sequence

Red tests are written and run locally before their corresponding implementation. Failing tests are not committed separately unless the repository explicitly allows red commits.

1. `chore: activate test typechecking and fix surfaced errors`

   * Override inherited test exclusions.
   * Add the type-check script.
   * Verify all tests are included.
   * Fix all ten pre-existing test type errors.
   * Commit only after type-check, tests, and build pass.

2. `test: define volume-role import persistence`

3. `feat: preserve countsTowardVolume through program flows`

4. `test: define volume-role defaults and precedence`

5. `feat: add shared working-volume resolver`

6. `test: define manual-builder volume defaults`

7. `feat: assign manual-builder volume defaults`

8. `test: define gated weekly volume behavior`

9. `feat: gate weekly volume analysis`

10. `test: define within-tier muscle deduplication`

11. `fix: deduplicate canonical muscles within tag tiers`

12. `test: define total and working session sets`

13. `feat: split session set accounting`

    * This implementation commit atomically updates the type, producer, mapper, consumers, external sheet, and every complete fixture.

14. `test: define working-pattern balance`

15. `fix: gate balance analysis`

16. `test: define working-set periodization`

17. `fix: gate periodization and zero-volume comparisons`

18. `test: define canonical base-day resolution paths`

19. `fix: align warning paths with declared day numbers`

20. `test: define override warning and resolution behavior`

21. `fix: propagate and resolve override exercise warnings`

22. `test: define override diagnostics`

23. `feat: add import and runtime override diagnostics`

24. `test: define updated AI prompt contracts`

25. `feat: update all AI-facing routine prompts`

26. `test: add full working-volume integration coverage`

27. `docs: explain working-volume analysis changes`

Adjacent test and implementation commits may be combined into one atomic red-green commit when repository conventions prefer fewer commits. No committed state may leave the type-check, test suite, or build red.

---

# Definition of done

The implementation is complete only when all conditions below are true.

## Type and storage

1. `countsTowardVolume` survives camel-case and snake-case import.
2. Explicit `false` survives normalization.
3. Non-boolean strings are rejected.
4. Missing values remain undefined.
5. Backup, edit, and swap flows preserve the value.
6. Manual construction uses the shared section-default map.
7. Every supported section type has an exhaustive compile-time default.

## Analysis

8. Weekly volume uses the shared resolver.
9. Session working sets use the shared resolver.
10. Direct primary-muscle caps use the shared resolver.
11. Balance uses the shared resolver.
12. Periodization uses the shared resolver before section context is discarded.
13. Coverage inherits the gated volume result.
14. Total sets retain their existing meaning.
15. Working sets have a distinct type and display path.
16. Duration continues to include all prescribed activity.
17. Exercise count continues to include all exercise objects.
18. Zero-working-volume programs cannot produce false peak or deload classifications.
19. Within-tier muscle duplication is removed.
20. Cross-tier additive behavior remains unchanged.

## Resolution and overrides

21. Warning emission and resolution application use the same canonical paths.
22. Non-sequential day numbers cannot cause cross-day resolution.
23. Duplicate base-day checks run before week expansion.
24. Override warnings reach the shared import-warning collection.
25. Override unmatched exercises are resolvable.
26. Resolved warnings are removed by exact successfully applied paths.
27. Single and array replacement shapes are preserved.
28. Effective override weeks come from post-expansion program days.
29. Override applicability diagnostics remain advisory.
30. Existing stored inert overrides are diagnosable.
31. Generated prompts no longer teach reason-only or empty overrides.

## Prompt consistency

32. Routine generation explains the volume-role field.
33. External analysis uses total and working sets correctly.
34. Modify-with-AI preserves the field.
35. Volume ranges are described as advisory planning references.
36. Explicit specialization is allowed.
37. Numeric set counts must match written top-set and back-off prescriptions.

## Quality gate

38. The production TypeScript project passes.
39. The test TypeScript project passes.
40. The test project demonstrably includes all test files.
41. Jest passes.
42. The production build passes.
43. The full mixed-routine integration fixture passes.
44. The pure-mobility integration fixture passes.
45. No committed repository state leaves the gate red.

Required command:

```text
bun run typecheck
bun run test
bun run build
```
