# Technical Findings
Date: 2026-05-05  
Source reviews: 01–05 (architecture-reliability-reviewer)  
All findings verified against source code.

Severity: **Critical** = data loss / silent corruption / PRD contract broken. **High** = wrong output or degraded behavior under common conditions. **Medium** = bug in realistic edge cases or confusing user-facing display. **Low** = dead code, naming, maintenance.

---

## Ruled Out

Three findings from the original reviews were wrong after reading the source:

**SW `SKIP_WAITING` / `clients.claim()` missing** — both are present. `sw.js:6` calls `self.skipWaiting()` in install; `sw.js:15` calls `self.clients.claim()` in activate. The SW does handle updates.

**`buildLlmAnalysisPrompt` sends no exercises to the LLM** — wrong. `analysis/llmPrompt.ts:84–115` (`formatRoutine`) serialises every day, section, group, and exercise including sets, reps, rest, and all muscle tags. The actual gap: the pre-computed `AnalysisResult` is never forwarded to the LLM, so local scores can't be cross-checked. Downgraded from High to Medium (design choice, not a missing-data bug).

**`EditClient` is a broken stub that corrupts data** — it is an incomplete stub but not dangerous. It adds a real `scope: "day"` override that only changes day 0's title. Nothing is corrupted. It lacks a real editor and hardcodes day 0. Severity: Low (placeholder, not broken). `LogClient` is genuinely broken and remains Critical.

---

## Critical

### C1 — `serialiseSets` drops PRD-blessed freeform notations
`src/lib/workout/sessionState.ts:13`

Regex `^(BW|\d+(?:\.\d+)?)x(\d+)$` only matches `60x10` and `BWx8`. The early-exit guard (line 8) catches lowercase `"skip"` and `"pain"` only. All other PRD-listed notations return null and are filtered in `serialiseSets` — permanently lost on `finishWorkout`:

- `BW+10x5` → dropped
- `red band x20` → dropped
- `30s hold` → dropped
- `Skipped` (capital S) → dropped
- `Pain` (capital P) → dropped

Violates PRD §14.1 "Never make the user serve the schema."  
Fix: extend `WorkoutSetLog` with a `rawCell?: string` field and store unrecognised strings there rather than discarding them.

---

### C2 — Today screen always shows Day 1
`src/components/workout/TodayClient.tsx:484`

```ts
const day = activeProgram ? getRenderableDays(activeProgram)[0] : undefined;
```

Hardcoded `[0]`. No day-of-week resolution, no last-completed-day cursor, no explicit day picker. Every session on a 4-day Upper/Lower program shows "Day 1: Upper."  
Fix: track last-logged dayId and advance position in the renderable days array, or add an explicit day picker.

---

### C3 — `pendingDiff` carries no scope; `DiffPage` hardcodes `"day"`
`src/lib/workout/pendingDiff.ts:5–9` and `src/components/workout/DiffPage.tsx:40`

`PendingDiff` type: `{ programId, original, replacement }` — no scope field. `DiffPage` writes every accepted AI diff with `scope: "day" as const`. PRD §10.6 requires explicit scope choice before any structural override; replacement-week and replacement-program paths are structurally unreachable.  
Fix: add `scope: ProgramScope`, `weekNumber?`, `dayId?` to `PendingDiff`. Show a scope picker in `DiffPage` before accepting.

---

### C4 — Injuries field absent from both prompt paths
`src/lib/prompts/builder.ts:3–13` and `src/lib/analysis/llmPrompt.ts:72–82`

`buildProfileBlock` (prompt builder path) omits: `body` (age/height/weight/bodyfat), `history`, `injuries`, `schedule`, `preferences`.  
`formatProfile` (LLM analysis path) includes `constraints` but also omits `injuries`, `schedule`, `preferences`.

A user who entered "torn rotator cuff, avoid overhead pressing" sends prompts with no injury context from either path. Silent safety failure.  
Fix: add an `## Injuries & Constraints` section to both prompt-assembly paths.

---

### C5 — `buildRoutineBlock` sends only program title and day count
`src/lib/prompts/builder.ts:21–31`

Output: `"## Current Routine\nName: ...\nDays: N"`. No exercises, no sections, no overrides. Used by `PromptBuilderClient` for modification prompts. The LLM cannot return a useful modification without knowing what it is modifying.  
Note: `analysis/llmPrompt.ts:formatRoutine` does NOT have this problem — it serialises the full exercise tree.  
Fix: serialize exercises into `buildRoutineBlock` the same way `formatRoutine` does, or unify the two paths.

