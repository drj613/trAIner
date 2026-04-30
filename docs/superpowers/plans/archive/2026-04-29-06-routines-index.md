# Routines Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare Programs list with a full Routines Index: active routine pinned at top with stat tiles + week-strip preview, compact rows for drafts/archived, filter chips, and activate/duplicate/delete actions.

**Architecture:** Extend `ProgramDocument` with routine metadata fields (status, daysPerWeek, lengthWeeks, completion, streakWeeks, lastRunAt, origin). Build `RoutinesIndexClient.tsx` that replaces `ProgramsClient.tsx`. Add `activate` and `duplicate` methods to `programRepo`. Nav label stays as "Programs" path but gets renamed "Routines" in the UI.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, idb, `programRepo`

---

### Task 1: Extend ProgramDocument with routine metadata

**Files:**
- Modify: `src/lib/programs/types.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/programs/routineMeta.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { programStatus } from "./routineMeta";
import type { ProgramDocument } from "./types";

const base: ProgramDocument = {
  id: "p1", title: "Test", source: "manual",
  active: false, days: [], overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("programStatus", () => {
  it("returns status field when present", () => {
    expect(programStatus({ ...base, status: "archived" })).toBe("archived");
  });

  it("returns active when active:true and no status field", () => {
    expect(programStatus({ ...base, active: true })).toBe("active");
  });

  it("returns draft when active:false and no status field", () => {
    expect(programStatus(base)).toBe("draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/programs/routineMeta.test.ts
```

Expected: FAIL with "Cannot find module './routineMeta'"

- [ ] **Step 3: Add status and metadata fields to ProgramDocument**

In `src/lib/programs/types.ts`, extend `ProgramDocument`:

```typescript
export type ProgramDocument = {
  id: ID;
  title: string;
  description?: string;
  source: "import" | "manual" | "backup";
  active: boolean;
  status?: "active" | "draft" | "archived";
  daysPerWeek?: number;
  lengthWeeks?: number;
  lastRunAt?: ISODate | null;
  streakWeeks?: number;
  completion?: number;
  origin?: string;
  days: ProgramDay[];
  overrides: ProgramOverride[];
  import?: {
    rawJson: unknown;
    warnings: ImportWarning[];
  };
  profileSnapshot?: ProfileDocument;
  createdAt: ISODate;
  updatedAt: ISODate;
};
```

- [ ] **Step 4: Create routineMeta.ts helper**

Create `src/lib/programs/routineMeta.ts`:

```typescript
import type { ProgramDocument } from "./types";

export function programStatus(p: ProgramDocument): "active" | "draft" | "archived" {
  if (p.status) return p.status;
  return p.active ? "active" : "draft";
}

export function programDaysPerWeek(p: ProgramDocument): number {
  if (p.daysPerWeek) return p.daysPerWeek;
  return p.days.filter((d) => !d.title?.toLowerCase().includes("rest")).length;
}

export function programLengthWeeks(p: ProgramDocument): number {
  if (p.lengthWeeks) return p.lengthWeeks;
  const weekNumbers = p.days.map((d) => d.weekNumber ?? 1);
  return Math.max(...weekNumbers, 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/programs/routineMeta.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/programs/types.ts src/lib/programs/routineMeta.ts src/lib/programs/routineMeta.test.ts
git commit -m "feat(routines): extend ProgramDocument with routine metadata fields"
```

---

### Task 2: Add activate and duplicate to programRepo

**Files:**
- Modify: `src/lib/storage/programRepo.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/programRepo.test.ts` (create if missing):

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { programRepo } from "./programRepo";
import { resetDbConnection } from "./appDb";
import "fake-indexeddb/auto";

