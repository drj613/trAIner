# Workspace Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Settings page into a full Workspace page matching the design — stats panel, snapshot/export/import/reset actions, and appearance settings.

**Architecture:** A `WorkspaceClient` component loads live stats from all repos on mount, then renders a stats grid, four action rows (export, import, snapshot, reset), a local-first blurb, and an appearance section (theme/density/font) below. The existing `/settings` route is kept; only the nav label and client component change.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, idb IndexedDB repos, `navigator.storage.estimate()`

---

### Task 1: Create workspace stats loader

**Files:**
- Create: `src/lib/workspace/stats.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/workspace/stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage/profileRepo", () => ({
  profileRepo: { get: vi.fn().mockResolvedValue({ id: "p1" }) },
}));
vi.mock("@/lib/storage/programRepo", () => ({
  programRepo: { list: vi.fn().mockResolvedValue([{}, {}]) },
}));
vi.mock("@/lib/storage/logRepo", () => ({
  logRepo: { list: vi.fn().mockResolvedValue(Array.from({ length: 5 })) },
}));
vi.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: { list: vi.fn().mockResolvedValue([{}, {}, {}]) },
}));
vi.mock("@/lib/storage/backupRepo", () => ({
  backupRepo: {
    list: vi.fn().mockResolvedValue([
      { id: "2026-04-20T00:00:00.000Z" },
      { id: "2026-04-22T00:00:00.000Z" },
    ]),
  },
}));

Object.defineProperty(global.navigator, "storage", {
  value: { estimate: vi.fn().mockResolvedValue({ usage: 1887437 }) },
  configurable: true,
});

import { loadWorkspaceStats } from "./stats";

describe("loadWorkspaceStats", () => {
  it("returns counts from repos and storage size", async () => {
    const stats = await loadWorkspaceStats();
    expect(stats.profile).toBe(1);
    expect(stats.programs).toBe(2);
    expect(stats.logs).toBe(5);
    expect(stats.aliases).toBe(3);
    expect(stats.snapshots).toBe(2);
    expect(stats.lastSnapshotAt).toBe("2026-04-22");
    expect(stats.sizeKB).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/workspace/stats.test.ts
```

Expected: FAIL with "Cannot find module './stats'"

- [ ] **Step 3: Implement stats loader**

Create `src/lib/workspace/stats.ts`:

```typescript
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { backupRepo } from "@/lib/storage/backupRepo";

export type WorkspaceStats = {
  profile: 0 | 1;
  programs: number;
  logs: number;
  aliases: number;
  snapshots: number;
  lastSnapshotAt: string | null;
  sizeKB: number;
};

export async function loadWorkspaceStats(): Promise<WorkspaceStats> {
  const [profile, programs, logs, aliases, snapshots, storageEstimate] = await Promise.all([
    profileRepo.get(),
    programRepo.list(),
    logRepo.list(),
    aliasRepo.list(),
    backupRepo.list(),
    navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0 }),
  ]);

  const sorted = [...snapshots].sort((a, b) => b.id.localeCompare(a.id));
  const lastSnapshotAt = sorted[0]?.id
    ? sorted[0].id.slice(0, 10)
    : null;

  return {
    profile: profile ? 1 : 0,
    programs: programs.length,
    logs: logs.length,
    aliases: aliases.length,
    snapshots: snapshots.length,
    lastSnapshotAt,
    sizeKB: Math.round((storageEstimate.usage ?? 0) / 1024),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/workspace/stats.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace/stats.ts src/lib/workspace/stats.test.ts
git commit -m "feat(workspace): add WorkspaceStats loader"
```

---

### Task 2: Add reset utility to backup library

**Files:**
- Modify: `src/lib/backup/backup.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/backup/backup.test.ts` (create if it doesn't exist):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/storage/appDb", () => ({
  DB_NAME: "trainer-local-first",
  resetDbConnection: vi.fn(),
}));

const deleteDatabase = vi.fn().mockReturnValue({ onsuccess: null, onerror: null });
Object.defineProperty(global, "indexedDB", {
  value: { deleteDatabase },
  configurable: true,
});

import { resetWorkspace } from "./backup";
import { resetDbConnection } from "@/lib/storage/appDb";

