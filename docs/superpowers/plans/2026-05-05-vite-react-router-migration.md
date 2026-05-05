# Vite + React Router Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Next.js with Vite + React Router so the app can be deployed as a fully static SPA to GitHub Pages (or any static host).

**Architecture:** Vite builds a single-page app with a static `index.html` entry point. React Router v6 handles client-side routing inside a `BrowserRouter`. All existing `Client` components are wired directly as route elements; the thin Next.js `page.tsx` wrappers are deleted. All data remains in IndexedDB — no server-side logic was ever used.

**Tech Stack:** Vite 6, `@vitejs/plugin-react`, `react-router-dom@^6`, `react-router-dom` (replaces `next/link` + `next/navigation`), Tailwind via PostCSS (unchanged), Jest + jsdom (unchanged, just drop the `nextJest` wrapper), Playwright (just update port).

---

## File Map

### New files
- `index.html` — HTML shell with Google Fonts `<link>` tags, `<div id="root">`, Vite entry
- `vite.config.ts` — Vite config with `@vitejs/plugin-react`, `@/` alias, optional `base`
- `src/main.tsx` — ReactDOM entry point, mounts `<App />`
- `src/App.tsx` — `BrowserRouter` + all route definitions
- `src/components/workout/DiffPage.tsx` — extracted from `src/app/programs/[id]/diff/page.tsx`, using `react-router-dom`
- `public/manifest.webmanifest` — static PWA manifest JSON (replaces `src/app/manifest.ts`)
- `public/404.html` — GitHub Pages SPA routing redirect shim
- `.github/workflows/deploy.yml` — GitHub Pages deployment

### Modified files
- `package.json` — remove `next`, add `vite`, `@vitejs/plugin-react`, `react-router-dom`
- `tsconfig.json` — remove `next` plugin, update `include`, keep `@/*` path alias
- `jest.config.js` — replace `nextJest` wrapper with plain config (same module mapper)
- `playwright.config.ts` — change port 3000 → 5173, command `next dev` → `vite`
- `src/app/globals.css` — add `:root { --font-ui: 'Inter'; --font-jetbrains: 'JetBrains Mono' }`
- `src/components/app/AppShell.tsx` — `next/link` → `react-router-dom`, `usePathname` → `useLocation`
- `src/components/pwa/ServiceWorkerRegistration.tsx` — `process.env.NODE_ENV` → `import.meta.env.PROD`
- `src/components/workout/ProgramDetailClient.tsx` — `next/link` → `react-router-dom`
- `src/components/workout/ProgramsClient.tsx` — `next/link` → `react-router-dom`
- `src/components/workout/ProgramMapClient.tsx` — `next/link` → `react-router-dom`
- `src/components/workout/RoutinesIndexClient.tsx` — `next/link` + `useRouter` → `react-router-dom`
- `src/components/workout/TodayClient.tsx` — `useRouter` → `useNavigate`
- `src/components/workout/RoutineBuilderClient.tsx` — `useRouter` → `useNavigate`
- `public/sw.js` — update manifest URL from `/manifest.webmanifest` (already correct, verify)

### Deleted files
- `next.config.ts`
- `next-env.d.ts`
- `src/app/` (entire directory — all 18 files)

---

## Task 1: Swap dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove Next.js, add Vite + React Router in package.json**

Open `package.json`. In `dependencies`, remove `"next": "15.4.3"` and add:
```json
"react-router-dom": "^6.28.0",
"vite": "^6.3.5"
```
In `devDependencies`, remove `"eslint-config-next": "15.4.3"` and add:
```json
"@vitejs/plugin-react": "^4.4.1"
```
In `scripts`, replace:
```json
"dev": "next dev --turbopack",
"build": "next build",
"start": "next start",
```
with:
```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview",
```

- [ ] **Step 2: Install**

```bash
bun install
```

Expected: lockfile updates, no errors. `next` removed from `node_modules`.

- [ ] **Step 3: Verify next is gone**

```bash
ls node_modules | grep next
```

