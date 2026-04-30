# Profile Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the profile page to match the design: avatar header, 26-week training heatmap, and seven labeled card sections (Body, Training history, Goals, Injuries/limitations, Equipment, Schedule, Prompt preferences) rendered as tag chips or key-value grids. Also extend `ProfileDocument` with the missing fields those sections require.

**Architecture:** `ProfileDocument` gains optional fields (`body`, `history`, `injuries`, `schedule`, `preferences`) so existing stored profiles don't break. `defaultProfile` in `sample.ts` is updated with richer seed data. A new `src/lib/analytics/trainingHeatmap.ts` module computes heatmap cells from real `logRepo` data. `TrainingHeatmap.tsx` renders the grid. `ProfileClient.tsx` is rebuilt with the avatar, heatmap, and all seven card sections; editing is read-only for now (edit buttons are present but no-op).

**Tech Stack:** React 19, TypeScript, Next.js App Router, existing `logRepo`, `profileRepo`, `useLocalData`, `ProfileDocument` types.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/programs/types.ts` | Add optional fields to `ProfileDocument` |
| Modify | `src/lib/programs/sample.ts` | Enrich `defaultProfile` with new fields |
| Create | `src/lib/analytics/trainingHeatmap.ts` | Pure heatmap data: `buildHeatmapCells`, `computeHeatmapStats` |
| Create | `src/lib/analytics/trainingHeatmap.test.ts` | Unit tests for heatmap logic |
| Create | `src/components/profile/TrainingHeatmap.tsx` | Visual heatmap component |
| Modify | `src/components/profile/ProfileClient.tsx` | Full rebuild: avatar + heatmap + 7 cards |

---

### Task 1: Extend `ProfileDocument` and enrich `defaultProfile`

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify: `src/lib/programs/sample.ts`

All new fields are optional so existing stored profiles (which lack them) deserialise without error.

- [ ] **Step 1: Update `ProfileDocument` in `types.ts`**

Find and replace the `ProfileDocument` type:

```typescript
export type ProfileDocument = {
  id: "local-profile";
  name: string;
  goals: string[];
  equipment: string[];
  constraints: string[];
  trainingAge: string;
  defaultDaysPerWeek: number;
  updatedAt: ISODate;
  // Extended profile fields (optional so stored profiles without them still load)
  body?: {
    age?: string;
    height?: string;
    weight?: string;
    bodyfat?: string;
  };
  history?: string[];
  injuries?: string[];
  schedule?: string[];
  preferences?: string[];
};
```

- [ ] **Step 2: Enrich `defaultProfile` in `sample.ts`**

Replace only the `defaultProfile` constant:

```typescript
export const defaultProfile: ProfileDocument = {
  id: "local-profile",
  name: "Local Athlete",
  goals: ["Build strength", "Stay consistent"],
  equipment: ["barbell", "dumbbells", "cables", "pull-up bar"],
  constraints: ["Prefer phone-friendly sessions"],
  trainingAge: "intermediate",
  defaultDaysPerWeek: 4,
  updatedAt: "2026-04-24T00:00:00.000Z",
  body: { age: "—", height: "—", weight: "—", bodyfat: "—" },
  history: ["intermediate lifter"],
  injuries: [],
  schedule: ["4 days/week", "60–75 min sessions"],
  preferences: ["prefer free weights over machines"],
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/programs/types.ts src/lib/programs/sample.ts
git commit -m "feat(profile): extend ProfileDocument with body/history/injuries/schedule/preferences"
```

---

### Task 2: `trainingHeatmap.ts` — pure data layer

**Files:**
- Create: `src/lib/analytics/trainingHeatmap.ts`
- Create: `src/lib/analytics/trainingHeatmap.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/analytics/trainingHeatmap.test.ts
import {
  buildHeatmapCells,
  computeHeatmapStats,
  type HeatmapCell,
} from "./trainingHeatmap";
import type { WorkoutLogDocument } from "@/lib/programs/types";

function makeLog(date: string): WorkoutLogDocument {
  return {
    id: date,
    programId: "p1",
    dayId: "d1",
    performedAt: `${date}T10:00:00Z`,
    entries: [
      {
        exerciseId: "ex1",
        sets: [
          { setNumber: 1, weight: 100, reps: 5 },
          { setNumber: 2, weight: 100, reps: 5 },
        ],
      },
    ],
  };
}

describe("buildHeatmapCells", () => {
  it("returns a 26×7 grid", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    expect(cells).toHaveLength(26);
    expect(cells[0]).toHaveLength(7);
  });

  it("marks cells after today as future", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    // 2026-04-29 is a Wednesday (day index 2 in Mon-based week)
    const lastWeek = cells[cells.length - 1];
    expect(lastWeek[3].future).toBe(true);  // Thu of last week is future
    expect(lastWeek[2].future).toBe(false); // Wed (today) is not future
  });

  it("cell on a log date has intensity > 0", () => {
    // 2026-04-28 is Tuesday of the last week
    const cells = buildHeatmapCells([makeLog("2026-04-28")], "2026-04-29");
    expect(cells[cells.length - 1][1].intensity).toBeGreaterThan(0);
  });

  it("cell with no log has intensity 0", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    expect(cells[0][0].intensity).toBe(0);
  });
});