describe("resetWorkspace", () => {
  it("deletes the database and resets the connection", async () => {
    const promise = resetWorkspace();
    // trigger onsuccess
    const req = deleteDatabase.mock.results[0].value;
    req.onsuccess?.();
    await promise;
    expect(deleteDatabase).toHaveBeenCalledWith("trainer-local-first");
    expect(resetDbConnection).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/backup/backup.test.ts
```

Expected: FAIL with "resetWorkspace is not exported"

- [ ] **Step 3: Add resetWorkspace to backup.ts**

Open `src/lib/backup/backup.ts` and append:

```typescript
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";

export async function resetWorkspace(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { resetDbConnection(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/lib/backup/backup.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/backup/backup.ts src/lib/backup/backup.test.ts
git commit -m "feat(workspace): add resetWorkspace utility"
```

---

### Task 3: Rebuild SettingsClient as WorkspaceClient

**Files:**
- Modify: `src/components/app/SettingsClient.tsx` (full rewrite)

The design has four ActionRow entries, a stats panel, a local-first blurb, and appearance (theme/density/font) below.

- [ ] **Step 1: Write the failing test**

Create `src/components/app/WorkspaceClient.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsClient } from "./SettingsClient";
import { vi } from "vitest";

vi.mock("@/lib/workspace/stats", () => ({
  loadWorkspaceStats: vi.fn().mockResolvedValue({
    profile: 1,
    programs: 3,
    logs: 412,
    aliases: 28,
    snapshots: 4,
    lastSnapshotAt: "2026-04-22",
    sizeKB: 1842,
  }),
}));

vi.mock("@/lib/backup/backup", () => ({
  exportBackup: vi.fn().mockResolvedValue({ exportedAt: "2026-04-29T00:00:00.000Z", version: 1, programs: [], logs: [], aliases: [] }),
  restoreBackup: vi.fn(),
  resetWorkspace: vi.fn(),
}));

vi.mock("@/components/app/ThemeProvider", () => ({
  setDensity: vi.fn(),
  setTheme: vi.fn(),
  setMono: vi.fn(),
}));

describe("SettingsClient (workspace)", () => {
  it("shows workspace stats after loading", async () => {
    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByText("412")).toBeInTheDocument();
      expect(screen.getByText("programs")).toBeInTheDocument();
    });
  });

  it("shows all four action rows", async () => {
    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByText("Export full workspace")).toBeInTheDocument();
      expect(screen.getByText("Import workspace")).toBeInTheDocument();
      expect(screen.getByText("Snapshot current state")).toBeInTheDocument();
      expect(screen.getByText("Reset workspace")).toBeInTheDocument();
    });
  });

  it("shows local-first copy", async () => {
    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByText(/All data lives in your browser/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/components/app/WorkspaceClient.test.tsx
```

Expected: FAIL (old SettingsClient doesn't have these elements)

- [ ] **Step 3: Rewrite SettingsClient.tsx**

Replace the entire contents of `src/components/app/SettingsClient.tsx`:

```typescript
"use client";

import { useEffect, useState, useRef } from "react";
import { setDensity, setTheme, setMono } from "@/components/app/ThemeProvider";
import { exportBackup, restoreBackup, resetWorkspace } from "@/lib/backup/backup";
import { backupRepo } from "@/lib/storage/backupRepo";
import { loadWorkspaceStats, type WorkspaceStats } from "@/lib/workspace/stats";

type Density = "comfy" | "default" | "dense";
type Mono = "jetbrains" | "system";

const THEMES = ["editor", "terminal", "logbook", "linen", "paper", "midnight"] as const;
const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfy", label: "Comfy" },
  { value: "default", label: "Default" },
  { value: "dense", label: "Dense" },
];

const STAT_KEYS: (keyof WorkspaceStats)[] = ["profile", "programs", "logs", "aliases", "snapshots"];

function readAttr(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return document.documentElement.getAttribute(name) ?? fallback;
}

function ActionRow({
  label,
  sub,
  variant = "default",
  onClick,
  children,
}: {
  label: string;
  sub: string;
  variant?: "primary" | "warn" | "danger" | "default";
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const color =
    variant === "primary" ? "var(--accent)" :
    variant === "warn" ? "var(--warn, #e6b664)" :
    variant === "danger" ? "var(--bad, #ef9a9a)" :
    "var(--fg-3)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        textAlign: "left",
        padding: "10px 12px",
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        cursor: "pointer",
        width: "100%",
        gap: 8,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{sub}</div>
      </div>
      <span style={{ fontSize: 11, color, fontFamily: "var(--font-mono)" }}>›</span>
      {children}
    </button>
  );
}

export function SettingsClient() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [theme, setThemeState] = useState(() => readAttr("data-theme", "linen"));
  const [density, setDensityState] = useState<Density>(
    () => readAttr("data-density", "default") as Density
  );
  const [mono, setMonoState] = useState<Mono>(
    () => readAttr("data-mono", "jetbrains") as Mono
  );
  const [snapshotting, setSnapshotting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWorkspaceStats().then(setStats);
  }, []);

  function handleTheme(t: string) {
    setTheme(t);
    setThemeState(t);
  }
  function handleDensity(d: Density) {
    setDensity(d);
    setDensityState(d);
  }
  function handleMono(m: Mono) {
    setMono(m);
    setMonoState(m);
  }

  async function handleExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trAIner-workspace-${backup.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file?: File) {
    if (!file) return;
    if (!confirm("This will replace all local data. Continue?")) return;
    try {
      const data = JSON.parse(await file.text());
      await restoreBackup(data);
      const fresh = await loadWorkspaceStats();
      setStats(fresh);
    } catch {
      alert("Failed to restore — invalid file format.");
    }
  }

  async function handleSnapshot() {
    setSnapshotting(true);
    try {
      const backup = await exportBackup();
      await backupRepo.save(backup);
      const fresh = await loadWorkspaceStats();
      setStats(fresh);
    } finally {
      setSnapshotting(false);
    }
  }

  async function handleReset() {
    if (!confirm("Wipe all local data? This cannot be undone.")) return;
    await resetWorkspace();
    window.location.reload();
  }

  const sizeLabel = stats
    ? stats.sizeKB >= 1024
      ? `${(stats.sizeKB / 1024).toFixed(2)} MB`
      : `${stats.sizeKB} KB`
    : "…";

  const snapshotSub = stats?.snapshots
    ? `${stats.snapshots} snapshot${stats.snapshots !== 1 ? "s" : ""} · last ${stats.lastSnapshotAt ?? "—"}`
    : "no snapshots";

  const exportSub = stats
    ? `trAIner-workspace-${new Date().toISOString().slice(0, 10)}.json · ~${sizeLabel}`
    : "loading…";

  return (
    <div style={{ padding: 12 }}>

      {/* Stats panel */}
      <div style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        padding: 12,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="tx-up">Workspace</span>
          <span style={{ flex: 1 }} />
          <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
            local · {sizeLabel}
          </span>
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4px 14px",
        }}>
          {STAT_KEYS.map((k) => (
            <div key={k} style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3px 0",
              borderBottom: "1px dashed var(--line)",
            }}>
              <span style={{ color: "var(--fg-3)" }}>{k}</span>
              <span style={{ color: "var(--fg)" }}>
                {stats ? String(stats[k] ?? 0) : "…"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <ActionRow
          label="Export full workspace"
          sub={exportSub}
          variant="primary"
          onClick={handleExport}
        />
        <ActionRow
          label="Import workspace"
          sub="Replace all local data — destructive"
          variant="warn"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
        </ActionRow>
        <ActionRow
          label={snapshotting ? "Saving…" : "Snapshot current state"}
          sub={snapshotSub}
          onClick={handleSnapshot}
        />
        <ActionRow
          label="Reset workspace"
          sub="Wipe all local data"
          variant="danger"
          onClick={handleReset}
        />
      </div>

      {/* Local-first blurb */}
      <div style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        padding: 10,
        fontSize: 11.5,
        color: "var(--fg-2)",
        lineHeight: 1.55,
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="tx-up" style={{ color: "var(--good, #7fc77a)" }}>Local-first</span>
        </div>
        All data lives in your browser via IndexedDB. No account, no sync, no telemetry. Export to back up or move between devices.
      </div>

      {/* Appearance */}
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
        Appearance
      </p>

      <section style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Theme
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={theme === t}
              onClick={() => handleTheme(t)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${theme === t ? "var(--accent)" : "var(--line)"}`,
                background: theme === t ? "var(--accent-soft)" : "transparent",
                color: theme === t ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Density
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {DENSITIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={density === value}
              onClick={() => handleDensity(value)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${density === value ? "var(--accent)" : "var(--line)"}`,
                background: density === value ? "var(--accent-soft)" : "transparent",
                color: density === value ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Monospace Font
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {(["jetbrains", "system"] as Mono[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mono === m}
              onClick={() => handleMono(m)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${mono === m ? "var(--accent)" : "var(--line)"}`,
                background: mono === m ? "var(--accent-soft)" : "transparent",
                color: mono === m ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {m === "jetbrains" ? "JetBrains" : "System"}
            </button>
          ))}
        </div>
      </section>

    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx vitest run src/components/app/WorkspaceClient.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/app/SettingsClient.tsx src/components/app/WorkspaceClient.test.tsx
git commit -m "feat(workspace): rebuild SettingsClient as Workspace page"
```

---

### Task 4: Rename "Settings" → "Workspace" in nav

**Files:**
- Modify: `src/components/app/AppShell.tsx`

- [ ] **Step 1: Update nav label**

In `src/components/app/AppShell.tsx`, find:

```typescript
  { href: "/settings", label: "Settings", icon: Settings },
```

Replace with:

```typescript
  { href: "/settings", label: "Workspace", icon: Settings },
```

- [ ] **Step 2: Verify the app renders**

```bash
cd /Users/djdjo/Documents/mine/trAIner && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/app/AppShell.tsx
git commit -m "feat(workspace): rename Settings nav item to Workspace"
```
