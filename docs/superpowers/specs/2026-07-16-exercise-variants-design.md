# Exercise Variants — Design Spec

Date: 2026-07-16
Status: Approved for planning
Scope: import schema + parser + prompt builder. No runtime type or consumer changes.

## Problem

Week-to-week variation of a *single* exercise currently has no compact
expression. The only variation mechanism is `overrides` (see
`ProgramOverride` in `src/lib/programs/types.ts` and `parseOverrides` in
`src/lib/import/parser.ts`), which replaces a **whole day** for a week. If
week 2 does Stiff-Leg Deadlift instead of Deadlift but the rest of the day is
identical, the LLM must duplicate the entire day — every section, group, and
exercise — inside an override. That is:

- Token-expensive and error-prone for the model (it must re-emit every field,
  keeping the untouched exercises byte-consistent or the day silently drifts).
- Semantically wrong: an override says "this week's day is structurally
  different" (deload/test week), not "swap one movement."

We want a compact, inline way to say "on weeks N, this exercise becomes X."

## Design overview

Add an optional `variants` array to an **exercise** object in the imported
routine JSON. `variants` is **import-schema sugar only**: it is consumed and
fully desugared during parsing (`normalizePayload` → `expandDays`). After
expansion, `variants` does not exist anywhere in the stored
`ProgramDocument`. Runtime types (`ProgramExercise` etc.), analysis, logging,
rendering, and the entire overrides machinery are untouched — they never see a
`variants` field and require zero changes.

Desugaring rule: for each week that a variant claims, the day clone for that
week gets a **deep-cloned path down to the swapped exercise**, and that
exercise is replaced by the base exercise merged with the variant's sparse
fields, carrying a **fresh exercise id**. All other week clones keep today's
structural sharing (the `{...base}` shallow clone in `expandDays`).

## Raw schema

New optional `variants: Variant[]` on an exercise object. Each variant:

| field    | type       | required | meaning                                                        |
|----------|------------|----------|----------------------------------------------------------------|
| `weeks`  | `number[]` | yes      | 1-based week numbers this variant applies to (e.g. `[2]`, `[2,4]`) |
| `name`   | `string`   | no       | exercise name for these weeks; inherits base `name` if absent  |
| `sets`   | `number`   | no       | inherits base `sets` if absent                                 |
| `reps`   | `string`   | no       | inherits base `reps` if absent                                 |
| `load`   | `string`   | no       | inherits base `load` if absent                                 |
| `rest`   | `string`   | no       | inherits base `rest` if absent                                 |
| `tempo`  | `string`   | no       | inherits base `tempo` if absent                                |
| `notes`  | `string`   | no       | inherits base `notes` if absent                                |
| `countsTowardVolume` | `boolean` | no | inherits base value if absent                             |
| `tags`   | tag object | no       | inherits base `tags` if absent (see retag note below)          |

**Sparse inheritance**: any field absent on the variant inherits from the base
exercise. `weeks` is the only required field. `weeks` is an **array** so a
variant can alternate (`[2,4]` = weeks 2 and 4).

Example (a base Deadlift with two variant weeks):

```json
{
  "name": "Deadlift",
  "sets": 4,
  "reps": "5",
  "load": "80%",
  "countsTowardVolume": true,
  "tags": { "primary": ["glutes"], "secondary": ["hamstrings"], "incidental": ["core"], "modifiers": ["hinge"] },
  "variants": [
    { "weeks": [2], "name": "Stiff-Leg Deadlift" },
    { "weeks": [3], "name": "Deficit Deadlift", "load": "70%" }
  ]
}
```

Week 1 and 4 → base Deadlift. Week 2 → Stiff-Leg Deadlift (all other fields
inherited: `sets` 4, `reps` "5", `load` "80%"). Week 3 → Deficit Deadlift with
`load` "70%", everything else inherited.

## Parser behavior

### Where variants are held (pre-expansion, internal only)

