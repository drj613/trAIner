# Exercise Variants — Implementation Plan

Date: 2026-07-16
Spec: `docs/superpowers/specs/2026-07-16-exercise-variants-design.md`
Status: Ready to execute

## Conventions

- Test runner: `npm test` (jest). Scope a file with `npm test -- <path-or-pattern>`.
- Typecheck: `npm run typecheck` (runs `tsc --noEmit` against `tsconfig.json`
  AND `tsconfig.test.json` — both must pass; test files are typechecked).
- Build: `npm run build` (vite build).
- Lint: `npm run lint`.
- TDD: within each stage, write the listed tests FIRST, run them and see them
  fail for the right reason, then implement, then see them pass.
- Do not modify runtime types (`ProgramExercise` etc.) — variants are
  parse-time-only sugar. `__variants` is a parser-local carrier, never exported
  on a stored type.

Stage order (each stage independently verifiable):
1. `paths.ts` variant path builder
2. `normalizeExercise` variant parsing + resolution warnings
3. `expandDays` variant-aware expansion
4. Diagnostics (over-length weeks, single-week, duplicate-week)
5. `applyResolutions` name-guarded slot resolution
6. Prompt builder changes
7. Fixture + integration parser/resolution tests
8. Full-suite gate + leak scan

---

## Stage 1 — Variant path builder (`paths.ts`)

### Files
- `src/lib/import/paths.ts` (implementation)
- `src/lib/import/paths.test.ts` (new test file if none exists; otherwise add
  to the existing one — check first with `ls src/lib/import/paths.test.ts`)

### Tests first
Add `describe("variantExercisePath")` with:
- `test("appends .variants.{v} to the base path for a template-less day")`:
  `variantExercisePath(4, undefined, 2, 0, 0, 0)` === `"days.4.sections.2.groups.0.exercises.0.variants.0"`.
- `test("preserves the @w templateWeek segment")`:
  `variantExercisePath(1, 3, 0, 0, 0, 1)` === `"days.1@w3.sections.0.groups.0.exercises.0.variants.1"`.
- `test("is a strict prefix-extension of baseExercisePath")`:
  assert `variantExercisePath(d,tw,s,g,e,v)` === `baseExercisePath(d,tw,s,g,e) + ".variants." + v` for a couple of tuples.

### Implementation
In `src/lib/import/paths.ts`, after `overrideExercisePath` (ends line 46), add:

