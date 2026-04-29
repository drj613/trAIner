# Program Map / Explorer View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/programs/[id]/map` route that shows a program's full week-by-week calendar grid — each cell is a training day with section summary, override badge, and a tap target to navigate to that day's workout. A sticky header shows the program title and mesocycle metadata.

**Architecture:** `ProgramMapClient` fetches the program from `programRepo`, calls `getRenderableDays` from `overrides.ts` to layer overrides, then groups days into a week-grid keyed by `weekNumber`. Each cell shows section count, primary section types (as colored dots), and an override indicator. No new data — pure view over existing storage.

**Tech Stack:** React 19, Next.js App Router, existing `programRepo` + `getRenderableDays`, Tailwind + CSS vars from `globals.css`, Jest + `@testing-library/react`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/workout/programGrid.ts` | Group `ProgramDay[]` into `WeekRow[]` by `weekNumber` |
| Create | `src/lib/workout/programGrid.test.ts` | Unit tests for grouping |
| Create | `src/components/workout/ProgramMapClient.tsx` | Full map component |
| Create | `src/app/programs/[id]/map/page.tsx` | Route wrapper |
| Modify | `src/components/workout/ProgramDetailClient.tsx` | Add "Map" link button |

---

## Task 1: programGrid grouping utility

**Files:**
- Create: `src/lib/workout/programGrid.ts`
- Create: `src/lib/workout/programGrid.test.ts`

- [ ] **Step 1.1: Write failing tests**

```ts
// src/lib/workout/programGrid.test.ts
import { buildWeekGrid, type WeekRow } from "./programGrid";
import type { ProgramDay } from "@/lib/programs/types";

function makeDay(id: string, weekNumber: number, dayNumber: number, title: string): ProgramDay {
  return { id, weekNumber, dayNumber, title, sections: [] };
}

describe("buildWeekGrid", () => {
  const days: ProgramDay[] = [
    makeDay("d1", 1, 1, "Upper A"),
    makeDay("d2", 1, 2, "Lower A"),
    makeDay("d3", 2, 1, "Upper B"),
    makeDay("d4", 2, 2, "Lower B"),
  ];

  it("groups into correct week count", () => {
    const grid = buildWeekGrid(days);
    expect(grid).toHaveLength(2);
  });

  it("week 1 has correct days in order", () => {
    const grid = buildWeekGrid(days);
    expect(grid[0].weekNumber).toBe(1);
    expect(grid[0].days.map((d) => d.title)).toEqual(["Upper A", "Lower A"]);
  });

  it("days without weekNumber fall into week 1", () => {
    const noWeekDays: ProgramDay[] = [makeDay("d1", undefined as unknown as number, 1, "Day A")];
    const grid = buildWeekGrid(noWeekDays);
    expect(grid).toHaveLength(1);
    expect(grid[0].weekNumber).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(buildWeekGrid([])).toEqual([]);
  });
});
```

- [ ] **Step 1.2: Run to confirm red**

```bash
bun run test -- programGrid --no-coverage
```

Expected: `Cannot find module './programGrid'`

- [ ] **Step 1.3: Implement**

```ts
// src/lib/workout/programGrid.ts
import type { ProgramDay } from "@/lib/programs/types";

export type WeekRow = {
  weekNumber: number;
  days: ProgramDay[];
};

export function buildWeekGrid(days: ProgramDay[]): WeekRow[] {
  const map = new Map<number, ProgramDay[]>();

  for (const day of days) {
    const week = day.weekNumber ?? 1;
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(day);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, weekDays]) => ({
      weekNumber,
      days: weekDays.sort((a, b) => a.dayNumber - b.dayNumber),
    }));
}
```

- [ ] **Step 1.4: Run tests green**

```bash
bun run test -- programGrid --no-coverage
```

Expected: 4 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/workout/programGrid.ts src/lib/workout/programGrid.test.ts
git commit -m "feat: add buildWeekGrid utility for program map"
```

---

## Task 2: ProgramMapClient component

**Files:**
- Create: `src/components/workout/ProgramMapClient.tsx`

- [ ] **Step 2.1: Implement**