`normalizeExercise` (`src/lib/import/parser.ts` ~line 278) parses the raw
`variants` array and attaches it to the normalized base exercise as an
**internal, non-persisted** field. It must NOT be part of the exported
`ProgramExercise` type. Introduce a parser-local carrier type:

```ts
type NormalizedVariant = {
  weeks: number[];
  fields: Partial<Pick<ProgramExercise,
    "name" | "sets" | "reps" | "load" | "rest" | "tempo" | "notes" | "countsTowardVolume" | "tags">>;
};
type WithVariants = ProgramExercise & { __variants?: NormalizedVariant[] };
```

`__variants` is stripped before the exercise is stored. Only `fields` keys
that were actually present in the raw variant are populated (that is what
drives sparse inheritance — an absent key means "inherit," never "set to
undefined"). Each variant's `name` goes through the same
`matchExercise(name, aliases, userExercises)` path as base names so a variant
resolves/warns identically (see Resolution & warnings).

Parsing steps inside `normalizeExercise`:
1. Parse the base exercise exactly as today.
2. If `exercise.variants` is a non-empty array, map each raw entry to a
   `NormalizedVariant`: coerce `weeks` to a de-duplicated array of positive
   integers (drop non-integer/≤0 entries); populate `fields` only for keys
   present; run `matchExercise` on the variant `name` (if present) and emit an
   ImportWarning on the variant path when unmatched (see below).
3. Attach `__variants` to the returned object; it is dropped at expansion.

### expandDays algorithm

`expandDays` (`src/lib/import/parser.ts` ~line 134) changes from a pure
shallow clone to a variant-aware clone. Current behavior (must be preserved
for the no-variant case exactly, including comment about `templateWeek` and
commit 524c46f invariants):

```ts
expanded.push({ ...base, id: newId("day"), weekNumber: week });
```

New behavior per (`week`, `base`) pair:

1. Collect every variant in this base day whose `weeks` includes `week`
   (walk sections → groups → exercises, reading `__variants`). Call this the
   week's **active swap set**, keyed by `(sectionIndex, groupIndex, exerciseIndex)`.
2. **If the active swap set is empty** → emit exactly today's shallow clone
   (`{ ...base, id: newId("day"), weekNumber: week }`), then strip
   `__variants` from all exercises in that clone. Structural sharing with
   other empty-swap weeks is preserved — this is the mechanical-expansion
   sharing the `expandDays` comment and paths.ts rely on.
3. **If the active swap set is non-empty** → produce a clone that is deep-copied
   ONLY along the paths to the swapped exercises:
   - Shallow-clone the day (`{ ...base, id: newId("day"), weekNumber: week }`).
   - For each affected `sectionIndex`, replace that section with a shallow copy
     whose `groups` array is a new array; for each affected `groupIndex`,
     replace that group with a shallow copy whose `exercises` array is a new
     array; at each affected `exerciseIndex`, replace the exercise with the
     **merged variant exercise** (below).
   - Unaffected sections/groups/exercises keep their existing object
     references (structural sharing preserved everywhere except the swap
     path). Section/group/exercise `id`s on the copied path are NOT
     regenerated (they carry no per-week identity today; only day `id` is
     fresh, matching current behavior) EXCEPT the swapped exercise, whose id
     IS regenerated (below).
   - Strip `__variants` from every exercise in the produced clone (both the
     merged variant exercise and any base exercises that carried variants for
     other weeks).

### Merged variant exercise

```ts
{
  ...base,               // base exercise (already stripped of __variants below)
  ...variant.fields,     // sparse override: only keys present on the variant
  id: newId("exercise"), // REQUIRED — see id semantics
  tags: retag(...),      // see retag note
  canonicalExerciseId: variant.name-present ? variantMatch : base.canonicalExerciseId,
}
```

- **Fresh exercise id is REQUIRED.** Variant weeks must not share the base
  exercise's id, or variant logs would pollute the base exercise's history
  (`WorkoutLogEntry.exerciseId` in `src/lib/programs/types.ts` keys logs by
  exercise id). Each week clone that carries the variant gets its OWN fresh id
  — i.e. week 2's Stiff-Leg and week 4's Stiff-Leg (from `[2,4]`) each get a
  distinct id, exactly as base exercises get a distinct clone id per week
  today via the day-level clone. (Note: today base exercises are *shared* by
  reference across weeks and thus share an id; that is acceptable because they
  are the same movement. Variants deliberately break that sharing.)
- **Retag semantics.** If the variant supplies its own `tags`, use them. If it
  does not but supplies a different `name`, the base tags are inherited
  unchanged (the base tags remain anatomically reasonable for a close
  variation, and the parser has no tagging engine). The `modifiers` array of
  the inherited/variant tags is left as-authored — we do NOT auto-inject the
  variant name into tags. Prompt guidance will instruct the model to supply
  `tags` on a variant when the muscle emphasis changes.
- `canonicalExerciseId`: if the variant has its own `name`, use that name's
  `matchExercise` result (matched id or `undefined` → warning). If the variant
  has no `name`, inherit the base's `canonicalExerciseId`.

### Post-condition

After `expandDays`, no object in `program.days` has a `__variants` (or
`variants`) key. `program.import.rawJson` still contains the original payload
verbatim (including `variants`) — that field is the untouched raw input and is
not consulted at runtime.

## Resolution & warnings

Variant names participate in exercise resolution exactly like base names,
using the shared path builders in `src/lib/import/paths.ts`.

### Path grammar

Extend the base exercise path with a `.variants.{v}` suffix. Add a builder to
`paths.ts` alongside `baseExercisePath`:

```ts
export function variantExercisePath(
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
  variantIndex: number,
): string {
  return `${baseExercisePath(dayNumber, templateWeek, sectionIndex, groupIndex, exerciseIndex)}.variants.${variantIndex}`;
}
```

Concrete example (day 4, no explicit template week, section 2, group 0,
exercise 0, first variant):
`days.4.sections.2.groups.0.exercises.0.variants.0`

`variantIndex` is the index into the exercise's raw `variants` array (NOT a
week number), so two variants on the same exercise get distinct paths even if
their `weeks` overlap. The `dayPathSegment` template-week rule
(`{dayNumber}@w{templateWeek}` when explicit, `{dayNumber}` otherwise) is
reused unchanged — variants inherit the base day's template identity.