const makeProgram = (id: string, active: boolean) => ({
  id, title: id, source: "manual" as const,
  active, days: [], overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => { resetDbConnection(); });

describe("programRepo.activate", () => {
  it("sets target active and deactivates others", async () => {
    await programRepo.save(makeProgram("p1", true));
    await programRepo.save(makeProgram("p2", false));
    await programRepo.activate("p2");
    const [p1, p2] = await Promise.all([
      programRepo.get("p1"),
      programRepo.get("p2"),
    ]);
    expect(p1?.active).toBe(false);
    expect(p1?.status).toBe("draft");
    expect(p2?.active).toBe(true);
    expect(p2?.status).toBe("active");
  });
});

describe("programRepo.duplicate", () => {
  it("creates a copy with a new id and draft status", async () => {
    await programRepo.save(makeProgram("p1", true));
    const copy = await programRepo.duplicate("p1");
    expect(copy.id).not.toBe("p1");
    expect(copy.active).toBe(false);
    expect(copy.status).toBe("draft");
    expect(copy.title).toMatch(/Copy of/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/storage/programRepo.test.ts
```

Expected: FAIL with "programRepo.activate is not a function"

- [ ] **Step 3: Read the current programRepo**

Read `src/lib/storage/programRepo.ts` to understand the current interface before adding methods.

- [ ] **Step 4: Add activate and duplicate methods**

Append to the `programRepo` object in `src/lib/storage/programRepo.ts`:

```typescript
  async activate(id: string): Promise<void> {
    const all = await this.list();
    const now = new Date().toISOString();
    await Promise.all(
      all.map((p) => {
        const isTarget = p.id === id;
        return this.save({
          ...p,
          active: isTarget,
          status: isTarget ? "active" : "draft",
          updatedAt: now,
        });
      })
    );
  },

  async duplicate(id: string): Promise<ProgramDocument> {
    const original = await this.get(id);
    if (!original) throw new Error(`Program ${id} not found`);
    const now = new Date().toISOString();
    const copy: ProgramDocument = {
      ...original,
      id: crypto.randomUUID(),
      title: `Copy of ${original.title}`,
      active: false,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await this.save(copy);
    return copy;
  },
```

Also add `import type { ProgramDocument } from "@/lib/programs/types";` if not already present.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/storage/programRepo.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/programRepo.ts src/lib/storage/programRepo.test.ts
git commit -m "feat(routines): add activate and duplicate to programRepo"
```

---

### Task 3: Build RoutinesIndexClient

**Files:**
- Create: `src/components/workout/RoutinesIndexClient.tsx`

This replaces `ProgramsClient.tsx` as the content of `/programs`.

- [ ] **Step 1: Write the failing test**

Create `src/components/workout/RoutinesIndexClient.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { RoutinesIndexClient } from "./RoutinesIndexClient";
import { vi } from "vitest";

vi.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [
      {
        id: "p1", title: "Upper/Lower v3", description: "Hypertrophy block",
        source: "manual", active: true, status: "active",
        daysPerWeek: 4, lengthWeeks: 4, streakWeeks: 11, completion: 0.68,
        lastRunAt: null, days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "p2", title: "Power Look Draft", description: "Push-pull focus",
        source: "manual", active: false, status: "draft",
        daysPerWeek: 4, lengthWeeks: 6, days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "p3", title: "Old Program", description: "Archived",
        source: "manual", active: false, status: "archived",
        daysPerWeek: 3, lengthWeeks: 8, days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    loading: false,
  }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("RoutinesIndexClient", () => {
  it("shows active routine pinned at top with ACTIVE badge", () => {
    render(<RoutinesIndexClient />);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("Upper/Lower v3")).toBeInTheDocument();
  });

  it("shows stat tiles for active routine", () => {
    render(<RoutinesIndexClient />);
    expect(screen.getByText("DAYS/WK")).toBeInTheDocument();
    expect(screen.getByText("STREAK")).toBeInTheDocument();
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });

  it("shows compact rows for non-active routines", () => {
    render(<RoutinesIndexClient />);
    expect(screen.getByText("Power Look Draft")).toBeInTheDocument();
  });

  it("filter chip hides archived when 'draft' selected", async () => {
    render(<RoutinesIndexClient />);
    fireEvent.click(screen.getByText(/^draft/));
    await waitFor(() => {
      expect(screen.queryByText("Old Program")).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/components/workout/RoutinesIndexClient.test.tsx
```

Expected: FAIL with "Cannot find module './RoutinesIndexClient'"

- [ ] **Step 3: Create RoutinesIndexClient.tsx**

Create `src/components/workout/RoutinesIndexClient.tsx`:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { programRepo } from "@/lib/storage/programRepo";
import { programStatus, programDaysPerWeek, programLengthWeeks } from "@/lib/programs/routineMeta";
import type { ProgramDocument } from "@/lib/programs/types";

type Filter = "all" | "draft" | "archived";

const STATUS_COLOR = {
  active: "var(--good, #7fc77a)",
  draft: "var(--warn, #e6b664)",
  archived: "var(--fg-3)",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 3,
      background: STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? "var(--fg-3)",
      flexShrink: 0, display: "inline-block",
    }} />
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status.toUpperCase();
  const color = STATUS_COLOR[status as keyof typeof STATUS_COLOR] ?? "var(--fg-3)";
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
      letterSpacing: "0.1em", color,
      padding: "1px 6px", borderRadius: "var(--r-sm, 4px)",
      border: `1px solid ${color}`,
      background: status === "active" ? "rgba(127,199,122,0.08)" : "transparent",
    }}>
      {label}
    </span>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line)",
      borderRadius: "var(--r-sm, 4px)", padding: "4px 6px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase",
        letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 1,
      }}>{label}</div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
        color: accent ? "var(--accent)" : "var(--fg)",
      }}>{value}</div>
    </div>
  );
}