```tsx
// src/components/workout/ProgramMapClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { programRepo } from "@/lib/storage/programRepo";
import { getRenderableDays } from "@/lib/programs/overrides";
import { buildWeekGrid } from "@/lib/workout/programGrid";
import type { ProgramDocument, ProgramDay } from "@/lib/programs/types";

// Map section type strings to dot colors
function sectionDot(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("warm")) return "#74b3ff";
  if (t.includes("strength") || t.includes("power")) return "var(--accent)";
  if (t.includes("hypert") || t.includes("access")) return "#c5a3ff";
  if (t.includes("metcon") || t.includes("cardio")) return "#e6b664";
  if (t.includes("rehab") || t.includes("cool")) return "#7fc77a";
  return "var(--fg-4)";
}

function DayCell({ day, programId }: { day: ProgramDay; programId: string }) {
  const isRest = day.sections.length === 0;

  if (isRest) {
    return (
      <div
        style={{
          padding: "10px 12px",
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          minHeight: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          rest
        </span>
      </div>
    );
  }

  return (
    <Link
      href={`/programs/${programId}?day=${day.id}`}
      style={{
        display: "block",
        padding: "10px 12px",
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r)",
        minHeight: 68,
        textDecoration: "none",
        transition: "background .1s, border-color .1s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--line-2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-2)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--line)";
      }}
    >
      {/* Section dots */}
      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
        {day.sections.slice(0, 6).map((s) => (
          <span
            key={s.id}
            title={s.name}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: sectionDot(s.type),
              flexShrink: 0,
            }}
          />
        ))}
        {day.sections.length > 6 && (
          <span style={{ fontSize: 9, color: "var(--fg-4)", fontFamily: "var(--font-mono)", alignSelf: "center" }}>
            +{day.sections.length - 6}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3 }}>
        {day.title}
      </div>

      {/* Meta */}
      <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
        {day.sections.length} section{day.sections.length !== 1 ? "s" : ""}
        {" · "}
        {day.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.exercises.length, 0), 0)} ex
      </div>
    </Link>
  );
}

export function ProgramMapClient({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    programRepo
      .get(programId)
      .then(setProgram)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) {
    return (
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading program map…
      </p>
    );
  }

  if (!program) {
    return (
      <div className="panel">
        <p style={{ color: "var(--fg-3)" }}>Program not found.</p>
      </div>
    );
  }

  const renderableDays = getRenderableDays(program);
  const grid = buildWeekGrid(renderableDays);
  const maxDaysInWeek = Math.max(...grid.map((w) => w.days.length), 1);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Program map
        </p>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
          {program.title}
        </h1>
        <p style={{ margin: "4px 0 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          {grid.length} week{grid.length !== 1 ? "s" : ""} · {renderableDays.length} training days
          {program.overrides.length > 0 && (
            <span style={{ color: "var(--warn)", marginLeft: 8 }}>
              · {program.overrides.length} override{program.overrides.length !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          ["warmup", "#74b3ff"],
          ["strength", "var(--accent)"],
          ["hypertrophy", "#c5a3ff"],
          ["metcon", "#e6b664"],
          ["rehab", "#7fc77a"],
        ].map(([label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Week rows */}
      {grid.map((week) => (
        <div key={week.weekNumber} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Week {week.weekNumber}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${maxDaysInWeek}, 1fr)`,
              gap: 8,
            }}
          >
            {week.days.map((day) => (
              <DayCell key={day.id} day={day} programId={programId} />
            ))}
            {/* fill empty columns */}
            {Array.from({ length: maxDaysInWeek - week.days.length }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2.2: Commit**

```bash
git add src/components/workout/ProgramMapClient.tsx
git commit -m "feat: add ProgramMapClient week-grid component"
```

---

## Task 3: Map route + link from Program Detail

**Files:**
- Create: `src/app/programs/[id]/map/page.tsx`
- Modify: `src/components/workout/ProgramDetailClient.tsx`

- [ ] **Step 3.1: Create route**

```tsx
// src/app/programs/[id]/map/page.tsx
import { ProgramMapClient } from "@/components/workout/ProgramMapClient";

export default async function ProgramMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProgramMapClient programId={id} />;
}
```

- [ ] **Step 3.2: Add Map link to ProgramDetailClient**

Open `src/components/workout/ProgramDetailClient.tsx`. Find the buttons/links section and add:

```tsx
import Link from "next/link";
import { Map } from "lucide-react";

// In the button row (near the existing Log and Edit buttons):
<Link href={`/programs/${program.id}/map`} className="button secondary" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
  <Map size={16} /> Map
</Link>
```

- [ ] **Step 3.3: Build check**

```bash
bun run build 2>&1 | tail -8
```

Expected: clean, new route `/programs/[id]/map` in route table.

- [ ] **Step 3.4: Manual smoke test**

```bash
bun run dev
```

1. Navigate to `/programs`.
2. Open any program.
3. Click "Map" — week grid loads with colored section dots per day.
4. Click a day cell → navigates to `/programs/[id]?day=...`.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/programs/[id]/map/page.tsx src/components/workout/ProgramDetailClient.tsx
git commit -m "feat: add /programs/[id]/map route with week-grid explorer"
```