### Warning emission

When a variant's `name` is present and `matchExercise` returns `unmatched`,
`normalizeExercise` pushes an ImportWarning with:
- `path`: `variantExercisePath(...)`
- `rawName`: the variant name (so `extractUnresolvedExercises` in
  `src/lib/import/resolution.ts` treats it as an exercise-resolution item —
  `w.rawName !== undefined` is the discriminator there)
- `message`: `"${variantName} was imported without a catalog match."`
  (matches the regex in `extractUnresolvedExercises`)
- `sectionType`: the enclosing section type (same as base)
- `suggestions`: `match.suggestions`

### Resolution application

`applyResolutions` in `src/lib/import/resolution.ts` patches exercises by
walking `program.days` and rebuilding each exercise's path via
`baseExercisePath(d.dayNumber, d.templateWeek, ...)`. **Variants are already
desugared by the time resolution runs** — the swapped exercise is a normal
`ProgramExercise` sitting in the day, and it has NO `canonicalExerciseId` if
its variant name was unmatched. But its resolution key is the **variant path**
(`...exercises.{e}.variants.{v}`), not the base path
(`...exercises.{e}`), because that is the path its warning was emitted under.

Therefore `patchExercise` cannot find variant swaps with the base-path
traversal alone. Worse, the current `patchExercise`
(`src/lib/import/resolution.ts:139`) patches by slot path alone, guarded only
by a missing `canonicalExerciseId` — with variants in play, a base-path
resolution would mis-patch a variant-week exercise occupying the same slot
(base "Deadlift" resolution applied to week-2 "Stiff-Leg Deadlift").