```ts
// Variant resolution path: the base exercise path plus a `.variants.{v}`
// suffix, where `v` is the index into the exercise's RAW `variants` array
// (not a week number). Two variants on one exercise get distinct paths even
// when their weeks overlap. Variants inherit the base day's template identity
// via baseExercisePath, so one resolution patches every week-clone carrying
// the variant. Keep in lockstep with baseExercisePath.
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

### Verify
`npm test -- paths` then `npm run typecheck`.

---

## Stage 2 — Variant parsing + resolution warnings (`normalizeExercise`)

Parses raw `variants` into an internal `__variants` carrier on the normalized
base exercise, and emits catalog-miss warnings on the variant path. No
expansion yet.

### Files
- `src/lib/import/parser.ts`
- `src/lib/import/parser.test.ts`

### Tests first (in `parser.test.ts`)
These assert on `program.import.warnings` and, for the carrier, use a small
helper that reaches into the pre-expansion structure. Because `__variants` is
stripped at expansion, test the carrier indirectly through warnings here; the
per-week behavior is tested in Stage 3. Concrete tests:
- `test("emits a variant warning on the variants.{v} path for an unmatched variant name")`:
  build a 1-day payload (`weeks` omitted for now — warning still emits at parse
  of the exercise) with a base exercise plus
  `variants: [{ weeks: [2], name: "Totally Fake Movement XYZ" }]`. Expect a
  warning whose `path` ends with `.exercises.0.variants.0`, `rawName` ===
  `"Totally Fake Movement XYZ"`, `message` matches
  `/^Totally Fake Movement XYZ was imported without a catalog match\.$/`, and
  `sectionType` equals the section's type.
- `test("does not emit a variant warning when the variant name resolves")`:
  use a name that `matchExercise` resolves (reuse a name known-good in existing
  parser tests, e.g. one already asserted as matched elsewhere) → no
  `.variants.` warning present.
- `test("does not emit a variant warning when the variant omits name")`:
  `variants: [{ weeks: [2], load: "70%" }]` → no `.variants.` warning (a
  name-less variant inherits the base name/match; nothing new to resolve).
- `test("extractUnresolvedExercises surfaces the variant warning as a resolution item")`
  (in `resolution.test.ts` is also fine, but a quick check here): feed the
  produced warnings to `extractUnresolvedExercises` and assert the variant
  path appears with the variant rawName.

### Implementation
1. Add carrier types near the top of `parser.ts` (after the imports / near
   `ImportPayload`):

```ts
type NormalizedVariant = {
  weeks: number[];
  fields: Partial<Pick<ProgramExercise,
    "name" | "sets" | "reps" | "load" | "rest" | "tempo" | "notes" | "countsTowardVolume" | "tags">>;
  // Resolved match for the variant name, when the variant supplied a name.
  canonicalExerciseId?: ID;
  hasName: boolean;
};
type WithVariants = ProgramExercise & { __variants?: NormalizedVariant[] };
```

2. `normalizeExercise` currently receives `(exercise, path, warnings, aliases,
   userExercises, sectionType)` and builds the ProgramExercise. It needs the
   structural coordinates to build the variant path. The `path` it receives is
   already the base exercise path (built by `pathBuilder(...)` in
   `normalizeGroup`). Build the variant path by suffixing that base path:
   `${path}.variants.${variantIndex}`. (This is equivalent to
   `variantExercisePath(...)` — reuse the string form to avoid re-threading all
   the indices. Do NOT hand-assemble the base portion; only append the
   `.variants.{v}` suffix to the already-correct `path`.)

3. After computing the base `ProgramExercise` fields (existing code lines
   ~302-314), before returning, build variants:

```ts
const variants = parseVariants(exercise.variants, path, warnings, aliases, userExercises, sectionType);
const result: WithVariants = { /* existing fields */ };
if (variants.length > 0) result.__variants = variants;
return result;
```

4. Add `parseVariants`:

```ts
function parseVariants(
  raw: unknown,
  basePath: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  sectionType: string,
): NormalizedVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedVariant[] = [];
  raw.forEach((entry, variantIndex) => {
    if (!isRecord(entry)) return;
    const weeks = normalizeVariantWeeks(entry.weeks);
    const fields: NormalizedVariant["fields"] = {};
    // Populate ONLY keys present in the raw entry (sparse inheritance).
    const name = optionalString(entry.name);
    if (name !== undefined) fields.name = name.replace(/^[a-z]\.\s+/i, "");
    if (optionalNumber(entry.sets) !== undefined) fields.sets = optionalNumber(entry.sets);
    if (optionalString(entry.reps) !== undefined) fields.reps = optionalString(entry.reps);
    const load = optionalString(entry.load ?? entry.weight);
    if (load !== undefined) fields.load = load;
    if (optionalString(entry.rest) !== undefined) fields.rest = optionalString(entry.rest);
    const tempo = normalizeTempo(entry);
    if (tempo !== undefined) fields.tempo = tempo;
    if (optionalString(entry.notes) !== undefined) fields.notes = optionalString(entry.notes);
    const ctv = optionalBoolean(entry.countsTowardVolume) ?? optionalBoolean(entry.counts_toward_volume);
    if (ctv !== undefined) fields.countsTowardVolume = ctv;
    if (isRecord(entry.tags)) {
      fields.tags = {
        primary: stringArray(entry.tags.primary),
        secondary: stringArray(entry.tags.secondary),
        incidental: stringArray(entry.tags.incidental),
        modifiers: stringArray(entry.tags.modifiers),
      };
    }
    let canonicalExerciseId: ID | undefined;
    const hasName = fields.name !== undefined;
    if (hasName) {
      const match = matchExercise(fields.name!, aliases, userExercises);
      if (match.kind === "matched") {
        canonicalExerciseId = match.item.id;
      } else {
        warnings.push({
          path: `${basePath}.variants.${variantIndex}`,
          message: `${fields.name} was imported without a catalog match.`,
          rawName: fields.name,
          suggestions: match.suggestions,
          sectionType,
        });
      }
    }
    out.push({ weeks, fields, canonicalExerciseId, hasName });
  });
  return out;
}