---

### C6 — `restoreBackup` is an additive merge, not a replace
`src/lib/backup/backup.ts:19–36`

Each repo call does `put`, which overwrites records matching the backup's keys but leaves any pre-existing records not in the backup untouched. Pre-existing programs survive a "restore from backup." UI warns "This will replace all local data." The behavior directly contradicts the warning.  
Also appears as a finding in review 04 — same root cause.  
Fix: open a single multi-store transaction, clear each store, then write all backup records.

---

### C7 — `restoreBackup` crashes on malformed backup after partial write
`src/lib/backup/backup.ts:25`

No structural validation before any writes. `backup.programs.map(...)` throws if `programs` is absent (possible with hand-edited or version-mismatch backup). `profileRepo.save(backup.profile)` has already committed at that point — partial restore with no rollback.  
Fix: validate all required arrays before writing anything; wrap in a single multi-store transaction.

---

### C8 — `programRepo.activate` is non-atomic
`src/lib/storage/programRepo.ts:35–48`

`Promise.all(all.map(p => this.save(p)))` opens N separate IDB transactions. A tab close mid-flight leaves two programs both with `active: true`.  
Fix: use a single `db.transaction("programs", "readwrite")` and iterate inside it.

---

### C9 — `analyzeProgram` hardcodes week 1
`src/lib/analysis/analyze.ts:21`

```ts
const weeklyVolume = countWeeklyVolume(days, 1);
```

Every multi-week program is scored against its week-1 (typically lightest) data. A correct 4-week progressive ramp scores the same volume grade throughout as a flat week-1 program.  
Fix: iterate per week and take the max or modal week, or score each week independently.

---

### C10 — Upper/lower/chest/back double-counted in `analyzeBalance`
`src/lib/analysis/balance.ts:44–53`

The inner loop iterates `exercise.tags.primary` and adds `sets` to each matching bucket once per label. A bench press with primary `["chest", "front_delts"]` produces `upperSets += 4 + 4 = 8` (should be 4). Compounds with two primary muscles in the same bucket inflate that bucket by ~2×. All four push/pull and upper/lower ratios are systematically wrong.  
Fix: deduplicate bucket assignment per exercise (collect matched buckets into a Set, then add `sets` once per bucket).

---

### C11 — Saved aliases never fed back to the parser
`src/components/import/ImportClient.tsx:48`

```ts
const result = parseProgramJson(json);
```

No `aliases` argument. The alias-lookup branch in `matchExercise` is dead from the UI. Every subsequent import re-prompts for the same exercises regardless of prior resolutions.  
Fix: `await aliasRepo.list()` before calling `parseProgramJson`, then pass the result as the third argument.

---

### C12 — Resolution keyed by display name; duplicate-after-strip exercises share one entry
`src/lib/import/resolution.ts:38, 42`

`applyResolutions` keys resolutions on `ex.name`. If two exercises strip to the same display name (`"A. Squat"` and `"B. Squat"` → both `"Squat"`), applying one resolution sets both to the same `canonicalExerciseId`.  
Fix: key resolutions on the warning `path` field (already a stable per-exercise identifier).

---

### C13 — No-suggestion exercises bypass resolution and don't block save
`src/lib/import/resolution.ts:26` and `ImportClient.tsx:147–188`

`extractUnresolvedExercises` skips any warning with `suggestions.length === 0`. Exercises with no catalog suggestions pass straight to the confirm step; the Save button is unconditionally enabled.  
Fix: include no-suggestion exercises in the resolution step with a free-form catalog search; disable Save until all are handled or explicitly acknowledged.

---

### C14 — `LogClient` save writes zero-data records for every exercise
`src/components/workout/LogClient.tsx:18–34`

Inputs are unbound (no state, no `onChange`). `saveLog()` writes `[{ setNumber: 1, reps: 0, weight: 0 }]` for every exercise regardless of displayed values. Linked from `ProgramDetailClient` and registered at `App.tsx:53`. Silently corrupts workout history on use.  
Fix: redirect `/programs/:id/log` to `TodayClient` with the day pre-selected, or remove the route and the link in `ProgramDetailClient`.

---

## High

### H1 — `toDisplayAnalysis.ts:72` — under-trained muscles labeled as over-trained
`src/lib/analysis/toDisplayAnalysis.ts:72`

