# Onboarding Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a non-blocking profile setup nudge on Today and Prompts pages, fix the Profile page creation experience, and make the Settings reset action visually distinct and harder to trigger accidentally.

**Architecture:** All nudges key off `profile === undefined && !loading` from the existing `LocalDataProvider` context — no new storage or flags. `ProfileClient` gets a parallel creation path (all fields open at once) that activates when no profile exists. `SettingsClient` gets a Danger zone section at the bottom with a two-step reveal replacing the current single-confirm ActionRow.

**Tech Stack:** React, TypeScript, React Router v6, `@testing-library/react`, Jest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/workout/TodayClient.tsx` | Modify | Add profile banner when no profile exists |
| `src/components/workout/TodayClient.test.tsx` | Create | Test banner render condition |
| `src/components/prompts/PromptBuilderClient.tsx` | Modify | Add no-profile warning above prompt output |
| `src/components/prompts/PromptBuilderClient.test.tsx` | Create | Test warning render condition |
| `src/components/profile/ProfileClient.tsx` | Modify | Replace dead-end message with editable creation form |
| `src/components/profile/ProfileClient.test.tsx` | Create | Test empty state and creation save flow |
| `src/components/app/SettingsClient.tsx` | Modify | Move reset into Danger zone with two-step reveal |
| `src/components/app/SettingsClient.test.tsx` | Create | Test two-step reset flow |

---

## Task 1: Today Page — Profile Banner

**Files:**
- Modify: `src/components/workout/TodayClient.tsx`
- Create: `src/components/workout/TodayClient.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/workout/TodayClient.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayClient } from "./TodayClient";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [],
    profile: undefined,
    loading: false,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { listForProgram: jest.fn().mockResolvedValue([]) },
}));