// De-duplicated positive integers, preserving first-seen order.
function normalizeVariantWeeks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const weeks: number[] = [];
  for (const v of value) {
    if (typeof v === "number" && Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      weeks.push(v);
    }
  }
  return weeks;
}
```

Notes:
- Mirror `normalizeExercise`'s existing name cleanup (`replace(/^[a-z]\.\s+/i, "")`)
  for the variant name.
- Reuse existing helpers (`optionalString`, `optionalNumber`, `optionalBoolean`,
  `stringArray`, `normalizeTempo`, `isRecord`, `matchExercise`).
- The `variantIndex` in the warning path is the index into the RAW array
  (before filtering non-records), which is what `forEach` gives — keep it so
  the path matches what a resolution UI addressing the raw JSON would compute.

### Verify
`npm test -- parser` then `npm run typecheck`.

---

## Stage 3 — Variant-aware expansion (`expandDays`)

Desugars `__variants` into per-week day clones, deep-cloning only the swap
path, and strips `__variants` everywhere. This is the structural core.

### Files
- `src/lib/import/parser.ts`
- `src/lib/import/parser.test.ts`

### Tests first (parser.test.ts) — spec Test plan items 1-7
Use a 4-week payload built inline (or the Stage 7 fixture once it exists; for
this stage build inline so the stage is self-contained):
base day 1 with a Deadlift exercise carrying
`variants: [{ weeks: [2], name: "Stiff-Leg Deadlift" }, { weeks: [3], name: "Deficit Deadlift", load: "70%" }]`
and a second exercise with `variants: [{ weeks: [2,4], name: "Front Squat" }]`.
Weeks = 4.

- `test("expands variant names per week")`: gather the Deadlift-slot exercise
  name in weeks 1-4 → `["Deadlift","Stiff-Leg Deadlift","Deficit Deadlift","Deadlift"]`.
- `test("sparse inheritance keeps base fields, overrides only present ones")`:
  week-2 Stiff-Leg has base `sets`/`reps`/`load`; week-3 Deficit has base
  `sets`/`reps` but `load` === "70%".
- `test("swapped exercise gets a fresh id distinct from base and from other variant weeks")`:
  base-week (w1) Deadlift id !== w2 id !== w3 id; for the `[2,4]` Front Squat,
  w2 id !== w4 id.
- `test("deep-clones only the swap path — mutating one week's swapped exercise does not affect others")`:
  mutate `w2` swapped exercise `.notes`; assert `w1`/`w3`/`w4` unchanged;
  assert the swapped section object and group object in w2 are NOT the same
  reference as in w1.
- `test("structural sharing preserved for siblings not on the swap path")`:
  a sibling section (no variant in it) is the SAME object reference in w2 as in
  w1 (mirrors the 524c46f mechanical-expansion invariant). Also: a day with NO
  active variants for its week is the plain shallow clone (siblings shared).
- `test("no variants/__variants key leaks into stored program.days")`:
  deep-scan every object in `program.days` (recursive walk) and assert neither
  `"variants"` nor `"__variants"` key is present.
- `test("canonicalExerciseId: named variant carries its own match; nameless inherits base")`:
  a variant with a resolvable name → its own `canonicalExerciseId`; a
  `{ weeks:[2], load:"70%" }` variant (no name) → same `canonicalExerciseId`
  as base.

### Implementation
Rewrite `expandDays` (lines 134-148). Keep the single-week early return and
the `{...base}` comment. New shape:

```ts
function expandDays(baseDays: ProgramDay[], lengthWeeks: number | undefined, warnings: ImportWarning[]): ProgramDay[] {
  // Single-week (or no weeks): return base days but STRIP any __variants
  // carrier so it never leaks. Diagnostics for variants-on-single-week are
  // emitted in Stage 4 via diagnoseVariants (called from normalizePayload).
  if (!lengthWeeks || lengthWeeks <= 1) {
    return baseDays.map(stripDayVariants);
  }
  const expanded: ProgramDay[] = [];
  for (let week = 1; week <= lengthWeeks; week++) {
    for (const base of baseDays) {
      expanded.push(expandOneDay(base, week));
    }
  }
  return expanded;
}
```

`expandOneDay`:

```ts
// Produces the week-clone of `base`. If no variant is active this week, it is
// today's shallow clone with __variants stripped (structural sharing with
// other empty-swap weeks preserved). If variants ARE active, only the
// section/group/exercise objects on each swap path are freshly cloned; every
// other object keeps its reference.
function expandOneDay(base: ProgramDay, week: number): ProgramDay {
  // activeSwaps: key "s:g:e" -> chosen NormalizedVariant for THIS week.
  // Built in variant-array order so a later variant claiming the same week
  // overwrites an earlier one ("later wins"), matching Diagnostics rule 3.
  const activeSwaps = collectActiveSwaps(base, week);
  const day: ProgramDay = { ...base, id: newId("day"), weekNumber: week };
  if (activeSwaps.size === 0) {
    day.sections = base.sections.map(stripSectionVariants);
    return day;
  }
  day.sections = base.sections.map((section, si) => {
    // Does this section contain any active swap this week?
    const anyInSection = [...activeSwaps.keys()].some((k) => k.startsWith(`${si}:`));
    if (!anyInSection) return stripSectionVariants(section);
    return {
      ...section,
      groups: section.groups.map((group, gi) => {
        const anyInGroup = [...activeSwaps.keys()].some((k) => k.startsWith(`${si}:${gi}:`));
        if (!anyInGroup) return stripGroupVariants(group);
        return {
          ...group,
          exercises: group.exercises.map((ex, ei) => {
            const swap = activeSwaps.get(`${si}:${gi}:${ei}`);
            return swap ? mergeVariant(ex as WithVariants, swap) : stripExerciseVariants(ex);
          }),
        };
      }),
    };
  });
  return day;
}
```

`collectActiveSwaps`:

```ts
function collectActiveSwaps(base: ProgramDay, week: number): Map<string, NormalizedVariant> {
  const active = new Map<string, NormalizedVariant>();
  base.sections.forEach((section, si) => {
    section.groups.forEach((group, gi) => {
      group.exercises.forEach((ex, ei) => {
        const variants = (ex as WithVariants).__variants;
        if (!variants) return;
        // Iterate in array order so later variants overwrite earlier for the
        // same week (Diagnostics rule 3, "later wins").
        for (const v of variants) {
          if (v.weeks.includes(week)) active.set(`${si}:${gi}:${ei}`, v);
        }
      });
    });
  });
  return active;
}
```

`mergeVariant` — implements the spec's "Merged variant exercise":

```ts
function mergeVariant(base: WithVariants, variant: NormalizedVariant): ProgramExercise {
  const { __variants, ...baseFields } = base; // drop carrier
  const merged: ProgramExercise = {
    ...baseFields,
    ...variant.fields,          // sparse: only present keys override
    id: newId("exercise"),      // fresh id per clone (log-history isolation)
    canonicalExerciseId: variant.hasName ? variant.canonicalExerciseId : baseFields.canonicalExerciseId,
  };
  return merged;
}
```

Note: `variant.fields.tags` (when present) overrides via the spread; when
absent, base tags are inherited unchanged — no auto-retag (spec "Retag
semantics").

Strip helpers (drop `__variants` without regenerating any id — non-swap clones
must keep structural sharing where they already do; these produce NEW objects
only when a carrier is present, else return the input unchanged to preserve
sharing):

```ts
function stripExerciseVariants(ex: ProgramExercise): ProgramExercise {
  if (!(ex as WithVariants).__variants) return ex;
  const { __variants, ...rest } = ex as WithVariants;
  return rest;
}
function stripGroupVariants(g: ProgramGroup): ProgramGroup {
  if (!g.exercises.some((e) => (e as WithVariants).__variants)) return g;
  return { ...g, exercises: g.exercises.map(stripExerciseVariants) };
}
function stripSectionVariants(s: ProgramSection): ProgramSection {
  if (!s.groups.some((g) => g.exercises.some((e) => (e as WithVariants).__variants))) return s;
  return { ...s, groups: s.groups.map(stripGroupVariants) };
}
function stripDayVariants(d: ProgramDay): ProgramDay {
  if (!d.sections.some((s) => s.groups.some((g) => g.exercises.some((e) => (e as WithVariants).__variants)))) return d;
  return { ...d, sections: d.sections.map(stripSectionVariants) };
}
```

Wire-up: `normalizePayload` (line 79) calls `expandDays(baseDays, lengthWeeks)`.
Change to `expandDays(baseDays, lengthWeeks, warnings)`. The `warnings` param
is added now because Stage 4 diagnostics need it inside the expansion path
(over-length weeks). If you prefer to keep Stage 3's `expandDays` signature
without warnings and add it in Stage 4, that is acceptable — but adding it now
avoids a second signature churn.

Edge cases to honor:
- A base exercise carrying variants but with NO variant active this week is
  emitted via `stripExerciseVariants` (carrier removed, base fields intact,
  original id preserved — same shared-clone semantics as today).
- Sharing invariant: for an empty-swap week, `expandOneDay` returns
  `{...base, id, weekNumber, sections: base.sections.map(stripSectionVariants)}`;
  when NO exercise in the day has a carrier, `stripSectionVariants` returns the
  same references, so siblings remain shared exactly as today. When some
  exercise has a carrier for OTHER weeks, that day's sections are rebuilt to
  drop the carrier — acceptable (still no swap, just carrier removal). Test 5
  should target a day/section that has NO carriers at all for the pure-sharing
  assertion, and separately assert the swap-path deep-clone for the
  carrier-bearing section.

### Verify
`npm test -- parser` then `npm run typecheck`.

---

## Stage 4 — Diagnostics

Three warnings (never errors): over-length variant week, variants on
single-week program, duplicate-week (later wins). Spec Diagnostics 1-3.

### Files
- `src/lib/import/parser.ts`
- `src/lib/import/parser.test.ts`

### Tests first (parser.test.ts) — spec Test plan items 8-10
- `test("variant week beyond program length is dropped with a warning")`:
  `weeks: 3`, variant `{ weeks: [2, 5], name: "X" }`. Assert week-2 clone has
  the swap, no week-5 clone exists (only 3 weeks), and a warning message
  contains `exceeds the program length (3 weeks)`. Base path is the base
  exercise path.
- `test("variants on a single-week program are ignored with a warning")`:
  `weeks` omitted, exercise has `variants: [{weeks:[2],name:"X"}]`. Assert
  `program.days` equals the single base day, the exercise name is the base
  name, and a warning message contains `ignored because the program is a single week`.
- `test("duplicate week across two variants: later wins, with a warning")`:
  `variants: [{weeks:[2],name:"First"},{weeks:[2],name:"Second"}]`, weeks: 2.
  Assert week-2 exercise name === "Second" and a warning message contains
  `Multiple variants of` and `the last one ("Second")`.

### Implementation
Add a `diagnoseVariants(baseDays, lengthWeeks, warnings)` invoked from
`normalizePayload` (after `parseBaseDays`, before/around `expandDays`). It
walks base days reading `__variants` and emits the three warning classes. Use
`baseExercisePath(day.dayNumber, day.templateWeek, si, gi, ei)` for the path
(structural warning, no `rawName`).

```ts
function diagnoseVariants(baseDays: ProgramDay[], lengthWeeks: number | undefined, warnings: ImportWarning[]): void {
  const singleWeek = !lengthWeeks || lengthWeeks <= 1;
  for (const day of baseDays) {
    day.sections.forEach((section, si) => {
      section.groups.forEach((group, gi) => {
        group.exercises.forEach((ex, ei) => {
          const variants = (ex as WithVariants).__variants;
          if (!variants || variants.length === 0) return;
          const path = baseExercisePath(day.dayNumber, day.templateWeek, si, gi, ei);
          if (singleWeek) {
            warnings.push({ path, message: `Variants on "${ex.name}" were ignored because the program is a single week.` });
            return; // do not also emit over-length/dup warnings for single-week
          }
          // Over-length weeks
          const over = new Set<number>();
          for (const v of variants) for (const w of v.weeks) if (w > lengthWeeks!) over.add(w);
          for (const w of [...over].sort((a, b) => a - b)) {
            warnings.push({ path, message: `Variant week ${w} for "${ex.name}" exceeds the program length (${lengthWeeks} weeks) and was ignored.` });
          }
          // Duplicate week across variants (later wins)
          const claimant = new Map<number, string>(); // week -> variant display name
          for (const v of variants) {
            const vName = v.fields.name ?? ex.name;
            for (const w of v.weeks) {
              if (w > lengthWeeks!) continue; // already warned + dropped
              if (claimant.has(w)) {
                warnings.push({ path, message: `Multiple variants of "${ex.name}" claim week ${w}; the last one ("${vName}") was used.` });
              }
              claimant.set(w, vName);
            }
          }
        });
      });
    });
  }
}
```

Interaction with expansion: `collectActiveSwaps` already ignores weeks that
never occur (loop only runs 1..lengthWeeks), so over-length weeks are naturally
dropped; "later wins" is already implemented by the `set` overwrite in
`collectActiveSwaps`. `diagnoseVariants` only ADDS the warnings; it does not
change expansion behavior. Ensure the duplicate-week message reports the
WINNING (later) variant name — it fires when a SECOND claim is seen and names
the second claimant, matching the spec wording (`the last one`).

Call site in `normalizePayload`:
```ts
const baseDays = parseBaseDays(...);
...
diagnoseVariants(baseDays, lengthWeeks, warnings); // after lengthWeeks is computed (line ~75), before expandDays
const days = expandDays(baseDays, lengthWeeks, warnings);
```
`lengthWeeks` is computed at line 75; place `diagnoseVariants` between line 75
and the `expandDays` call at line 79.

### Verify
`npm test -- parser` then `npm run typecheck`.

---

## Stage 5 — Name-guarded slot resolution (`applyResolutions`)

Make resolution variant-aware without cross-patching base and variant
exercises that share a slot. Spec "Resolution application".

### Files
- `src/lib/import/resolution.ts`
- `src/lib/import/resolution.test.ts`

### Tests first (resolution.test.ts) — spec Test plan items 11-14
- `test("extractUnresolvedExercises surfaces a variant path item")`
  (may already be covered in Stage 2; keep one here): given warnings with a
  `.variants.0` unmatched entry, the item has that path, correct `rawName`,
  `sectionType`.
- `test("a variants.{v} resolution patches every week-clone carrying that variant")`:
  build a real imported program (parse a payload with a `[2,4]` variant whose
  name is a catalog miss), run `applyResolutions` with a `Resolution` for the
  `.variants.{v}` path → both the week-2 and week-4 swapped exercises get
  `canonicalExerciseId`; the base-week (w1/w3) exercises are untouched; the
  variant warning is removed from `program.import.warnings`.
- `test("a base resolution does not patch the variant-week exercise in the same slot")`:
  base name unmatched + variant name unmatched, both in the same slot. Provide
  ONLY the base-path resolution → base-week clones patched; variant-week clones
  NOT patched (name guard). And vice-versa with only the variant resolution.
- `test("ambiguous base day number short-circuits resolution for variant slots too")`:
  duplicate base day numbers → `applyResolutions` leaves both base and variant
  exercises unpatched for that day group (existing `findAmbiguousDayGroups`
  guard still applies).

### Implementation
`applyResolutions` (lines 128-221). Changes:

1. Build a `path → rawName` map from `program.import.warnings` BEFORE
   filtering (warnings are only filtered at the end, line 216-218, so the map
   is complete during patching):

```ts
const warningRawNames = new Map<string, string>();
for (const w of program.import?.warnings ?? []) {
  if (w.rawName !== undefined) warningRawNames.set(w.path, w.rawName);
}
```

2. Rework `patchExercise` to be name-guarded over candidate paths. The current
   signature is `patchExercise(ex, path)`. Change the day/section/group/override
   traversal so that instead of passing a single base `path`, it computes the
   base path and considers base + variant candidate paths:

```ts
function patchExercise(ex: ProgramExercise, basePath: string): ProgramExercise {
  if (ex.canonicalExerciseId) return ex;
  // Candidate paths for this slot: the base path plus any `.variants.{v}`
  // path known to resolutions or warnings for this slot.
  const candidatePaths = [basePath];
  for (const key of allKnownPaths) {
    if (key.startsWith(`${basePath}.variants.`)) candidatePaths.push(key);
  }
  // Name guard: only the candidate whose warning rawName equals ex.name may
  // patch this exercise. This blocks base<->variant cross-patching in BOTH
  // directions. A path with no warning entry is never selected (its rawName is
  // unknown), except the base path retains today's behavior when no warning
  // map entry exists — but by construction every unmatched exercise HAS a
  // warning, so a resolvable exercise always has a rawName to match against.
  for (const p of candidatePaths) {
    const rawName = warningRawNames.get(p);
    if (rawName !== undefined && rawName === ex.name) {
      const id = resMap.get(p);
      if (id && id !== CUSTOM_ID) {
        resolvedPaths.add(p);
        return { ...ex, canonicalExerciseId: id };
      }
      return ex; // matched the guard but no usable resolution; stop
    }
  }
  return ex;
}
```

Where `allKnownPaths` is `new Set([...resMap.keys(), ...warningRawNames.keys()])`
computed once at the top of `applyResolutions`.

3. `allKnownPaths` and `warningRawNames` are closure variables alongside
   `resMap`/`resolvedPaths`. The `patchGroup`/`patchSection`/`patchDay`
   helpers already thread a `buildPath(sectionIndex, groupIndex, exerciseIndex)`
   closure; `patchGroup` calls `patchExercise(ex, buildPath(...))`. That
   `buildPath(...)` result IS the base path — no change needed there; only
   `patchExercise`'s body changes.

4. Override traversal (`patchOverride`, lines 197-212) uses
   `overrideExercisePath`. Overrides do not carry variants in scope (spec: out
   of scope). But `patchExercise` is shared. Since override warnings use the
   `overrides.{i}...` prefix and no `.variants.` override paths are ever
   emitted, the candidate-path scan finds none and behavior is unchanged for
   overrides. Confirm with the existing override resolution tests still
   passing.

5. Name-guard note for non-variant base exercises: today an unmatched base
   exercise's warning has `rawName === ex.name` by construction
   (`normalizeExercise` sets both from the same `name`). So the guard picks the
   base path and behaves exactly as before. Verify existing resolution tests
   still pass unchanged — this is the key regression surface.

### Verify
`npm test -- resolution` then `npm run typecheck`. Also run
`npm test -- parser` to confirm no regressions.

---

## Stage 6 — Prompt builder changes

Spec "Prompt builder changes" 1-4.

### Files
- `src/lib/prompts/builder.ts`
- `src/lib/prompts/builder.test.ts`

### Tests first (builder.test.ts) — spec Test plan items 15-16
- `test("buildSchemaBlock includes a variants example with weeks [2, 4]")`:
  `expect(buildSchemaBlock()).toContain('"variants"')` (as it appears in
  `JSON.stringify(skeleton, null, 2)`) and `.toContain("[\n            2,\n            4\n          ]")`
  is brittle; instead assert `.toMatch(/"weeks":\s*\[\s*2,\s*4\s*\]/)` against
  the stringified skeleton — but note `JSON.stringify(..., 2)` pretty-prints
  arrays multiline, so prefer asserting on the presence of the `variants` key
  and the two week numbers loosely: `expect(block).toContain('"variants"')` and
  `expect(block).toMatch(/"weeks"[\s\S]*?2[\s\S]*?4/)`.
- `test("buildSchemaBlock guidance explains variants vs overrides")`:
  `.toContain("Use `variants`")` (or the exact substring chosen) and
  `.toContain("Reserve `overrides`")`.
- `test("buildSchemaBlock hierarchy note lists variants as an optional exercise field")`:
  `.toContain("variants")` within the "Each exercise" bullet substring.
- `test("buildRecoveryPrompt preserves variants instruction")`:
  `expect(buildRecoveryPrompt("invalid")).toContain("Preserve any `variants` arrays")`.

If the existing `builder.test.ts` uses a full-string snapshot, update the
snapshot (`npm test -- builder -u`) after implementing, and add the explicit
substring assertions above so intent is documented regardless of snapshot.

### Implementation
1. In `buildSchemaBlock`, add `variants` to the `exDay` example exercise
   (spec §1 draft, ~line 4). Place it before `tags` to match the draft.
2. Append the guidance bullet to `multiWeekInstructions` (spec §2, ~line 160).
3. Add the "Each exercise:" hierarchy bullet to the return-array bullet list
   (spec §3, ~line 200-204), listing `variants` as optional.
4. Add the "Preserve any `variants` arrays…" line to `buildRecoveryPrompt`'s
   `contract` array (spec §4, ~line 218-224).

Keep wording verbatim from the spec so tests and prompt stay in lockstep.

### Verify
`npm test -- builder` then `npm run typecheck`.

---

## Stage 7 — Fixture + integration tests

Spec "Fixture" + integration-level assertions tying parse→expand→resolve.

### Files
- `src/lib/import/__fixtures__/variants-multiweek.json` (new)
- `src/lib/import/parser.test.ts` and/or `src/lib/import/resolution.test.ts`
  (integration tests that import the fixture)

### Fixture requirements (spec)
Single-line JSON, styled like `knee-conscious-powerbuilding-cut.json`:
- `weeks: 4`, realistic `progression`, `days` (at least 1-2 days).
- One exercise with a **sparse-override variant** (variant supplies `name` +
  `load`, inherits `sets`/`reps`/`tags`) — e.g. base "Romanian deadlift" →
  `{ weeks: [3], name: "Deficit Romanian deadlift", load: "70%" }`.
- One exercise with an **alternating variant** `"weeks": [2, 4]`.
- One variant name that is a **catalog miss** (for resolution/warning path) and
  one that **resolves cleanly** (pick a name known to match — cross-check
  against `matchExercise` behavior used in existing parser tests).
- An `overrides` block for ONE week that overlaps a variant week (to exercise
  "override wins" at render).

Verify catalog matches by checking which names existing parser/resolution tests
treat as matched vs unmatched, or by a quick scratch run of `matchExercise`.

### Tests first
- `test("fixture: variant names expand correctly across 4 weeks")` (parser).
- `test("fixture: sparse-override variant inherits sets/reps/tags, overrides load")` (parser).
- `test("fixture: override wins over variant on the overlapping week")`:
  parse fixture → `getRenderableDays(program)` (import
  `getRenderableDays` from `src/lib/programs/overrides.ts`) → the overridden
  week's day matches the override replacement, NOT the variant. This documents
  spec "Override interaction" with a real assertion.
- `test("fixture: unmatched variant surfaces a resolution item and applyResolutions patches all its week-clones")`
  (resolution) — end-to-end parse → `extractUnresolvedExercises` →
  `applyResolutions`.

### Verify
`npm test -- parser resolution` then `npm run typecheck`.

---

## Stage 8 — Full-suite gate + leak scan

### Actions
1. `npm run typecheck` — both tsconfig projects pass.
2. `npm test` — full jest suite green (catches any regression in analysis /
   overrides / logging tests that touch imported programs).
3. `npm run lint` — no new lint errors.
4. `npm run build` — vite build succeeds (serverless/static deployment must
   still build).
5. Leak scan (must already be asserted by the Stage 3 test, but confirm at the
   suite level): a test that, for BOTH an inline multi-week payload and the
   Stage 7 fixture, recursively walks the produced `program.days` (and, after
   `applyResolutions`, the whole `program` minus `program.import.rawJson`) and
   asserts no object has a `"variants"` or `"__variants"` own-property.
   `program.import.rawJson` is exempt (it is the untouched raw input and legally
   contains `variants`).

### Verify
All four commands above pass; the leak-scan test passes.

---

## Cross-stage notes / risks

- **Signature churn:** `expandDays` gains a `warnings` param (Stage 3) so
  Stage 4 can share it; alternatively keep diagnostics entirely in
  `diagnoseVariants` (which walks base days) and leave `expandDays` warning-free.
  The plan routes ALL variant warnings through `diagnoseVariants`, so
  `expandDays` does NOT strictly need `warnings`. Decision: keep `expandDays`
  signature as `(baseDays, lengthWeeks)` UNCHANGED and put every diagnostic in
  `diagnoseVariants`. (Revises the Stage 3 wire-up note: do not add `warnings`
  to `expandDays`.)
- **Resolution regression surface:** Stage 5's name guard changes the core
  patch predicate. The existing resolution suite is the safety net — run it
  after Stage 5 and do not proceed until green.
- **`WithVariants` casts:** `__variants` lives behind `as WithVariants` casts
  in parser/expansion only. It must never appear on an exported type; the
  Stage 3 leak test + `npm run typecheck` (which typechecks tests) are the
  guardrails.