**Mechanism (name-guarded slot resolution):**

`applyResolutions` builds a `path → rawName` map from
`program.import.warnings` (each exercise-resolution warning carries
`rawName`; warnings are only filtered at the END of `applyResolutions`, so
the map is complete during patching). For each exercise slot, the candidate
paths are the base path plus every `basePath + ".variants.{v}"` path present
in either `resolutions` or the warning map.

`patchExercise(ex, slotPaths)` then:
1. Skips if `ex.canonicalExerciseId` is set (unchanged).
2. Among the slot's candidate paths, selects the one whose warning `rawName`
   equals `ex.name`. A path with no warning entry (name matched at import,
   so no resolution needed) is never a candidate.
3. Applies that path's resolution if present (and not `CUSTOM_ID`), marking
   exactly that path resolved.

This name guard is what prevents cross-patching in BOTH directions: base
resolution only lands on clones whose `name` is the base rawName; a
`variants.{v}` resolution only lands on clones whose `name` is that variant's
rawName. For slots with no variants, exactly one candidate path exists (the
base path) and, since its warning's `rawName` is by construction the
exercise's imported `name`, behavior is identical to today.

This keeps every week-clone carrying a given variant patched by a single
resolution (same "one resolution patches all week clones" invariant as base
exercises), because all those clones share the variant `name` under the same
base slot and template identity.

Ambiguity guard: the existing `findAmbiguousDayGroups` check (duplicate base
day numbers) still applies and skips resolution for ambiguous day groups. A
slot with two variants that resolve to different canonical ids but share a
`name` is impossible (same rawName → same resolution key aggregation); two
variants with different names under one slot get different `variants.{v}`
paths and different rawNames, so they never collide.

## Diagnostics

All variant diagnostics are **warnings, never errors** (parsing always
succeeds; a bad variant degrades gracefully). Emit via the shared `warnings`
array so they surface in `program.import.warnings`. These are STRUCTURAL
warnings (no `rawName`) so `extractUnresolvedExercises` never treats them as
resolution items.

1. **Variant week exceeds program `weeks`.** When a variant's `weeks` contains
   a value `> lengthWeeks`, emit:
   `path`: the base exercise path (`baseExercisePath(...)`),
   `message`: `"Variant week ${w} for \"${name}\" exceeds the program length (${lengthWeeks} weeks) and was ignored."`
   The out-of-range week is dropped from the active swap computation (no clone
   exists for it). Runs during/after expansion where `lengthWeeks` is known.
2. **`variants` on a single-week program.** When `lengthWeeks` is undefined or
   ≤1 and any exercise declares `variants`, emit once per such exercise:
   `message`: `"Variants on \"${name}\" were ignored because the program is a single week."`
   `expandDays` returns `baseDays` unchanged for single-week programs, so
   variants are inherently ignored; the warning makes the no-op explicit.
3. **Two variants claiming the same week.** When two variants on the same
   exercise both include week `w`, the **later one wins** (last in the raw
   `variants` array). Emit:
   `message`: `"Multiple variants of \"${name}\" claim week ${w}; the last one (\"${laterName}\") was used."`
   "Later wins" is implemented by building the active swap set as a map keyed
   by slot, iterating variants in array order, and letting later entries
   overwrite earlier for the shared week.

## Override interaction

Overrides win. Documentation only — no special code.