```ts
flag: mv.severity === "red" ? "above_mrv" : mv.severity === "yellow" ? "below_mev" : undefined
```

`classifyVolume` assigns `"red"` to both `sets < mv` (below maintenance — under-trained) and `sets > mrv` (excessive — over-trained). Both map to `"above_mrv"` in the UI. Similarly, `"yellow"` covers both "Maintenance only" (below MEV) and "High — approaching limit" (above MAV), yet both map to `"below_mev"`.  
Fix: recompute the flag from actual numeric position against `mv`, `mev`, `mavHigh`, `mrv` rather than from the severity bucket.

---

### H2 — `detectMovementPatterns` fully dead without `canonicalExerciseId`
`src/lib/analysis/muscles.ts:108–139`

When `catalogItem` is undefined (every exercise without a catalog match): `patterns = []`, `tags = []`. All five explicit pattern checks fail. The hip-hinge fallback (`tags.some(...)`) also fails because `tags` is empty. No patterns are detected. Every user-authored program missing catalog matches takes the "missing movement patterns" red balance warning regardless of its actual structure.  
Fix: add label-based fallbacks keyed on `exercise.tags.primary` (e.g. "bench" → horizontal_push, "squat" → squat, "deadlift" → hip_hinge, "pull-up" → vertical_pull, "row" → horizontal_pull, "OHP" → vertical_push).

---

### H3 — `HistoryClient` displays UUID as exercise name
`src/components/workout/HistoryClient.tsx:54`

```ts
byExercise.set(key, { name: entry.exerciseId, sessions: [] });
```

`entry.exerciseId` is the internal UUID (`exercise-{uuid}`). History view shows `exercise-abc123-…` as the exercise name.  
Fix: denormalize `exerciseName: string` onto `WorkoutLogEntry` at write time (in `finishWorkout`), or look up the canonical name via `canonicalExerciseId`.

---

### H4 — `LocalDataProvider` swallows all IDB errors
`src/components/app/LocalDataProvider.tsx:31`

```ts
refresh().catch(() => setLoading(false));
```

Quota exceeded, Safari Private mode, DB version mismatch — all produce an empty workspace with no error message.  
Fix: add `error: Error | null` to context; surface an "IndexedDB unavailable" banner in `AppShell`.

---

### H5 — `hydrateFromLog` returns a shorter array than prescribed, collapsing slots
`src/lib/workout/sessionState.ts:43–54`

If the user logged 2 of 3 prescribed sets, hydration returns a 2-cell array. The merge in `TodayClient.tsx` replaces the whole cells array, eliminating the third prescribed slot from the UI.  
Fix: `const maxSet = Math.max(prescribedSets, ...entry.sets.map(s => s.setNumber))`.

---

### H6 — Heatmap shows max intensity on every day for the first session
`src/lib/analytics/trainingHeatmap.ts:49–52`

With one log entry, `allVols = [x]`, so `p33 = p66 = p90 = allVols[0]`. `intensityFor(x)` returns 4 (max) because `vol >= p90`. Every new user perpetually shows max-intensity days until enough history accumulates.  
Fix: require a minimum sample size (e.g. 5 sessions) before banding, or use absolute tonnage thresholds as a fallback.

---

### H7 — Bodyweight exercises produce zero heatmap volume
`src/lib/analytics/trainingHeatmap.ts:41`

```ts
vol += (s.weight ?? 0) * (s.reps ?? 1);
```

For pull-ups, push-ups, dips (`weight === undefined`), `0 × reps = 0`. Bodyweight-only days appear as rest days in the heatmap and don't contribute to streak.  
Fix: substitute a nominal bodyweight (e.g. `profile.body.weight ?? 70`) for sets where `weight` is undefined, or count reps directly with a separate accumulator.

---

### H8 — `exercisesEqual` ignores `tempo` and `tags`
`src/lib/workout/programDiff.ts:25–34`

Only compares `name, sets, reps, load, rest, notes`. An AI-suggested change to `tempo` or `tags` (which the schema block instructs the LLM to populate) produces an empty diff — the user reviews "no changes" and the override silently rewrites the exercise.  
Fix: add `a.tempo === b.tempo` and `JSON.stringify(a.tags) === JSON.stringify(b.tags)` to the equality check.

---

### H9 — `remapExerciseIds` collapses duplicate exercise names
`src/lib/workout/programDiff.ts:71–78`