describe("TodayClient", () => {
  it("shows profile setup banner when no profile exists", () => {
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.getByText(/set up your Profile/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the banner when profile exists", () => {
    jest.resetModules();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test -- --testPathPattern="TodayClient.test" --runInBand
```

Expected: FAIL — "set up your Profile" not found in document.

- [ ] **Step 3: Add `profile` to the destructure in `TodayClient` and render the banner**

In `src/components/workout/TodayClient.tsx`, find the `TodayClient` function (line ~495). Change the destructure and add the banner as the first thing rendered after the loading guard:

```tsx
// Change this line:
const { programs, loading, refresh } = useLocalData();
// To:
const { programs, profile, loading, refresh } = useLocalData();
```

Then add the banner JSX directly above the `if (loading || dayResolving)` guard (which is at line ~572), or as the first element in the final return. The simplest place is immediately before the outer `return` at the bottom of the function — add a banner that sits above the WorkoutView/empty-state content.

Replace the final return block's opening (around line 580–591) to prepend the banner:

```tsx
return (
  <div>
    {!profile && !loading && (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          marginBottom: 14,
          background: "var(--accent-soft)",
          border: "1px solid var(--accent)",
          borderRadius: "var(--r, 6px)",
          fontSize: 13,
          color: "var(--fg)",
        }}
      >
        <span style={{ flex: 1 }}>
          Welcome to trAIner — set up your Profile so the app can tailor your workouts.
        </span>
        <Link
          to="/profile"
          style={{
            color: "var(--accent)",
            fontWeight: 600,
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Go to Profile →
        </Link>
      </div>
    )}
    {/* existing content below — the no-program panel or WorkoutView */}
    ...
  </div>
);
```

Add `Link` to the import from `react-router-dom` at the top of the file.

Note: `TodayClient` currently has two separate early return paths (`loading || dayResolving` and `!activeProgram || !resolvedDay`) and then the full workout return. The banner should appear in **all three** final states, so the cleanest approach is to wrap the whole render in a fragment/div and prepend the banner. Here is the exact pattern — replace the three return statements with a single return that conditionally renders inner content:

```tsx
// After the useEffects, replace all existing return statements with:

const banner = !profile && !loading ? (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      marginBottom: 14,
      background: "var(--accent-soft)",
      border: "1px solid var(--accent)",
      borderRadius: "var(--r, 6px)",
      fontSize: 13,
      color: "var(--fg)",
    }}
  >
    <span style={{ flex: 1 }}>
      Welcome to trAIner — set up your Profile so the app can tailor your workouts.
    </span>
    <Link
      to="/profile"
      style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none" }}
    >
      Go to Profile →
    </Link>
  </div>
) : null;

if (loading || dayResolving) {
  return (
    <>
      {banner}
      <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading…
      </p>
    </>
  );
}

if (!activeProgram || !resolvedDay) {
  return (
    <>
      {banner}
      <div className="panel stack">
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Today</h1>
        <p style={{ color: "var(--fg-3)" }}>
          Import a program to start logging workouts.
        </p>
      </div>
    </>
  );
}

return (
  <>
    {banner}
    {/* existing WorkoutView JSX */}
  </>
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test -- --testPathPattern="TodayClient.test" --runInBand
```

Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
bun run test -- --runInBand
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/workout/TodayClient.tsx src/components/workout/TodayClient.test.tsx
git commit -m "feat: show profile setup banner on Today when no profile exists"
```

---

## Task 2: Prompts Page — No-Profile Warning

**Files:**
- Modify: `src/components/prompts/PromptBuilderClient.tsx`
- Create: `src/components/prompts/PromptBuilderClient.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/prompts/PromptBuilderClient.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PromptBuilderClient } from "./PromptBuilderClient";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: undefined,
    programs: [],
    loading: false,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe("PromptBuilderClient", () => {
  it("shows a no-profile warning when profile is undefined", () => {
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    expect(screen.getByText(/no profile found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test -- --testPathPattern="PromptBuilderClient.test" --runInBand
```

Expected: FAIL — "no profile found" not found in document.

- [ ] **Step 3: Add the warning block in `PromptBuilderClient`**

In `src/components/prompts/PromptBuilderClient.tsx`, add `Link` to the `react-router-dom` import (or add the import if not present). Then in the return JSX, insert the warning block as the first child of the outer `<div className="stack">`, before the coach personas section:

```tsx
import { Link } from "react-router-dom";

// Inside the return, as first child of <div className="stack">:
{!profile && (
  <div
    style={{
      padding: "10px 14px",
      background: "color-mix(in srgb, var(--warn, #e6b664) 12%, var(--bg-2))",
      border: "1px solid var(--warn, #e6b664)",
      borderRadius: "var(--r, 6px)",
      fontSize: 13,
      color: "var(--fg)",
      lineHeight: 1.5,
    }}
  >
    No profile found. The prompt below won't include your goals, equipment, or constraints —
    fill out your{" "}
    <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600 }}>
      Profile
    </Link>{" "}
    first for a useful result.
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test -- --testPathPattern="PromptBuilderClient.test" --runInBand
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
bun run test -- --runInBand
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/prompts/PromptBuilderClient.tsx src/components/prompts/PromptBuilderClient.test.tsx
git commit -m "feat: warn on Prompts page when no profile is set up"
```

---

## Task 3: Profile Page — Empty State (Creation Mode)

**Files:**
- Modify: `src/components/profile/ProfileClient.tsx`
- Create: `src/components/profile/ProfileClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/profile/ProfileClient.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileClient } from "./ProfileClient";
import { profileRepo } from "@/lib/storage/profileRepo";

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { list: jest.fn().mockResolvedValue([]) },
}));

jest.mock("@/lib/storage/profileRepo", () => ({
  profileRepo: { save: jest.fn().mockResolvedValue(undefined) },
}));

const mockRefresh = jest.fn().mockResolvedValue(undefined);

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: undefined,
    loading: false,
    refresh: mockRefresh,
  }),
}));

beforeEach(() => jest.clearAllMocks());

describe("ProfileClient — no profile", () => {
  it("renders a creation form, not the dead-end message", () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    expect(screen.queryByText(/import a program/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  });

  it("saves and refreshes when the Save profile button is clicked", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(profileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alex", id: "local-profile" })
      );
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- --testPathPattern="ProfileClient.test" --runInBand
```

Expected: FAIL — placeholder and button not found, dead-end message rendered instead.

- [ ] **Step 3: Implement the creation mode in `ProfileClient`**

In `src/components/profile/ProfileClient.tsx`, make these changes:

**a) Add `isCreating` derived value and blank-draft initializer:**

After the existing state declarations (around line 240), add:

```tsx
const isCreating = !loading && !profile;

useEffect(() => {
  if (isCreating) {
    setDraft({
      id: "local-profile",
      name: "",
      goals: [],
      equipment: [],
      constraints: [],
      injuries: [],
      history: [],
      schedule: [],
      preferences: [],
      trainingAge: "",
      defaultDaysPerWeek: 4,
      updatedAt: "",
    });
  }
}, [isCreating]);
```

**b) Replace the dead-end `!profile` guard** (line ~268):

Remove:
```tsx
if (!profile) return <p className="muted text-sm">No profile found. Import a program to create one.</p>;
```

Replace with a creation form that renders when `isCreating && draft`:

```tsx
if (isCreating) {
  if (!draft) return null; // draft initializing

  async function saveNewProfile() {
    if (!draft) return;
    await profileRepo.save({ ...draft, updatedAt: new Date().toISOString() });
    await refresh();
  }

  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Set up your Profile</h2>
        <button
          type="button"
          className="button"
          style={{ padding: "4px 14px", fontSize: 12 }}
          onClick={() => void saveNewProfile()}
        >
          Save profile
        </button>
      </div>

      <div className="panel">
        <p className="tx-up mb-2">Name</p>
        <input
          className="input w-full"
          style={{ fontSize: 13, padding: "5px 9px" }}
          placeholder="Your name"
          autoFocus
          value={draft.name}
          onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
        />
      </div>

      <div className="panel">
        <p className="tx-up mb-2">Goals</p>
        <EditableChips
          items={draft.goals}
          onChange={(goals) => setDraft((d) => d && { ...d, goals })}
        />
      </div>

      <div className="panel">
        <p className="tx-up mb-2">Equipment access</p>
        <EditableChips
          items={draft.equipment}
          onChange={(equipment) => setDraft((d) => d && { ...d, equipment })}
        />
      </div>

      <div className="panel">
        <p className="tx-up mb-2">Injuries / limitations</p>
        <EditableChips
          items={draft.injuries ?? []}
          onChange={(injuries) => setDraft((d) => d && { ...d, injuries })}
        />
      </div>

      <div className="panel">
        <p className="tx-up mb-2">Training age</p>
        <input
          className="input w-full"
          style={{ fontSize: 12, padding: "3px 7px" }}
          placeholder="e.g. 3 years, intermediate"
          value={draft.trainingAge}
          onChange={(e) => setDraft((d) => d && { ...d, trainingAge: e.target.value })}
        />
      </div>

      <div className="panel">
        <p className="tx-up mb-2">Default days / week</p>
        <input
          type="number"
          min={1}
          max={7}
          className="input w-full"
          style={{ fontSize: 12, padding: "3px 7px" }}
          value={draft.defaultDaysPerWeek}
          onChange={(e) =>
            setDraft((d) => d && { ...d, defaultDaysPerWeek: Number(e.target.value) })
          }
        />
      </div>
    </div>
  );
}
```

The existing profile view (with `ProfileCard` sections) is untouched below this new guard.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- --testPathPattern="ProfileClient.test" --runInBand
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
bun run test -- --runInBand
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/ProfileClient.tsx src/components/profile/ProfileClient.test.tsx
git commit -m "feat: profile creation form for new users; replace dead-end empty state"
```

---

## Task 4: Settings Page — Reset Danger Zone

**Files:**
- Modify: `src/components/app/SettingsClient.tsx`
- Create: `src/components/app/SettingsClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/app/SettingsClient.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsClient } from "./SettingsClient";

jest.mock("@/lib/backup/backup", () => ({
  exportBackup: jest.fn().mockResolvedValue({ exportedAt: "2026-05-06T00:00:00.000Z", programs: [], logs: [], aliases: [] }),
  restoreBackup: jest.fn().mockResolvedValue(undefined),
  resetWorkspace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/storage/backupRepo", () => ({
  backupRepo: { save: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/workspace/stats", () => ({
  loadWorkspaceStats: jest.fn().mockResolvedValue({
    profile: 1, programs: 2, logs: 5, aliases: 3, snapshots: 0,
    sizeKB: 42, lastSnapshotAt: null,
  }),
}));

jest.mock("@/components/app/ThemeProvider", () => ({
  setTheme: jest.fn(),
  setDensity: jest.fn(),
  setMono: jest.fn(),
}));

describe("SettingsClient — reset workspace", () => {
  it("shows the reset button but not the confirmation panel by default", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /reset workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yes, wipe everything/i })).not.toBeInTheDocument();
  });

  it("reveals confirmation panel on first click without wiping", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    expect(screen.getByRole("button", { name: /yes, wipe everything/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("collapses the panel when Cancel is clicked", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /yes, wipe everything/i })).not.toBeInTheDocument();
  });

  it("calls resetWorkspace when the confirm button is clicked", async () => {
    const { resetWorkspace } = require("@/lib/backup/backup");
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadMock }, writable: true });

    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, wipe everything/i }));

    await waitFor(() => {
      expect(resetWorkspace).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- --testPathPattern="SettingsClient.test" --runInBand
```

Expected: FAIL — confirmation panel not found / wrong behavior.

- [ ] **Step 3: Refactor `SettingsClient` reset to the two-step danger zone**

In `src/components/app/SettingsClient.tsx`:

**a) Add `resetOpen` state** at the top of the component, alongside the existing state declarations:

```tsx
const [resetOpen, setResetOpen] = useState(false);
```

**b) Remove `handleReset`** (the function that calls `confirm()`) — delete it entirely.

**c) Remove the `ActionRow` for reset** from the actions block:

```tsx
// Delete this line:
<ActionRow label="Reset workspace" sub="Wipe all local data" variant="danger" onClick={handleReset} />
```

**d) Add the Danger zone section** at the bottom of the returned JSX, after the Appearance section (after the monospace font `<section>`), before the closing `</div>`:

```tsx
{/* Danger zone */}
<div style={{ marginTop: 32 }}>
  <p
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--bad, #ef9a9a)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      margin: "0 0 12px",
    }}
  >
    Danger
  </p>
  <button
    type="button"
    onClick={() => setResetOpen((o) => !o)}
    style={{
      display: "block",
      width: "100%",
      padding: "10px 16px",
      background: "var(--bad, #ef5350)",
      color: "#fff",
      border: "none",
      borderRadius: "var(--r, 6px)",
      fontWeight: 600,
      fontSize: 13,
      cursor: "pointer",
      textAlign: "left",
    }}
  >
    Reset workspace
  </button>
  {resetOpen && (
    <div
      style={{
        marginTop: 8,
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--bad, #ef5350) 8%, var(--bg-2))",
        border: "1px solid var(--bad, #ef5350)",
        borderRadius: "var(--r, 6px)",
      }}
    >
      <p style={{ fontSize: 13, color: "var(--fg)", marginBottom: 12, lineHeight: 1.5 }}>
        This will permanently delete all programs, logs, profile data, and aliases.
        This cannot be undone.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={async () => {
            await resetWorkspace();
            window.location.reload();
          }}
          style={{
            padding: "7px 14px",
            background: "var(--bad, #ef5350)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--r, 6px)",
            fontWeight: 600,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Yes, wipe everything
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ fontSize: 12, padding: "7px 12px" }}
          onClick={() => setResetOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- --testPathPattern="SettingsClient.test" --runInBand
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
bun run test -- --runInBand
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/app/SettingsClient.tsx src/components/app/SettingsClient.test.tsx
git commit -m "feat: move reset workspace to danger zone with two-step confirmation"
```

---

## Final Check

- [ ] **Run quality gates**

```bash
bun run lint
bun x tsc --noEmit
bun x tsc --noEmit -p tsconfig.test.json
bun run test -- --runInBand
```

Expected: all pass with no errors.

- [ ] **Manual smoke test**

1. Clear site data (DevTools → Application → Storage → Clear site data)
2. Open `/today` — profile banner appears
3. Open `/prompts` — no-profile warning appears above generated prompt
4. Open `/profile` — creation form renders with empty fields
5. Fill in name and at least one goal, click "Save profile"
6. Return to `/today` — banner is gone
7. Return to `/prompts` — warning is gone
8. Open `/settings`, scroll to bottom — "Danger" section is visible below Appearance
9. Click "Reset workspace" — confirmation panel expands, nothing wiped
10. Click "Cancel" — panel collapses
11. Click "Reset workspace" again → "Yes, wipe everything" — app reloads to fresh state
