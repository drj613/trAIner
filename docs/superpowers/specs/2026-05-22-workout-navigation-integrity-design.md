# Workout Navigation, Skip/Note, and Data Integrity

**Date:** 2026-05-22  
**Status:** Approved

---

## Overview

Four related changes:

1. **Remove offline indicators** — cosmetic cleanup in AppShell
2. **Unified day route** — `/programs/:id/days/:dayId` becomes the workout surface; `/today` becomes a thin resolver/redirector
3. **Skip day + day note** — bottom-bar UX for marking a day done without sets, plus a session-level note field
4. **Data integrity** — fix a race condition that blanks cells after applying a programme edit mid-workout; deduplicate overrides; beef up tests

---

## 1. Remove Offline Indicators

**Files:** `src/components/app/AppShell.tsx`

Remove:
- The `"local workspace · offline-first"` subtitle in the nav drawer header
- The entire drawer footer (WifiOff icon, "offline-only · static PWA", green dot + "local · all data on this device")
- `WifiOff` import from lucide-react

No behaviour change.

---

## 2. Route Architecture

### New route

```
/programs/:id/days/:dayId
```

This is the workout surface. It replaces the role of `/today` for actually doing a workout.

### `/today` becomes a redirector

`TodayClient` resolves the active programme + logs → calls `resolveNextDay` → immediately renders `<Navigate to={/programs/${id}/days/${dayId}} replace />`. Shows a loading spinner while resolving. Holds no workout state of its own.

The "Today" nav link in the sidebar continues pointing to `/today`.

### `/programs/:id/log` is retired

This route never worked correctly (always navigated to today regardless of which day was selected). Remove it from `App.tsx` and `LogClient.tsx`.

### Route table after changes

| Route | Component | Purpose |
|---|---|---|
| `/today` | `TodayClient` (slimmed) | Resolve + redirect only |
| `/programs/:id/days/:dayId` | `WorkoutDayClient` (new) | Full workout UI |
| `/programs/:id` | `ProgramDetailClient` (updated) | Overview + completion status |
| `/programs/:id/diff` | `DiffPage` (updated) | Diff review (deduplication fix) |

---

## 3. Workout Day Screen (`WorkoutDayClient`)

### What it is

The `TodayWorkout` component logic (cells, autosave, rest timer, history drawer, edit/replace sheets, AI modal, bodyweight widget) extracted into a route-aware component. Reads `programId` and `dayId` from URL params. Resolves the programme from `useLocalData` and the rendered day from `getRenderableDays`.

### Header

```
← Routines    [Day title]    Day N of M    ✦
              ← prev                  next →
```

- Back link to `/programs/:id`
- Prev/next arrows step through `getRenderableDays(program)` by index
- Arrows **clamp** at ends (prev disabled on day 0, next disabled on last day) — these are for browsing, not workflow
- AI sparkle button stays top-right

### Bottom bar

Replaces `WorkoutProgress`. Progress strip at very top of bar. Below it, one row:

```
[save status]  [X/Y · pct%]  [Day note ▾]  [Skip day]  [Finish workout]
```

**Day note ▾** — expands a `<textarea>` above the bar, same collapsible pattern as per-exercise notes. Autosaves with cells. Persisted as `WorkoutLogDocument.dayNote`.

**Skip day** — tapping replaces the button row inline (no modal):

```
Reason (optional): [______________]   [Cancel]  [Skip →]
```

Confirming skip writes `completedAt + skippedAt + skipReason` to the log, then navigates to the next day route. If on the last day, **wraps to day 0** (this is workflow progression, unlike the browsing arrows which clamp).

**Finish workout** — same as current but navigates to `/programs/:id/days/:nextDayId` after the 800 ms saved animation instead of calling `setResolvedDay` in-memory.

### Data model additions

```ts
// src/lib/programs/types.ts  —  WorkoutLogDocument
dayNote?: string       // session-level note
skippedAt?: ISODate    // set when Skip is used (alongside completedAt)
skipReason?: string    // optional reason text
```

IDB version bump to **v6** with no data migration needed (new optional fields, existing records are valid as-is).

---

## 4. Programme Detail Overview (`ProgramDetailClient`)

### Completion badges

Load all logs for the programme once (`logRepo.listForProgram`). For each day, find the most recent log whose `dayId` matches:

| Condition | Badge |
|---|---|
| `completedAt` set, no `skippedAt` | `●` green |
| `skippedAt` set | `~` muted yellow |
| Log exists, no `completedAt` | `·` dim (in-progress) |
| No log | _(nothing)_ |

Badge rendered in the DayCard header next to the day label.

### Day card navigation

- Expand/collapse toggle **kept as-is**
- "Start →" button renamed to **"View →"** and navigates to `/programs/:id/days/:dayId`
- No other changes to the expanded card body (still shows exercise structure / prescription)

### Read-only mode

`ProgramDetailClient` drops its inline edit UI (ExerciseRow edit/swap/delete, RoutineConfirmModal, embedded DiffReview). All editing happens from within the day route. `ProgramDetailClient` retains: week tab strip, day cards with completion badges, analysis card, AI modal for whole-day modifications (feeds through existing diff flow).

---

## 5. Data Integrity

### Race fix — flush before navigate

**Root cause:** `handleApplyReplacement` navigated synchronously to DiffPage. TodayClient unmounted and fired `void flush()` (fire-and-forget). The IDB write hadn't committed by the time DiffPage applied the override and redirected back, so `getForDay` on remount returned null → blank cells.

**Fix:** Make `handleApplyReplacement` async. Await `flush()` before calling `navigate`. The useEffect cleanup flush stays as a safety net.

```ts
async function handleApplyReplacement(replacement: ProgramDay) {
  await flush();
  const stored = storePendingDiff(program.id, day, replacement);
  if (!stored) { /* error */ return; }
  navigate(`/programs/${program.id}/diff`);
}
```

### Override deduplication

DiffPage currently appends overrides without removing stale ones for the same scope+target. Two "Entire week" applies for the same week stack up and interact unpredictably.

Fix: before appending, filter out any existing override for the same `(scope, dayId)` or `(scope, weekNumber)`:

```ts
const deduped = program.overrides.filter(
  (o) => !(o.scope === scope && (scope === "day" ? o.dayId === dayId : o.weekNumber === weekNumber))
);
await saveProgram({ ...program, overrides: [...deduped, newOverride] });
```

### Invariant

Log data (`logRepo`) is **never touched** during programme edits. Overrides and base-day mutations only modify `programme.overrides` / `programme.days`. This must hold.

### Test additions

| Area | What to assert |
|---|---|
| `exerciseSwap` | `swapExercise` preserves exercise ID; `addExercise` generates fresh ID for new exercise only |
| `overrides` | Applying a day-scope override twice for the same day → single effective override; week-scope deduplication |
| `DiffPage` (integration) | `flush` is awaited before navigate; existing override for same scope replaced, not appended |
| `WorkoutDayClient` | Skip writes `skippedAt + completedAt`; skip reason persists; day note autosaves; Finish navigates to next day URL |
| Log invariant | `logRepo.save` is never called by `saveProgram`, `programRepo.save`, or any override apply path |

---

## Out of Scope

- Viewing per-set logged values inline in the programme overview (day route is the right place to review a past workout)
- Editing exercises (rename, delete, add to section) from the programme overview — stays in day route via existing swap/edit sheets
- Completion indicators in the History view (separate concern)
