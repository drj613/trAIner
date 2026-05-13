# Routine Overview V2 — Design Spec

**Date:** 2026-05-12  
**Status:** Approved

## Summary

Replace the current `ProgramDetailClient` flat vertical scroll (which uses `WorkoutView` as a read-only display) with a swipeable week pager containing expandable/collapsible day cards with inline exercise editing — no page navigation required for any edit action.

---

## Current State

- `/programs/:id` renders `ProgramDetailClient`, which calls `getRenderableDays` then maps each day through `WorkoutView` (read-only, no editing affordances).
- Editing requires navigating to `/programs/:id/edit` (`EditClient`), which is essentially unimplemented.
- Exercise swaps and AI modifications are only accessible mid-workout from `TodayClient`, and navigate away to `/programs/:id/diff` for scope review.

---

## Layout

### Page structure (top → bottom)

1. **Header bar** — `← Routines`, program title, description, `[Map]` button
2. **Analysis strip** — compact grade + dimension chips (existing `RoutineAnalysisCard`); tap opens full `LlmAnalysisSheet`
3. **Week tab strip** — sticky; one button per week with per-day micro-dots, CURRENT / DONE / UPCOMING / PAST labels
4. **Week panel area** — transform-based pager; swipe left/right or tap tabs to switch weeks
5. Inside each week panel: **day cards** vertically stacked

### Week tab strip

- One `WK N` button per week, evenly distributed, underline indicator on active
- 5px micro-dots below label: filled green = done, accent = active, dashed = rest, grey = upcoming
- CURRENT / DONE / UPCOMING / PAST mono label below dots
- Derived from `buildWeekGrid(getRenderableDays(program))`

### Week panel switching

- Transform-based (`translateX`) with `transition: transform .25s cubic-bezier(.2,.7,.3,1)`
- Pointer drag: `onPointerDown` / `onPointerMove` / `onPointerUp`, threshold 20% of panel width to commit
- `touchAction: pan-y` so vertical scroll still works naturally
- Each week panel: full height, `overflowY: auto`, independent vertical scroll

### Day cards

**Collapsed (default):**
```
│ Mon  ● Upper A         4 ex · 3 sections  ▸ │
```
- Day label (Mon/Tue), status dot (done/active/upcoming), title, exercise count + section count, chevron
- Rest days: muted, dashed left border, not expandable

**Expanded:**
```
│ Mon  ● Upper A         4 ex · 3 sections  ▾ │
│──────────────────────────────────────────────│
│  ◐ WARM-UP                                   │
│  ⠿ 1.1  Hip Flexor Stretch  2×30s  [⊞][✦][⌫]│
│  + Add to warm-up                            │
│  ■ STRENGTH                                  │
│  ⠿ 2.1  Squat          3×5 @80kg  [⊞][✦][⌫]│
│  ⠿ 2.2  Romanian DL   3×8        [⊞][✦][⌫] │
│  + Add to strength                           │
│──────────────────────────────────────────────│
│  [✦ Modify day]              [Start →]       │
```

- Section headers: type glyph + name
- Exercise rows: drag handle glyph, index (section.exercise), editable name, prescription, rest
- Active routine gets accent left border + accent-soft header background

---

## Exercise Actions

Three icon buttons per exercise row, right-aligned:

| Button | Icon | Action |
|--------|------|--------|
| Swap from catalogue | `ArrowLeftRight` | Opens `ExerciseReplaceSheet`; on pick → `swapExercise()` → scope confirm modal |
| Modify with AI | `Sparkles` | Opens `ModifyAiModal` for the whole day; on apply → scope confirm modal |
| Delete | `Trash2` | Removes exercise from day → scope confirm modal |

**"+ Add to [section]"** row at bottom of each section — opens `ExerciseReplaceSheet` in add mode; on pick → new exercise appended as new single group → scope confirm modal.

**Inline name editing** — click exercise name → `<input>`, commit on blur/Enter, cancel on Escape → scope confirm modal.

**"Modify day" button** (expanded day footer) — opens `ModifyAiModal` for the whole day.

---

## Scope Confirm Modal

Bottom sheet layered over the routine view (no navigation). Triggered after any mutation resolves to a `replacement: ProgramDay`.

```
┌────────────────────────────────┐
│ Review changes             ✕  │
│────────────────────────────────│
│ Apply to:                      │
│  ◉ Whole routine  (default)    │
│  ○ This week (Wk 1)            │
│────────────────────────────────│
│  [DiffReview component]        │
│────────────────────────────────│
│  [Discard]   [Apply changes]   │
└────────────────────────────────┘
```

"This week" is disabled if `day.weekNumber` is undefined.

**Save logic:**

- *Whole routine* — replaces matching entry in `program.days` by `day.id`, calls `saveProgram({ ...program, days: newDays })`
- *This week* — appends `ProgramOverride` with `scope: "week"`, `weekNumber: original.weekNumber`, calls `saveProgram({ ...program, overrides: [...overrides, override] })`

Local `program` state updated directly after save (no re-fetch).

---

## State (ProgramDetailClient)

```ts
const [program, setProgram] = useState<ProgramDocument | undefined>()
const [activeWeek, setActiveWeek] = useState(0)
const [expanded, setExpanded] = useState<Record<string, boolean>>({})
const [dragDX, setDragDX] = useState(0)
const [aiModalDay, setAiModalDay] = useState<ProgramDay | null>(null)
const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null)
const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
const [scope, setScope] = useState<'base' | 'week'>('base')
const [saving, setSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)
const [promptOpen, setPromptOpen] = useState(false)

type ReplaceTarget =
  | { kind: 'swap'; day: ProgramDay; exId: string }
  | { kind: 'add';  day: ProgramDay; sectionId: string }

type PendingChange = { original: ProgramDay; replacement: ProgramDay }
```

---

## New Utility: `addExercise`

Added to `src/lib/workout/exerciseSwap.ts`:

```ts
export function addExercise(
  day: ProgramDay,
  sectionId: string,
  item: ExerciseCatalogItem,
): ProgramDay
```

Appends a new single-type `ProgramGroup` with one `ProgramExercise` to the matching section. Default prescription: `sets: 3, reps: "8-10"`.

---

## Internal Components (all in ProgramDetailClient.tsx)

| Component | Purpose |
|-----------|---------|
| `WeekTabStrip` | Sticky tab bar with micro-dots |
| `WeekPager` | TranslateX container + pointer drag |
| `DayCard` | Collapsed header + expandable body |
| `SectionHeader` | Type glyph + name |
| `ExerciseRow` | Editable row with swap/AI/delete |
| `RoutineConfirmModal` | DiffReview + scope selector bottom sheet |

---

## Reused Without Modification

`buildWeekGrid`, `getRenderableDays`, `ModifyAiModal`, `ExerciseReplaceSheet`, `DiffReview`, `diffDays`, `swapExercise`, `RoutineAnalysisCard`, `LlmAnalysisSheet`, `saveProgram`, `programRepo.get`

---

## Out of Scope

- Drag-to-reorder exercises (handle shown, not wired)
- Section add/remove (use RoutineBuilder)
- Per-exercise vs per-day AI distinction (both open `ModifyAiModal` for the whole day)
- Undo/redo
