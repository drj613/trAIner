# Code Review: UI Components & App Shell

Reviewer: architecture-reliability-reviewer  
Date: 2026-05-05  
Scope: `src/components/`, `src/App.tsx`, `src/main.tsx`

---

## 1. Scope-on-Save (PRD §10.6 Red Flag)

### [Critical] `scope: "day"` is hardcoded in every override write site

- `DiffPage.tsx:40` — `scope: "day" as const` is unconditional when accepting an AI diff. No scope picker in `DiffReview`.
- `EditClient.tsx:24` — same hardcoded `scope: "day"`.

A grep of `src/components/` for `scope` returns only these two literal `"day"` writes. No selector component exists. Users can never push an edit to base or week scope. The override system in `lib/programs/overrides.ts` supports all three — this is purely a UI gap.

**Fix:** Insert a scope-picker step (radio: "This day only / This week / Permanently change routine") between `ModifyAiModal` apply and `DiffPage` save, and in the manual editor.

---

## 2. Today Screen

### [Critical] "Today" always shows day index 0
`src/components/workout/TodayClient.tsx:484`

```ts
const day = activeProgram ? getRenderableDays(activeProgram)[0] : undefined;
```

No day-of-week resolution, no last-completed-day cursor, no explicit day picker. A 4-day Upper/Lower routine perpetually shows "Day 1: Upper." The most important screen in the app shows the wrong workout.

**Fix:** Resolve by (a) last-logged dayId + position in cycle, (b) day-of-week mapping if routine has weekday metadata, or (c) at minimum an explicit day picker before logging.

### [High] Local-tz day key vs. UTC timestamp drift
`TodayClient.tsx:20-23`

`localDateString()` is local time; `performedAt: new Date().toISOString()` is UTC. A user training at 11:30 PM PST will have the Today view and History view show the workout under different dates. `HistoryClient.tsx:50` uses `log.performedAt.slice(0, 10)` (UTC date).

**Fix:** Store a `dateKey: string` (YYYY-MM-DD local) on `WorkoutLogDocument`, or derive all views from the same timezone conversion.

### [High] Tap targets below 44 px on the primary logging surface
- `SetCell.tsx:66` — `width: 70, height: 30`
- `TodayClient.tsx:170-185` — "add set" button is `width: 28, minWidth: 28`
- Per-row history button: `padding: "3px 6px"` around a 13 px icon (~22 px square)

---

## 3. Data Loading Patterns

### [High] `LocalDataProvider` has no error surface
`src/components/app/LocalDataProvider.tsx:22-32`

`refresh().catch(() => setLoading(false))` swallows IndexedDB errors. Safari Private mode, quota exceeded, version mismatch — all appear as an empty workspace. No way to recover or diagnose.

**Fix:** Add `error: Error | null` to context; show "IndexedDB unavailable" banner in `AppShell`.

### [High] `HistoryClient` displays raw UUIDs as exercise names
`src/components/workout/HistoryClient.tsx:54`

```ts
byExercise.set(key, { name: entry.exerciseId, sessions: [] });
```

`entry.exerciseId` is a `crypto.randomUUID()` value. History index shows UUIDs like `f8d2c1b3-…` as exercise names.

**Fix:** Denormalize `exerciseName: string` onto `WorkoutLogEntry` at write time, or look up canonical name via `canonicalExerciseId`.

---

## 4. Stub Components at User-Reachable Routes

### [Critical] `LogClient` and `EditClient` are broken stubs linked from `ProgramDetailClient`
`App.tsx:53-54` registers `/programs/:id/log` and `/programs/:id/edit`. `ProgramDetailClient.tsx:62-71` has user-visible buttons linking to both.

- `LogClient.tsx:25-33` — inputs are unbound; "Save Log" writes `[{ setNumber: 1, reps: 0, weight: 0 }]` for every exercise regardless of input. Silently corrupts history.
- `EditClient.tsx:15-34` — appends `" (Modified)"` to day 0's title, hardcodes `scope: "day"`, no field editor.

**Fix:** Remove routes and links from `ProgramDetailClient`, or redirect `LogClient` to `TodayClient`.

---

## 5. PWA / Offline Correctness

### [High] Service worker catch-all returns Today HTML for any failed GET
`public/sw.js:29`

If a JS chunk fails (stale hash post-deploy), the SW serves Today HTML in place of the JS bundle → `Unexpected token '<'` syntax errors with no user-visible explanation.

### [High] Cache-first for everything, no update flow
`public/sw.js:21`

Once cached, HTML updates never reach users. No `SKIP_WAITING`, no `clients.claim()`, no reload prompt. `CACHE_NAME: "trainer-app-shell-v1"` is hardcoded — every deploy needs a manual bump.

### [High] GitHub Pages routing is internally inconsistent
`vite.config.ts` has `base` commented out. If deployed to a project page (`username.github.io/trainer/`), every `<Link to="/today">`, manifest `start_url`, and SW precache path breaks. `BrowserRouter` has no `basename`.

**Fix:** Decide deployment target. If project-pages: set `base: "/trainer/"`, use `import.meta.env.BASE_URL` throughout, configure `<BrowserRouter basename={import.meta.env.BASE_URL}>`.

---

## 6. React Patterns & Component Responsibility

### [Medium] `TodayClient.tsx` is 507 lines mixing routing, hydration, AI flow, and rendering
Split into `useWorkoutSession` hook + presentational components.

### [Medium] `RoutinesIndexClient.tsx` outside-click closer is not keyboard-accessible
`RoutinesIndexClient.tsx:379` — `<div onClick={...} style={{position: "fixed", inset: 0, zIndex: 5}} />` has no Escape handler; menu items lack `role="menuitem"` and arrow-key navigation.

---

## 7. Accessibility

- `ModifyAiModal.tsx:111` — backdrop has no `aria-hidden="true"` or `role="presentation"`
- `AppShell.tsx:233` — `<main>` has no `id` and no skip-to-main link
- `HistoryClient.tsx:514-519` — hover state sticks on touch devices (use CSS `:hover`)
- `ExercisePickerSheet.tsx:60` — no focus trap or Escape-to-close

---

## 8. PRD Alignment Summary

| PRD requirement | Status |
|---|---|
| Today is the most important screen | **Broken** — wrong day, sub-44px tap targets |
| History visibility must be fast | **Broken** — UUIDs as names |
| Scope-on-save before structural edits | **Not enforced** — every override is `day` |
| Mobile-first, gym-friendly | **At risk** — sub-44px hit targets |
| Offline-capable PWA | **Fragile** — SW fallback bug, no update flow |

---

## Recommended Priority Order

1. Fix scope-on-save (`DiffPage.tsx`, `EditClient.tsx`)
2. Fix Today's day resolution (`TodayClient.tsx:484`)
3. Remove or replace `LogClient` / `EditClient` stubs
4. Fix `HistoryClient` UUID-as-name bug
5. Fix SW catch-all + add update flow
6. Decide GitHub Pages target and align `vite base`, `BrowserRouter basename`, manifest, SW, 404.html
7. Add IndexedDB error surface in `LocalDataProvider`
8. Fix TZ consistency between day key and `performedAt`
9. Raise tap targets to ≥36 px on `SetCell` and aux buttons