function WeekStrip({ days }: { days: ProgramDocument["days"] }) {
  const slots = days.slice(0, 7);
  if (slots.length === 0) return null;
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
      {slots.map((d, i) => {
        const isRest = d.title?.toLowerCase().includes("rest");
        return (
          <div key={d.id} style={{
            flex: 1, height: 28,
            background: isRest ? "transparent" : "var(--bg-2)",
            border: `1px ${isRest ? "dashed" : "solid"} var(--line)`,
            borderRadius: "var(--r-sm, 4px)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--fg-4)", textTransform: "uppercase" }}>
              {DAY_LABELS[i] ?? `D${i + 1}`}
            </span>
            {!isRest && (
              <span style={{ width: 5, height: 5, borderRadius: 2.5, marginTop: 2, background: "var(--fg-4)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActiveCard({ program, onOpen, onRun }: { program: ProgramDocument; onOpen: () => void; onRun: () => void }) {
  const pct = Math.round((program.completion ?? 0) * 100);
  const dpw = programDaysPerWeek(program);
  const lw = programLengthWeeks(program);
  return (
    <div style={{
      background: "var(--bg-1)", border: "1px solid var(--accent)",
      borderRadius: "var(--r, 6px)", overflow: "hidden", marginBottom: 10,
    }}>
      <div style={{
        padding: "10px 12px 8px", background: "var(--accent-soft)",
        borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <StatusBadge status="active" />
        <span style={{ flex: 1 }} />
        {program.lastRunAt && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-2)" }}>
            last run · {program.lastRunAt.slice(0, 10)}
          </span>
        )}
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 2 }}>
          {program.title}
        </div>
        {program.description && (
          <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 10, lineHeight: 1.4 }}>
            {program.description}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
          <StatTile label="DAYS/WK" value={String(dpw)} />
          <StatTile label="LENGTH" value={`${lw}w`} />
          <StatTile label="STREAK" value={`${program.streakWeeks ?? 0}w`} />
          <StatTile label="DONE" value={`${pct}%`} accent={pct >= 50} />
        </div>
        <WeekStrip days={program.days} />
        <div style={{ display: "flex", gap: 6 }}>
          <button className="button" onClick={onRun} style={{ flex: 1, justifyContent: "center" }}>
            Open today
          </button>
          <button className="button secondary" onClick={onOpen} style={{ flex: 1, justifyContent: "center" }}>
            View routine
          </button>
        </div>
      </div>
    </div>
  );
}

function RoutineRow({
  program,
  onOpen,
  onActivate,
  onDuplicate,
  onDelete,
}: {
  program: ProgramDocument;
  onOpen: () => void;
  onActivate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = programStatus(program);
  const dpw = programDaysPerWeek(program);
  const lw = programLengthWeeks(program);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", marginBottom: 4,
      background: "var(--bg-1)", border: "1px solid var(--line)",
      borderRadius: "var(--r, 6px)", position: "relative",
      opacity: status === "archived" ? 0.7 : 1,
    }}>
      <StatusDot status={status} />
      <button onClick={onOpen} style={{
        flex: 1, minWidth: 0, textAlign: "left",
        background: "transparent", border: "none", padding: 0,
        cursor: "pointer", fontFamily: "inherit", color: "var(--fg)",
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {program.title}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
          {dpw}d/wk · {lw}w{status === "draft" ? " · not started" : ""}
          {program.lastRunAt && ` · ${program.lastRunAt.slice(0, 10)}`}
        </div>
      </button>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        style={{ background: "transparent", border: "none", padding: 4, color: "var(--fg-3)", cursor: "pointer" }}
      >
        ···
      </button>
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 5 }} />
          <div style={{
            position: "absolute", right: 8, top: "100%", marginTop: 2,
            background: "var(--bg-2)", border: "1px solid var(--line)",
            borderRadius: "var(--r, 6px)", overflow: "hidden",
            zIndex: 10, minWidth: 140,
            boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
          }}>
            {status !== "active" && (
              <MenuButton label="Activate" onClick={() => { setMenuOpen(false); onActivate(); }} />
            )}
            <MenuButton label="Duplicate" onClick={() => { setMenuOpen(false); onDuplicate(); }} />
            <MenuButton label="Open editor" onClick={() => { setMenuOpen(false); onOpen(); }} />
            <MenuButton label="Delete" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px", background: "transparent",
      border: "none", borderBottom: "1px solid var(--line)",
      cursor: "pointer", fontFamily: "inherit", fontSize: 12,
      color: danger ? "var(--bad, #ef9a9a)" : "var(--fg)",
      textAlign: "left",
    }}>
      {label}
    </button>
  );
}

export function RoutinesIndexClient() {
  const { programs, loading } = useLocalData();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  if (loading) return <p className="muted">Loading routines…</p>;

  const active = programs.find((p) => programStatus(p) === "active");
  const others = programs.filter((p) => programStatus(p) !== "active");
  const filtered = filter === "all" ? others : others.filter((p) => programStatus(p) === filter);

  async function handleActivate(id: string) {
    await programRepo.activate(id);
    router.refresh();
  }

  async function handleDuplicate(id: string) {
    const copy = await programRepo.duplicate(id);
    router.push(`/programs/${copy.id}`);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this routine?")) return;
    await programRepo.delete(id);
    router.refresh();
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: "10px 12px", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="tx-up">Routines</span>
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 1, fontFamily: "var(--font-mono)" }}>
            {programs.length} total · {programs.filter((p) => programStatus(p) === "active").length} active · {programs.filter((p) => programStatus(p) === "draft").length} draft
          </div>
        </div>
        <Link href="/programs/new" className="button" style={{ padding: "5px 10px", fontSize: 11.5 }}>
          + New
        </Link>
      </div>

      {/* Active routine pinned */}
      {active && (
        <div style={{ padding: "10px 10px 0" }}>
          <ActiveCard
            program={active}
            onOpen={() => router.push(`/programs/${active.id}`)}
            onRun={() => router.push("/today")}
          />
        </div>
      )}

      {/* Filter chips */}
      <div style={{
        padding: "4px 10px 8px", display: "flex", alignItems: "center", gap: 4,
        borderBottom: "1px solid var(--line)",
      }}>
        <span className="tx-up" style={{ fontSize: 9.5 }}>Other</span>
        {(["all", "draft", "archived"] as Filter[]).map((k) => {
          const count = k === "all" ? others.length : others.filter((p) => programStatus(p) === k).length;
          const active = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                padding: "2px 7px", borderRadius: "var(--r-sm, 4px)",
                background: active ? "var(--accent-soft)" : "transparent",
                border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                color: active ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer",
              }}
            >
              {k} <span style={{ color: "var(--fg-4)" }}>·{count}</span>
            </button>
          );
        })}
      </div>

      {/* Other routines */}
      <div style={{ padding: 10 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center", color: "var(--fg-3)", fontSize: 12,
            background: "var(--bg-1)", border: "1px dashed var(--line)",
            borderRadius: "var(--r, 6px)",
          }}>
            <div style={{ marginBottom: 4 }}>No {filter === "all" ? "other" : filter} routines</div>
            <Link href="/programs/new" style={{ color: "var(--accent)", fontFamily: "inherit", fontSize: 12 }}>
              Build a new one
            </Link>
          </div>
        ) : (
          filtered.map((p) => (
            <RoutineRow
              key={p.id}
              program={p}
              onOpen={() => router.push(`/programs/${p.id}`)}
              onActivate={() => handleActivate(p.id)}
              onDuplicate={() => handleDuplicate(p.id)}
              onDelete={() => handleDelete(p.id)}
            />
          ))
        )}
      </div>

      {/* Workspace footer */}
      <div style={{
        padding: "10px 12px", borderTop: "1px solid var(--line)",
        fontFamily: "var(--font-mono)", fontSize: 10.5,
        color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>routines.json · {programs.length} entries</span>
        <span style={{ flex: 1 }} />
        <span>local</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/components/workout/RoutinesIndexClient.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workout/RoutinesIndexClient.tsx src/components/workout/RoutinesIndexClient.test.tsx
git commit -m "feat(routines): build RoutinesIndexClient with active card + compact rows"
```

---

### Task 4: Wire RoutinesIndexClient into the programs page and verify delete method

**Files:**
- Modify: `src/app/programs/page.tsx`
- Modify: `src/lib/storage/programRepo.ts` (ensure `delete` method exists)
- Modify: `src/components/app/AppShell.tsx` (rename nav label)

- [ ] **Step 1: Check programRepo.delete exists**

Read `src/lib/storage/programRepo.ts`. If a `delete` method is missing, add it:

```typescript
  async delete(id: string): Promise<void> {
    await (await getDb()).delete("programs", id);
  },
```

- [ ] **Step 2: Update programs page to use RoutinesIndexClient**

Read `src/app/programs/page.tsx` then replace its content:

```typescript
import { RoutinesIndexClient } from "@/components/workout/RoutinesIndexClient";

export default function ProgramsPage() {
  return <RoutinesIndexClient />;
}
```

- [ ] **Step 3: Rename nav label to "Routines"**

In `src/components/app/AppShell.tsx`, find:

```typescript
  { href: "/programs", label: "Programs", icon: Dumbbell },
```

Replace with:

```typescript
  { href: "/programs", label: "Routines", icon: Dumbbell },
```

- [ ] **Step 4: Type-check the whole project**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/programs/page.tsx src/lib/storage/programRepo.ts src/components/app/AppShell.tsx
git commit -m "feat(routines): wire RoutinesIndexClient into /programs, rename nav to Routines"
```

---

### Task 5: Add back-to-list chev to ProgramDetailClient

**Files:**
- Modify: `src/components/workout/ProgramDetailClient.tsx`

The design's RoutineOverview shows a `‹` back button in the header when entered from the routines index. Since `/programs/[id]` is always entered from `/programs`, we can add this unconditionally.

- [ ] **Step 1: Read the current ProgramDetailClient header**

Read `src/components/workout/ProgramDetailClient.tsx` lines 1-45 to confirm the header structure.

- [ ] **Step 2: Add back button**

In `src/components/workout/ProgramDetailClient.tsx`, find the outer `<div className="stack">` and the inner header div. Add a back link above the title:

```typescript
import Link from "next/link";
import { ChevronLeft, Map } from "lucide-react";
```

Replace the existing header `<div className="flex flex-wrap items-center justify-between gap-3">` block to prepend a back row:

```typescript
  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Link
          href="/programs"
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--fg-3)", textDecoration: "none",
          }}
        >
          <ChevronLeft size={12} /> Routines
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* ... rest of header unchanged ... */}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/workout/ProgramDetailClient.tsx
git commit -m "feat(routines): add back-to-list chev on program detail header"
```