Expected: no output (or only `next-tick` / unrelated packages — not `next` itself).

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: swap Next.js for Vite + react-router-dom"
```

---

## Task 2: Vite config, HTML entry, fonts, and PWA manifest

**Files:**
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `public/manifest.webmanifest`
- Modify: `src/app/globals.css`
- Delete: `next.config.ts`, `next-env.d.ts`

- [ ] **Step 1: Create `vite.config.ts`**

Create `/Users/djdjo/Documents/mine/trAIner/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  // Uncomment and set to your GitHub repo name if deploying to username.github.io/reponame:
  // base: "/trainer-app/",
});
```

- [ ] **Step 2: Create `index.html`**

Create `/Users/djdjo/Documents/mine/trAIner/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#2f6fdf" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap"
      rel="stylesheet"
    />
    <title>trAIner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Add font CSS variables to globals.css**

In `src/app/globals.css`, locate the existing `:root` block (around line 175) that starts with `--font-mono:`. Add two lines at the top of that block:

```css
:root {
  --font-ui: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-jetbrains: "JetBrains Mono", ui-monospace, monospace;
  --font-mono: var(--font-jetbrains, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  /* ... rest unchanged */
}
```

- [ ] **Step 4: Create `public/manifest.webmanifest`**

Create `/Users/djdjo/Documents/mine/trAIner/public/manifest.webmanifest`:
```json
{
  "name": "trAIner",
  "short_name": "trAIner",
  "description": "Local-first workout planner and logger.",
  "start_url": "/today",
  "display": "standalone",
  "background_color": "#f7f6f2",
  "theme_color": "#1f7a6d",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 5: Delete Next.js config files**

```bash
rm next.config.ts next-env.d.ts
```

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts index.html public/manifest.webmanifest src/app/globals.css
git rm next.config.ts next-env.d.ts
git commit -m "feat: add Vite config, index.html, and static PWA manifest"
```

---

## Task 3: Create `src/main.tsx` and `src/App.tsx`

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/components/workout/DiffPage.tsx`

- [ ] **Step 1: Create `src/main.tsx`**

Create `/Users/djdjo/Documents/mine/trAIner/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Extract DiffPage to its own component**

Create `/Users/djdjo/Documents/mine/trAIner/src/components/workout/DiffPage.tsx`.
This is the logic from `src/app/programs/[id]/diff/page.tsx`, rewritten to use `react-router-dom`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { programRepo } from "@/lib/storage/programRepo";
import { DiffReview } from "@/components/workout/DiffReview";
import { diffDays } from "@/lib/workout/programDiff";
import { loadPendingDiff, clearPendingDiff } from "@/lib/workout/pendingDiff";
import type { ProgramDay } from "@/lib/programs/types";

export function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<{ original: ProgramDay; replacement: ProgramDay } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const data = loadPendingDiff();
    if (!data) { navigate(`/programs/${id}`, { replace: true }); return; }
    if (data.programId !== id) { navigate(`/programs/${id}`, { replace: true }); return; }
    setState({ original: data.original, replacement: data.replacement });
  }, [id, navigate]);

  if (!state) return <p style={{ color: "var(--fg-3)", padding: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading diff…</p>;

  const diffs = diffDays(state.original, state.replacement);

  async function handleAccept() {
    setSaveError(null);
    try {
      const program = await programRepo.get(id!);
      if (!program) {
        setSaveError("Program not found — changes could not be saved.");
        return;
      }
      await programRepo.save({
        ...program,
        overrides: [
          ...program.overrides,
          {
            id: crypto.randomUUID(),
            scope: "day" as const,
            programId: program.id,
            dayId: state!.original.id,
            replacement: state!.replacement,
            reason: "Modified with AI",
            createdAt: new Date().toISOString(),
          },
        ],
      });
      clearPendingDiff();
      navigate("/today", { replace: true });
    } catch (e) {
      console.error("[diff] failed to save override", e);
      setSaveError("Failed to save changes. Please try again.");
    }
  }

  function handleDiscard() {
    clearPendingDiff();
    navigate(-1);
  }

  return (
    <div style={{ height: "calc(100dvh - 78px)", display: "flex", flexDirection: "column" }}>
      {saveError && (
        <p style={{ color: "var(--bad)", fontSize: 12, fontFamily: "var(--font-mono)", padding: "0 16px" }}>
          {saveError}
        </p>
      )}
      <DiffReview diffs={diffs} replacement={state.replacement} onAccept={handleAccept} onDiscard={handleDiscard} />
    </div>
  );
}
```

- [ ] **Step 3: Create `src/App.tsx`**

Create `/Users/djdjo/Documents/mine/trAIner/src/App.tsx`:
```tsx
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import { LocalDataProvider } from "@/components/app/LocalDataProvider";
import { AppShell } from "@/components/app/AppShell";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { TodayClient } from "@/components/workout/TodayClient";
import { RoutinesIndexClient } from "@/components/workout/RoutinesIndexClient";
import { RoutineBuilderClient } from "@/components/workout/RoutineBuilderClient";
import { ProgramDetailClient } from "@/components/workout/ProgramDetailClient";
import { EditClient } from "@/components/workout/EditClient";
import { LogClient } from "@/components/workout/LogClient";
import { DiffPage } from "@/components/workout/DiffPage";
import { ProgramMapClient } from "@/components/workout/ProgramMapClient";
import { HistoryClient } from "@/components/workout/HistoryClient";
import { LibraryClient } from "@/components/catalog/LibraryClient";
import { ImportClient } from "@/components/import/ImportClient";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { SettingsClient } from "@/components/app/SettingsClient";
import { PromptBuilderClient } from "@/components/prompts/PromptBuilderClient";

function ProgramDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <ProgramDetailClient id={id!} />;
}