`nameToId` map is keyed by `ex.name.toLowerCase().trim()`. The second occurrence of a name overwrites the first. A day with "Squat" in warmup and "Squat" in strength — a pattern used in the bundled Linear Progression persona — gives both instances the same UUID, breaking `CellMap` identity and React keys.  
Fix: append a section-qualified key (e.g. `${sectionId}:${name}`) or use a positional fallback for name collisions.

---

### H10 — `extractUnresolvedExercises` parses `rawName` from a localized error string
`src/lib/import/resolution.ts:27`

```ts
const match = w.message.match(/^(.+) was imported without a catalog match\.$/);
```

A copy change to the error message silently breaks resolution for all exercises.  
Fix: add `rawName?: string` to `ImportWarning` and populate it in `normalizeExercise` at the parse site. Stop parsing it from the human-readable message string.

---

### H11 — Import save is not atomic (aliases succeed, program save fails)
`src/components/import/ImportClient.tsx:79–90`

Aliases are `Promise.all`-saved then `programRepo.save` is called. No try/catch on either. If `programRepo.save` throws, aliases are committed for a program that doesn't exist — next import silently auto-resolves exercises for the missing program.  
Fix: wrap the entire save sequence in a try/catch; on failure, roll back or tombstone the saved aliases.

---

### H12 — `"full body"` tag maps entirely to `"core"`, losing all other credit
`src/lib/analysis/muscles.ts:44`

Exercises tagged `"full body"` (thrusters, Turkish get-ups, deadlifts tagged generically) contribute only to `core` volume. Posterior-chain and upper-body volume are systematically undercounted for exercises using this tag.  
Fix: either break `"full body"` out into its component muscles (quads, glutes, hamstrings, back, core) or treat it as an "all buckets" fallback.

---

### H13 — DB `upgrade` ignores `oldVersion`; no migration path between versions
`src/lib/storage/appDb.ts:42–71`

`upgrade` uses only "create if not exists" guards. `oldVersion` is never inspected. Adding an index to an existing store in v3 will be silently skipped for any user whose DB was created at v1 or v2 (because the `!db.objectStoreNames.contains(...)` guard blocks re-entering the store-creation branch).  
Fix: structure migrations as per-version blocks: `if (oldVersion < 2) { /* v1→v2 changes */ }`.

---

### H14 — Service worker returns `/today` HTML for failed JS chunk fetches
`public/sw.js:29`

```ts
.catch(() => caches.match("/today"))
```

A stale-hash JS bundle URL that 404s gets the Today HTML document as its response → `Unexpected token '<'` syntax error in the module loader, no user-visible explanation.  
Fix: the catch fallback should only apply to navigate requests (`event.request.mode === "navigate"`). Non-navigate failures should propagate as network errors.

---

### H15 — `Infinity : 1` ratio string renders in the UI
`src/lib/analysis/balance.ts:63–64` and `toDisplayAnalysis.ts:27–30`

When `pullSets = 0` and `pushSets > 0`, `pushPullRatio = Infinity`. `formatRatio` calls `Infinity.toFixed(2)` = `"Infinity"`. UI displays `"Infinity : 1"`.  
Fix: cap at a sentinel like `99.0` or return `"∞ : 1"` explicitly.

---

### H16 — `aliasRepo.save` overwrites on normalized-name collision
`src/lib/storage/aliasRepo.ts:16`

`id: normalizedAlias`. Two exercises that normalize to the same string silently overwrite each other; the later save wins.  
Fix: use `crypto.randomUUID()` as the primary key; keep `normalizedAlias` as an indexed field with `unique: true` enforced at the IDB level.

---

### H17 — Hinge movements classified as `"other"`, not `"pull"`
`src/lib/analysis/muscles.ts:94–101`

`classifyMovement` checks for push, pull, and squat catalog patterns. Hinge patterns (`"hinge"`, `"hip extension"`, `"hip hinge"`) are not in any push or pull set — they fall through to `"other"`. A posterior-chain-heavy program (deadlifts, RDLs, good mornings) appears push-dominant in the push:pull ratio and may trigger a false "add pulling" warning.  
Note: `detectMovementPatterns` does check for hinge (line 121) and correctly classifies it as `hip_hinge` for the movement pattern coverage check. The gap is specifically in `classifyMovement`, which feeds the push:pull ratio count.  
Fix: treat hinge as equivalent to "pull" in `classifyMovement` for push:pull ratio purposes.

---

## Medium

**M1 — `hamstrings.mavLow: 2` is below `mev: 3`** — `thresholds.ts:15`. Data inversion, but `mavLow` is a dead field in `classifyVolume` (classification jumps mev → mavHigh directly). Only visible in the UI muscle table as confusing numbers.