Order of operations: `variants` desugar at parse time inside `expandDays`
(producing `program.days`). Week/day overrides apply later, at render time, in
`getRenderableDays` (`src/lib/programs/overrides.ts`), which reduces
`program.overrides` over `program.days`. A week-scope override replaces the
whole matching day (`applyOverride` swaps the entire `ProgramDay` content,
preserving only the slot's `id`/`weekNumber`/`dayNumber`). So if week 3 has
BOTH a Deficit-Deadlift variant AND a week-3 override, the override's
replacement day fully supersedes the expanded (variant-carrying) day — the
variant is not rendered that week.

Guidance implication for the prompt: variants are for single-exercise swaps in
weeks that otherwise follow the base template; overrides are for structurally
different weeks. If a week is already fully overridden, put its exercise
changes in the override, not in `variants`.

## Prompt builder changes

`src/lib/prompts/builder.ts`. Both prompt paths must teach the mechanism
unmistakably:

### 1. `buildSchemaBlock` — schema example (~line 4, the `exDay` example)

Add a `variants` field to the example exercise in `exDay` so the emitted
schema block shows it inline. Draft:

```ts
const exDay = {
  day: 1,
  title: "Day Name",
  sections: [
    {
      name: "Section Name",
      type: "strength",
      groups: [
        {
          type: "single",
          exercises: [
            {
              name: "Exercise Name",
              sets: 3,
              reps: "5-8",
              load: "optional — e.g. '80% 1RM' or '60 kg'",
              rest: "optional — e.g. '90s'",
              notes: "optional",
              countsTowardVolume: true,
              variants: [
                {
                  weeks: [2, 4],
                  name: "A week-specific swap of this ONE exercise — omit any field to inherit it from the base exercise above",
                  load: "optional — only include fields that differ from the base"
                }
              ],
              tags: {
                primary: ["quads"],
                secondary: ["glutes"],
                incidental: [],
                modifiers: []
              }
            }
          ]
        }
      ]
    }
  ]
};
```

### 2. Guidance line — add to `multiWeekInstructions` (~line 160)

Append a bullet:

> - Use `variants` (an optional array on any exercise) to swap or retune ONE
>   exercise on specific weeks while the rest of the day stays on the base
>   template — e.g. `"variants": [{"weeks": [2], "name": "Stiff-Leg Deadlift"}]`.
>   Each variant lists the 1-based `weeks` it applies to; any field you omit
>   (`sets`, `reps`, `load`, `name`, `tags`, …) is inherited from the base
>   exercise. Supply `tags` on a variant only when the muscle emphasis changes.
>   Reserve `overrides` for weeks whose STRUCTURE differs (deload, test week,
>   added/removed exercises); do not use an override just to swap one movement.

### 3. Schema hierarchy note — `buildSchemaBlock` return array (~line 196-214)

Add a line to the bullet list describing each exercise's optional fields:

> "  - Each exercise: `name`, `sets`, `reps`, `countsTowardVolume`, `tags`, and optionally `load`, `rest`, `notes`, `variants`"

And extend the "Each group" line context so the hierarchy remains explicit.

### 4. GENERATE IT re-emit rules — `buildRecoveryPrompt` (~line 217) and `outputContract` (~line 174)

`buildRecoveryPrompt` re-emits by pointing at "the schema from earlier in this
conversation," so it inherits the updated schema automatically. No literal
example lives there, but add one line to its `contract` array so a
re-emission preserves variants:

> "- Preserve any `variants` arrays exactly as in the schema — they encode week-specific single-exercise swaps."

`outputContract` (used after GENERATE IT) already says "Use the exact field
names and structure from the schema above," which now includes `variants`. No
change needed beyond the schema example, but verify the snapshot test covers
it.

## Test plan

### Fixture

New fixture `src/lib/import/__fixtures__/variants-multiweek.json`, styled like
`knee-conscious-powerbuilding-cut.json` (single-line JSON, realistic content).
Requirements:
- `weeks`: a multi-week program (e.g. 4 weeks).
- At least one exercise with a **sparse-override variant** (variant supplies
  `name` + `load`, inherits `sets`/`reps`/`tags`).
- At least one exercise with an **alternating variant** (`"weeks": [2, 4]`).
- At least one variant whose `name` is a catalog miss (to exercise the
  resolution/warning path) and one that resolves cleanly.
- Include an `overrides` block for one week that overlaps a variant week, to
  exercise the "override wins" documentation case in tests.
- Fixtures must make the mechanism visually obvious (comment-free JSON, but
  clear exercise/variant names like "Deadlift" → "Stiff-Leg Deadlift").

### Parser tests (`src/lib/import/parser.test.ts`)

1. **Parsing**: a variant produces the expected per-week exercise names across
   the expanded `program.days`.
2. **Sparse inheritance**: variant with only `name` inherits base `sets`,
   `reps`, `load`, `tags`; variant with `name` + `load` overrides only `load`.
3. **Fresh ids**: the swapped exercise's `id` differs from the base
   exercise's id, AND from the same variant's id in a different week (the
   `[2,4]` case → two distinct ids). Base (non-swapped) weeks keep their
   shared clone identity.
4. **Deep-clone isolation of the swap path**: mutating the swapped exercise in
   one week does not affect any other week; the swapped section/group are new
   objects.
5. **Sharing preserved elsewhere**: for a variant week, sibling sections/groups
   (not on the swap path) are the SAME object reference as in a non-variant
   week clone (assert reference identity, mirroring the 524c46f invariant).
6. **No `variants`/`__variants` leak**: deep-scan the stored `program.days`
   and assert neither key appears on any object.
7. **canonicalExerciseId**: a variant with a resolvable name gets its own
   `canonicalExerciseId`; a variant without a `name` inherits the base's.

### Diagnostics tests (`src/lib/import/parser.test.ts`)

8. Variant week `> weeks` → warning emitted, week dropped, parse succeeds.
9. `variants` on a single-week program (no `weeks` / `weeks:1`) → warning,
   variants ignored, base exercise unchanged.
10. Two variants claiming the same week → later wins; warning emitted.

### Resolution-path tests (`src/lib/import/resolution.test.ts`)

11. Unmatched variant name → `extractUnresolvedExercises` yields an item with
    path `...exercises.{e}.variants.{v}` and correct `rawName`/`sectionType`.
12. `applyResolutions` with a resolution for a `variants.{v}` path patches the
    swapped exercise in EVERY week clone carrying that variant (assert all
    week-2 and week-4 clones for a `[2,4]` variant get `canonicalExerciseId`),
    and removes the corresponding warning.
13. Base-exercise resolution still patches the non-variant weeks and does not
    accidentally patch the variant slot (distinct paths, distinct rawNames).
14. Ambiguous base day number still short-circuits resolution for variant
    slots too.

### Prompt builder tests (`src/lib/prompts/builder.test.ts`)

15. Content assertions: `buildSchemaBlock()` output contains a
    `variants` key, the `[2, 4]` example weeks array, and the new
    `multiWeekInstructions` guidance sentence (assert on substrings so the
    snapshot stays legible).
16. `buildRecoveryPrompt()` output contains the "Preserve any `variants`
    arrays" contract line.

## Out of scope

- **UI editing of variants post-import.** Variants are desugared at parse
  time; there is no runtime representation to edit. Editing a swapped week's
  exercise post-import is just editing that expanded `ProgramExercise`, via
  whatever exercise-editing UI exists (none added here).
- **Runtime `variants`.** No `variants` field on `ProgramExercise` or any
  stored type. No analysis/logging/rendering awareness of variants.
- **Variant-of-a-variant / nested variants.** A variant cannot itself carry
  `variants`; nested `variants` on a variant object are ignored (not parsed).
- **Overrides interacting specially with variants.** Overrides win by virtue
  of running later at render time; no coordinating code is added.
- **Cross-day or section-level variants.** Variants swap a single exercise in
  place; they cannot add/remove exercises, change group structure, or move an
  exercise between sections. Structural week differences remain `overrides`.
- **Auto-retagging by variant name.** The parser does not infer muscle tags
  from a variant's name; the model supplies `tags` when emphasis changes.