function EditRoute() {
  const { id } = useParams<{ id: string }>();
  return <EditClient programId={id!} />;
}

function LogRoute() {
  const { id } = useParams<{ id: string }>();
  return <LogClient programId={id!} />;
}

function MapRoute() {
  const { id } = useParams<{ id: string }>();
  return <ProgramMapClient programId={id!} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LocalDataProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<TodayClient />} />
              <Route path="/programs" element={<RoutinesIndexClient />} />
              <Route path="/programs/new" element={<RoutineBuilderClient />} />
              <Route path="/programs/:id" element={<ProgramDetailRoute />} />
              <Route path="/programs/:id/edit" element={<EditRoute />} />
              <Route path="/programs/:id/log" element={<LogRoute />} />
              <Route path="/programs/:id/diff" element={<DiffPage />} />
              <Route path="/programs/:id/map" element={<MapRoute />} />
              <Route path="/history" element={<HistoryClient />} />
              <Route path="/library" element={<LibraryClient />} />
              <Route path="/import" element={<ImportClient />} />
              <Route path="/profile" element={<ProfileClient />} />
              <Route path="/settings" element={<SettingsClient />} />
              <Route path="/prompts" element={<PromptBuilderClient />} />
            </Routes>
          </AppShell>
        </LocalDataProvider>
      </ThemeProvider>
      <ServiceWorkerRegistration />
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx src/App.tsx src/components/workout/DiffPage.tsx
git commit -m "feat: add Vite entry point, App router, and DiffPage component"
```

---

## Task 4: Update navigation imports in components

Replace all `next/link` and `next/navigation` imports across 7 components. Each sub-step is one file.

**Files:**
- Modify: `src/components/app/AppShell.tsx`
- Modify: `src/components/pwa/ServiceWorkerRegistration.tsx`
- Modify: `src/components/workout/ProgramDetailClient.tsx`
- Modify: `src/components/workout/ProgramsClient.tsx`
- Modify: `src/components/workout/ProgramMapClient.tsx`
- Modify: `src/components/workout/RoutinesIndexClient.tsx`
- Modify: `src/components/workout/TodayClient.tsx`
- Modify: `src/components/workout/RoutineBuilderClient.tsx`

- [ ] **Step 1: Update `AppShell.tsx`**

In `src/components/app/AppShell.tsx`:

Replace:
```tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
```
with:
```tsx
import { Link, useLocation } from "react-router-dom";
```

Replace (line ~216):
```tsx
const pathname = usePathname();
```
with:
```tsx
const { pathname } = useLocation();
```

Replace the `href` prop on all `<Link>` elements with `to`. There are two `<Link>` usages inside `NavDrawer` — change every `href={item.href}` to `to={item.href}`.

Full `<Link>` element inside the map (find the block starting at ~line 113):
```tsx
<Link
  key={item.href}
  to={item.href}
  onClick={onClose}
  style={{ ... }}