**M2 — Goal confidence reaches 100% with near-zero evidence** — `goals.ts:24`. `primaryScore / (primaryScore + secondaryScore || 1)` = 1.0 when `secondaryScore = 0`. A single faint signal returns full confidence. Feeds into overall score at 15% weight.

**M3 — Goal coherence note always says "matches"** — `toDisplayAnalysis.ts:53`. Hardcoded text regardless of confidence: `"Rep distribution matches ${goal} goal"` even at 15% confidence.

**M4 — Day override can replace day's `id` with the replacement's UUID** — `overrides.ts:17–19`. LLM parser generates fresh day UUIDs; after a day override is applied, the resulting day has the LLM's UUID, not the original. Log lookups by `dayId` silently miss.

**M5 — Override layering applies in insertion order, not scope precedence** — `overrides.ts:3–4`. A day override followed by a week override targeting the same day has the week override win. PRD semantics: day always beats week.

**M6 — Week-scoped override with a single `ProgramDay` does partial replacement** — `overrides.ts:8–15`. `replacement: ProgramDay | ProgramDay[]` — if a week override stores a single day, only the one matching `dayNumber` is replaced; every other day in the week passes through.

**M7 — `serratus anterior → rotator_cuff` is anatomically incorrect** — `muscles.ts:42`. Serratus anterior is a scapular stabilizer/protractor, not part of the rotator cuff.

**M8 — `stringFrom` does not trim returned values** — `parser.ts:164–166`. Guard checks `value.trim().length > 0` but returns the original untrimmed string. Exercise names with stray whitespace break string equality downstream.

**M9 — Score volume filter includes nearly all muscles even when untrained** — `score.ts:23`. `r.landmarks.mev > 0` is true for 16 of 19 muscles, so the filter is almost a no-op. Every untrained muscle with mev > 0 pulls the volume score toward red.

**M10 — SW cache name is hardcoded; stale content survives re-deploy** — `sw.js:1`. If `CACHE_NAME` does not change between deploys, the activate handler's `key !== CACHE_NAME` filter skips deleting the old cache. Users keep stale assets after a new service worker activates.

**M11 — `llmPrompt.ts` does not forward local `AnalysisResult` to the LLM** — `analysis/llmPrompt.ts:5–8`. The LLM receives the full raw routine but not the pre-computed scores. LLM cannot compare against or validate local analysis. Design choice — flag for product decision.

**M12 — `vite.config.ts` `base` is commented out** — `vite.config.ts:12–13`. If deployed to a GitHub project page (`user.github.io/trainer/`), all link hrefs, manifest `start_url`, and SW precache paths are wrong without `base: "/trainer/"` and `BrowserRouter basename`. Conditional on deployment target.

---

## Low

**L1** — `DisplayAnalysis.strengths` is always `[]` — `toDisplayAnalysis.ts:142`. Dead field.  
**L2** — `capitalize("olympic_weightlifting")` → `"Olympic_weightlifting"` (underscore visible in UI) — `toDisplayAnalysis.ts:23`.  
**L3** — `SESSION_LIMITS.setsPerExercise` threshold is never read by `session.ts`. Dead constant — `thresholds.ts:30`.  
**L4** — `BackupDocument.version: 1` has no migration plan; a v2 schema change silently breaks existing backup files.  
**L5** — `ProgramDocument` has both `active: boolean` and `status?: "active" | "draft" | "archived"` — two sources of truth maintained in parallel.  
**L6** — `routineMeta.ts` naming inconsistency with the rest of the codebase which uses "program" throughout.  
**L7** — `WorkoutEvent = WorkoutSavedEvent` has no `schemaVersion` field in the analytics seam; v1/v2 events will be indistinguishable when the format evolves.

---

## De-duplication Notes

The following appeared in multiple original reviews under different framings; they are the same root cause:

| Finding | Reviews |
|---|---|
| C6 `restoreBackup` is a merge | 01-storage + 04-workout-runtime |
| C3 `DiffPage` scope hardcoded | 04-workout-runtime + 05-ui-components |
| C4 `buildProfileBlock` missing injuries | 04-workout-runtime + analysis llmPrompt gap |
| H2 movement patterns dead | 03-analysis + fitness reviews 06–09 (consequences) |
| H17 hinge as "other" | 03-analysis + fitness reviews 06–09 (consequences) |