describe("computeHeatmapStats", () => {
  it("streak is 0 with no sessions", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    expect(computeHeatmapStats(cells).streak).toBe(0);
  });

  it("completionRate is between 0 and 100", () => {
    const cells = buildHeatmapCells([makeLog("2026-04-28")], "2026-04-29");
    const { completionRate } = computeHeatmapStats(cells);
    expect(completionRate).toBeGreaterThanOrEqual(0);
    expect(completionRate).toBeLessThanOrEqual(100);
  });

  it("weeklyAvg reflects logged sessions", () => {
    const logs = [makeLog("2026-04-28"), makeLog("2026-04-27"), makeLog("2026-04-25")];
    const cells = buildHeatmapCells(logs, "2026-04-29");
    expect(computeHeatmapStats(cells).weeklyAvg).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest trainingHeatmap.test --no-coverage
```

Expected: FAIL — `Cannot find module './trainingHeatmap'`

- [ ] **Step 3: Create `trainingHeatmap.ts`**

```typescript
// src/lib/analytics/trainingHeatmap.ts
import type { WorkoutLogDocument } from "@/lib/programs/types";

export type HeatmapCell = {
  intensity: 0 | 1 | 2 | 3 | 4;
  future: boolean;
};

export type HeatmapStats = {
  streak: number;
  weeklyAvg: number;
  completionRate: number;
};

const WEEKS = 26;
const DAYS_PER_WEEK = 7;

function mondayOf(today: Date): Date {
  const d = new Date(today);
  const dow = d.getUTCDay(); // 0=Sun
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offsetToMon);
  return d;
}

export function buildHeatmapCells(
  logs: WorkoutLogDocument[],
  todayStr: string,
): HeatmapCell[][] {
  const today = new Date(todayStr + "T00:00:00Z");
  const thisWeekMonday = mondayOf(today);
  const gridStart = new Date(thisWeekMonday);
  gridStart.setUTCDate(gridStart.getUTCDate() - (WEEKS - 1) * 7);

  // volume per date
  const volumeByDate = new Map<string, number>();
  for (const log of logs) {
    const date = log.performedAt.slice(0, 10);
    let vol = 0;
    for (const entry of log.entries) {
      for (const s of entry.sets) {
        vol += (s.weight ?? 0) * (s.reps ?? 1);
      }
    }
    volumeByDate.set(date, (volumeByDate.get(date) ?? 0) + vol);
  }

  // percentile thresholds for intensity bands
  const allVols = [...volumeByDate.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const p33 = allVols[Math.floor(allVols.length * 0.33)] ?? 1;
  const p66 = allVols[Math.floor(allVols.length * 0.66)] ?? 2;
  const p90 = allVols[Math.floor(allVols.length * 0.9)] ?? 3;

  function intensityFor(vol: number): 0 | 1 | 2 | 3 | 4 {
    if (vol === 0) return 0;
    if (vol < p33) return 1;
    if (vol < p66) return 2;
    if (vol < p90) return 3;
    return 4;
  }

  const todayTime = today.getTime();
  const cells: HeatmapCell[][] = [];

  for (let w = 0; w < WEEKS; w++) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const cellDate = new Date(gridStart);
      cellDate.setUTCDate(cellDate.getUTCDate() + w * 7 + d);
      const future = cellDate.getTime() > todayTime;
      const dateKey = cellDate.toISOString().slice(0, 10);
      const vol = volumeByDate.get(dateKey) ?? 0;
      week.push({ intensity: future ? 0 : intensityFor(vol), future });
    }
    cells.push(week);
  }

  return cells;
}

export function computeHeatmapStats(cells: HeatmapCell[][]): HeatmapStats {
  const flat = cells.flat();
  const pastCells = flat.filter((c) => !c.future);
  const loggedCount = pastCells.filter((c) => c.intensity > 0).length;

  let streak = 0;
  let broken = false;
  outer: for (let w = cells.length - 1; w >= 0; w--) {
    for (let d = DAYS_PER_WEEK - 1; d >= 0; d--) {
      const cell = cells[w][d];
      if (cell.future) continue;
      if (cell.intensity > 0) streak++;
      else { broken = true; break outer; }
    }
    if (broken) break;
  }

  const nonFutureWeeks = cells.filter((wk) => wk.some((c) => !c.future)).length;
  const weeklyAvg =
    nonFutureWeeks > 0
      ? Math.round((loggedCount / nonFutureWeeks) * 10) / 10
      : 0;
  const completionRate =
    pastCells.length > 0
      ? Math.round((loggedCount / pastCells.length) * 100)
      : 0;

  return { streak, weeklyAvg, completionRate };
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest trainingHeatmap.test --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/trainingHeatmap.ts src/lib/analytics/trainingHeatmap.test.ts
git commit -m "feat(profile): add training heatmap data layer"
```

---

### Task 3: `TrainingHeatmap.tsx` — visual component

**Files:**
- Create: `src/components/profile/TrainingHeatmap.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/profile/TrainingHeatmap.tsx
import {
  computeHeatmapStats,
  type HeatmapCell,
} from "@/lib/analytics/trainingHeatmap";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function cellColor(cell: HeatmapCell): string {
  if (cell.future || cell.intensity === 0) return "var(--bg-3)";
  if (cell.intensity === 1) return "color-mix(in oklab, var(--accent) 25%, var(--bg-2))";
  if (cell.intensity === 2) return "color-mix(in oklab, var(--accent) 45%, var(--bg-2))";
  if (cell.intensity === 3) return "color-mix(in oklab, var(--accent) 70%, var(--bg-2))";
  return "var(--accent)";
}

export function TrainingHeatmap({ cells }: { cells: HeatmapCell[][] }) {
  const stats = computeHeatmapStats(cells);

  return (
    <div className="panel">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="tx-up">Training frequency · 26 wks</span>
        <span className="flex-1" />
        <span className="tx-mono text-[10px] muted">{stats.completionRate}% logged</span>
      </div>

      <div className="flex gap-1.5 items-start overflow-x-auto">
        {/* Day labels */}
        <div
          className="flex flex-col gap-0.5 shrink-0 pt-3"
          style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--fg-3)" }}
        >
          {DAY_LABELS.map((label, i) => (
            <div key={i} style={{ height: 10, lineHeight: 1 }}>
              {i % 2 === 0 ? label : ""}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div
          className="flex-1 min-w-0"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
            gap: 2,
          }}
        >
          {cells.map((week, w) => (
            <div key={w} className="flex flex-col gap-0.5">
              {week.map((cell, d) => (
                <div
                  key={d}
                  style={{
                    height: 10,
                    borderRadius: 2,
                    background: cellColor(cell),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-3 mt-3"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}
      >
        <span>streak: <span style={{ color: "var(--accent)" }}>{stats.streak}</span></span>
        <span>·</span>
        <span>avg: <span style={{ color: "var(--fg-2)" }}>{stats.weeklyAvg}/wk</span></span>
        <span className="flex-1" />
        <span>less</span>
        {([0, 1, 2, 3, 4] as const).map((v) => (
          <div
            key={v}
            style={{ width: 10, height: 10, borderRadius: 2, background: cellColor({ intensity: v, future: false }) }}
          />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/TrainingHeatmap.tsx
git commit -m "feat(profile): add TrainingHeatmap visual component"
```

---

### Task 4: Rebuild `ProfileClient.tsx`

**Files:**
- Modify: `src/components/profile/ProfileClient.tsx`

The page layout (top to bottom):
1. **Avatar header** — initials circle + name + "local · profile.json"
2. **Training heatmap**
3. **Body card** — key/value grid (age, height, weight, bodyfat)
4. **Training history card** — tag chips
5. **Goals card** — tag chips
6. **Injuries / limitations card** — tag chips
7. **Equipment card** — tag chips
8. **Schedule card** — tag chips
9. **Prompt preferences card** — tag chips

Each card has a section label and an edit icon button (no-op for now — editing is a future plan).

- [ ] **Step 1: Replace the entire file**

```typescript
// src/components/profile/ProfileClient.tsx
"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { logRepo } from "@/lib/storage/logRepo";
import { buildHeatmapCells } from "@/lib/analytics/trainingHeatmap";
import { TrainingHeatmap } from "./TrainingHeatmap";
import type { HeatmapCell } from "@/lib/analytics/trainingHeatmap";
import type { ProfileDocument } from "@/lib/programs/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// Renders an array of strings as pill chips
function ChipList({ items }: { items: string[] }) {
  if (!items.length) return <p className="muted text-xs">None recorded</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--line)",
            color: "var(--fg-2)",
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// Renders an object as a 2-column key/value grid
function KVGrid({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data).filter(([, v]) => v && v !== "—");
  if (!entries.length) return <p className="muted text-xs">None recorded</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex justify-between py-0.5 border-b border-dashed"
          style={{
            borderColor: "var(--line)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--fg-3)" }}>{k}</span>
          <span style={{ color: "var(--fg)" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ProfileCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-2">
        <span className="tx-up flex-1">{label}</span>
        <button
          className="p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
          aria-label={`Edit ${label}`}
          onClick={() => {/* editing is a future plan */}}
        >
          <Pencil size={12} />
        </button>
      </div>
      {children}
    </div>
  );
}

export function ProfileClient() {
  const { profile, loading } = useLocalData();
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[][] | null>(null);

  useEffect(() => {
    logRepo.list().then((logs) => {
      const today = new Date().toISOString().slice(0, 10);
      setHeatmapCells(buildHeatmapCells(logs, today));
    });
  }, []);

  if (loading) return <p className="muted">Loading profile…</p>;
  if (!profile) return <p className="muted text-sm">No profile found. Import a program to create one.</p>;

  const body = profile.body ?? {};
  const bodyHasData = Object.values(body).some((v) => v && v !== "—");

  return (
    <div className="stack">
      {/* Avatar header */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-full font-semibold shrink-0"
          style={{
            width: 44,
            height: 44,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 16,
          }}
        >
          {initials(profile.name)}
        </div>
        <div>
          <p className="font-semibold text-base">{profile.name}</p>
          <p
            className="text-xs muted"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            local · profile.json
          </p>
        </div>
      </div>

      {/* Heatmap */}
      {heatmapCells && <TrainingHeatmap cells={heatmapCells} />}

      {/* Body */}
      {bodyHasData && (
        <ProfileCard label="Body">
          <KVGrid data={body as Record<string, string>} />
        </ProfileCard>
      )}

      {/* Training history */}
      <ProfileCard label="Training history">
        <ChipList items={profile.history ?? [profile.trainingAge].filter(Boolean)} />
      </ProfileCard>

      {/* Goals */}
      <ProfileCard label="Goals">
        <ChipList items={profile.goals} />
      </ProfileCard>

      {/* Injuries / limitations */}
      <ProfileCard label="Injuries / limitations">
        <ChipList items={profile.injuries ?? profile.constraints} />
      </ProfileCard>

      {/* Equipment */}
      <ProfileCard label="Equipment access">
        <ChipList items={profile.equipment} />
      </ProfileCard>

      {/* Schedule */}
      <ProfileCard label="Schedule">
        <ChipList
          items={
            profile.schedule ?? [`${profile.defaultDaysPerWeek} days/week`]
          }
        />
      </ProfileCard>

      {/* Prompt preferences */}
      {(profile.preferences ?? []).length > 0 && (
        <ProfileCard label="Prompt preferences">
          <ChipList items={profile.preferences!} />
        </ProfileCard>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

```bash
npm run dev
```

Navigate to `http://localhost:3000/profile`. Verify:
- Initials circle and name appear at the top
- Heatmap renders (all grey squares if no logs, coloured if logs exist)
- Streak / weekly average show in heatmap footer
- All card sections appear with their labels and chips/grid
- Edit pencil icon visible on each card (no-op click is fine)

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/ProfileClient.tsx
git commit -m "feat(profile): rebuild full profile page with avatar, heatmap, and all card sections"
```

---

## Self-Review

**Spec coverage:**
- ✅ Avatar header with initials circle and name
- ✅ 26-week heatmap from real log data
- ✅ Streak, weekly average, completion rate in heatmap footer
- ✅ Body card (key/value grid)
- ✅ Training history card (chips)
- ✅ Goals card (chips)
- ✅ Injuries / limitations card (chips, falls back to `constraints`)
- ✅ Equipment access card (chips)
- ✅ Schedule card (chips, falls back to `defaultDaysPerWeek`)
- ✅ Prompt preferences card (chips, hidden if empty)
- ✅ Edit buttons present (no-op — full inline editing is a separate concern)
- ✅ Graceful fallbacks for missing optional fields (existing stored profiles won't break)

**Placeholder scan:** No TBDs. All code complete.

**Type consistency:** `ProfileDocument` extended in Task 1; all optional fields accessed with `?? []` / `?? {}` fallbacks in Task 4. `HeatmapCell` defined in Task 2, used in Tasks 3 and 4.