>
```

- [ ] **Step 2: Update `ServiceWorkerRegistration.tsx`**

In `src/components/pwa/ServiceWorkerRegistration.tsx`, replace:
```tsx
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
```
with:
```tsx
if ("serviceWorker" in navigator && import.meta.env.PROD) {
```

- [ ] **Step 3: Update `ProgramDetailClient.tsx`**

In `src/components/workout/ProgramDetailClient.tsx`, replace:
```tsx
import Link from "next/link";
```
with:
```tsx
import { Link } from "react-router-dom";
```

Change all `href=` props on `<Link>` elements to `to=`. There are 4 `<Link>` usages in this file — each has `href={...}`, change each to `to={...}`.

- [ ] **Step 4: Update `ProgramsClient.tsx`**

In `src/components/workout/ProgramsClient.tsx`, replace:
```tsx
import Link from "next/link";
```
with:
```tsx
import { Link } from "react-router-dom";
```

Change all `href=` props to `to=`. There are 3 `<Link>` elements in this file.

- [ ] **Step 5: Update `ProgramMapClient.tsx`**

In `src/components/workout/ProgramMapClient.tsx`, replace:
```tsx
import Link from "next/link";
```
with:
```tsx
import { Link } from "react-router-dom";
```

Change the `href=` prop on the `<Link>` wrapping the program card to `to=`.

- [ ] **Step 6: Update `RoutinesIndexClient.tsx`**

In `src/components/workout/RoutinesIndexClient.tsx`, replace:
```tsx
import Link from "next/link";
import { useRouter } from "next/navigation";
```
with:
```tsx
import { Link, useNavigate } from "react-router-dom";
```

Replace (line ~437):
```tsx
const router = useRouter();
```
with:
```tsx
const navigate = useNavigate();
```

Replace all `router.push(...)` calls with `navigate(...)`:
- `router.push(`/programs/${copy.id}`)` → `navigate(`/programs/${copy.id}`)`
- `router.push(`/programs/${active.id}`)` → `navigate(`/programs/${active.id}`)`
- `router.push("/today")` → `navigate("/today")`
- `router.push(`/programs/${p.id}`)` → `navigate(`/programs/${p.id}`)`

Change all `<Link href=` to `<Link to=`. There are 2 `<Link>` elements (lines ~500, ~571).

- [ ] **Step 7: Update `TodayClient.tsx`**

In `src/components/workout/TodayClient.tsx`, replace:
```tsx
import { useRouter } from "next/navigation";
```
with:
```tsx
import { useNavigate } from "react-router-dom";
```

Replace (line ~288):
```tsx
const router = useRouter();
```
with:
```tsx
const navigate = useNavigate();
```

Replace (line ~382):
```tsx
router.push(`/programs/${program.id}/diff`);
```
with:
```tsx
navigate(`/programs/${program.id}/diff`);
```

- [ ] **Step 8: Update `RoutineBuilderClient.tsx`**

In `src/components/workout/RoutineBuilderClient.tsx`, replace:
```tsx
import { useRouter } from "next/navigation";
```
with:
```tsx
import { useNavigate } from "react-router-dom";
```

Replace (line ~389):
```tsx
const router = useRouter();
```
with:
```tsx
const navigate = useNavigate();
```

Replace all `router.push(...)` calls:
- `router.push(`/programs/${program.id}`)` → `navigate(`/programs/${program.id}`)`
- `router.push("/programs")` → `navigate("/programs")`

- [ ] **Step 9: Commit**

```bash
git add src/components/app/AppShell.tsx \
        src/components/pwa/ServiceWorkerRegistration.tsx \
        src/components/workout/ProgramDetailClient.tsx \
        src/components/workout/ProgramsClient.tsx \
        src/components/workout/ProgramMapClient.tsx \
        src/components/workout/RoutinesIndexClient.tsx \
        src/components/workout/TodayClient.tsx \
        src/components/workout/RoutineBuilderClient.tsx
git commit -m "feat: replace next/link and next/navigation with react-router-dom"
```

---

## Task 5: Update TypeScript config

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Update tsconfig.json**

In `tsconfig.json`:

Remove from `plugins`:
```json
"plugins": [{ "name": "next" }],
```
→ Replace with (or remove the plugins key entirely):
```json
"plugins": [],
```

Change `"include"` from:
```json
["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"]
```
to:
```json
["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
```

Change `"moduleResolution"` from `"bundler"` to `"bundler"` (unchanged — Vite also supports bundler resolution).

The `"paths": { "@/*": ["./src/*"] }` stays as-is — Vite reads this for type checking (the runtime alias is in `vite.config.ts`).

- [ ] **Step 2: Verify TypeScript is happy**

```bash
bunx tsc --noEmit
```

Expected: 0 errors. If you see errors about `next`, check that `next-env.d.ts` is gone and that no import still references `next/`.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: update tsconfig for Vite (remove next plugin)"
```

---

## Task 6: Update Jest config

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: Replace nextJest wrapper with plain config**

Replace the entire contents of `jest.config.js` with:

```js
/** @type {import('jest').Config} */
module.exports = {
  setupFiles: ["fake-indexeddb/auto"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.worktrees/",
    "<rootDir>/e2e/",
  ],
};
```

- [ ] **Step 2: Create CSS mock**

The CSS import in `src/main.tsx` will be encountered by Jest. Create `__mocks__/styleMock.js`:

```js
module.exports = {};
```

- [ ] **Step 3: Verify Jest still works**

```bash
bun run test --passWithNoTests
```

Expected: all existing lib tests pass. If `ts-jest` is not installed, add it:
```bash
bun add -d ts-jest
```

- [ ] **Step 4: Commit**

```bash
git add jest.config.js __mocks__/styleMock.js
git commit -m "chore: replace nextJest with plain jest + ts-jest config"
```

---

## Task 7: Update Playwright config and service worker

**Files:**
- Modify: `playwright.config.ts`
- Modify: `public/sw.js`

- [ ] **Step 1: Update playwright.config.ts**

In `playwright.config.ts`, change:

```ts
use: {
  baseURL: "http://localhost:3000",
```
→
```ts
use: {
  baseURL: "http://localhost:5173",
```

Change `webServer`:
```ts
webServer: {
  command: "bun run dev",
  url: "http://localhost:5173",
  reuseExistingServer: true,
  timeout: 30_000,
},
```

- [ ] **Step 2: Verify the sw.js manifest URL**

Open `public/sw.js`. The `APP_SHELL` array currently caches `"/manifest.webmanifest"`. This is already the correct path for the new static manifest file — no change needed. Verify it reads:

```js
const APP_SHELL = ["/", "/today", "/programs", "/import", "/profile", "/prompts", "/settings", "/manifest.webmanifest"];
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "chore: update Playwright to Vite dev server port 5173"
```

---

## Task 8: Delete Next.js page files and verify dev server

**Files:**
- Delete: `src/app/` (except `globals.css` which stays at `src/app/globals.css`)

- [ ] **Step 1: Delete all Next.js page files (keep globals.css)**

```bash
git rm src/app/page.tsx \
       src/app/layout.tsx \
       src/app/manifest.ts \
       src/app/history/page.tsx \
       src/app/import/page.tsx \
       src/app/library/page.tsx \
       src/app/profile/page.tsx \
       src/app/prompts/page.tsx \
       src/app/settings/page.tsx \
       src/app/today/page.tsx \
       "src/app/programs/[id]/page.tsx" \
       "src/app/programs/[id]/diff/page.tsx" \
       "src/app/programs/[id]/edit/page.tsx" \
       "src/app/programs/[id]/log/page.tsx" \
       "src/app/programs/[id]/map/page.tsx" \
       src/app/programs/new/page.tsx \
       src/app/programs/page.tsx
```

The `src/app/globals.css` file stays — `src/main.tsx` imports it.

- [ ] **Step 2: Start the dev server and verify**

```bash
bun run dev
```

Open `http://localhost:5173` in a browser. Expected:
- Redirects to `/today`
- App shell renders with nav drawer button
- Fonts load (Inter for body, JetBrains Mono visible in mono elements)
- No console errors about missing modules

Navigate to `/programs`, `/history`, `/settings` — all should render their respective client components.

- [ ] **Step 3: Run Jest tests**

```bash
bun run test
```

Expected: all lib and component tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: delete Next.js pages — app now fully Vite-based"
```

---

## Task 9: GitHub Pages SPA routing + deployment workflow

**Files:**
- Create: `public/404.html`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `public/404.html`**

GitHub Pages serves `404.html` for any unknown path. This script captures the path and redirects to `/` with the path encoded in the query string, so the SPA can restore it.

Create `/Users/djdjo/Documents/mine/trAIner/public/404.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>trAIner</title>
    <script>
      // GitHub Pages SPA redirect: encode the path and redirect to /
      var l = window.location;
      l.replace(
        l.protocol + "//" + l.hostname + (l.port ? ":" + l.port : "") +
        l.pathname.split("/").slice(0, 1).join("/") +
        "/?p=" + encodeURIComponent(l.pathname + l.search) +
        "&h=" + l.hash.slice(1)
      );
    </script>
  </head>
</html>
```

- [ ] **Step 2: Add redirect recovery to `index.html`**

In `index.html`, inside `<head>` after the `<title>`, add this script block that restores the path before React boots:

```html
<script>
  // Restore path encoded by 404.html (GitHub Pages SPA routing)
  (function () {
    var q = window.location.search;
    if (q && q.indexOf("?p=") === 0) {
      var decoded = decodeURIComponent(q.slice(3).replace(/&h=.*$/, ""));
      var hash = q.match(/&h=(.*)$/);
      window.history.replaceState(
        null,
        null,
        decoded + (hash ? "#" + hash[1] : "")
      );
    }
  })();
</script>
```

- [ ] **Step 3: Create `.github/workflows/deploy.yml`**

Create `/Users/djdjo/Documents/mine/trAIner/.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 4: Note on `base` config**

If the repo is at `github.com/username/trainer-app` and you access it at `username.github.io/trainer-app`, uncomment the `base` line in `vite.config.ts`:
```ts
base: "/trainer-app/",
```
If you use a custom domain (`trainer.example.com`), leave `base` as `/`.

- [ ] **Step 5: Verify build succeeds**

```bash
bun run build
```

Expected: `dist/` directory created with `index.html`, `404.html`, `manifest.webmanifest`, `assets/`, `sw.js`, `icon-*.png`.

Check `dist/index.html` exists and `dist/404.html` exists.

- [ ] **Step 6: Test the build locally**

```bash
bun run preview
```

Open `http://localhost:4173`. Navigate to `/programs/some-id` directly (type it in the address bar). Expected: app loads (may show "Program not found" since there's no local data, but no white screen or 404).

- [ ] **Step 7: Commit**

```bash
git add public/404.html index.html .github/workflows/deploy.yml
git commit -m "feat: add GitHub Pages SPA routing and deployment workflow"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Remove Next.js dependency | Task 1 |
| Add Vite build | Tasks 1, 2 |
| Add React Router | Tasks 1, 3 |
| Preserve all routes | Task 3 (App.tsx) |
| Fix `next/link` usages | Task 4 (steps 1, 3, 4, 5, 6) |
| Fix `useRouter` usages | Task 4 (steps 6, 7, 8) |
| Fix `usePathname` → `useLocation` | Task 4 step 1 |
| Fix `process.env.NODE_ENV` for Vite | Task 4 step 2 |
| Fix fonts (next/font/google) | Task 2 (steps 2, 3) |
| Fix PWA manifest | Task 2 step 4 |
| TypeScript compiles | Task 5 |
| Jest tests pass | Task 6 |
| Playwright tests pass | Task 7 |
| Static deployment works | Task 9 |
| SPA routing on GitHub Pages | Task 9 |

**Type consistency check:**
- `useParams<{ id: string }>()` is used consistently in `DiffPage.tsx` and the route adapters in `App.tsx`
- `navigate(...)` replaces all `router.push(...)` instances; `navigate(-1)` replaces `router.back()`
- `navigate(`...`, { replace: true })` replaces `router.replace(...)`
- `<Link to=` used everywhere instead of `<Link href=`
- `useLocation().pathname` replaces `usePathname()`
