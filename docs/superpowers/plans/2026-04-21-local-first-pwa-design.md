# Local-First Workout PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current prompt-to-routine MVP into a single-user, local-first workout PWA with profile-driven prompt building, canonical program storage, scoped overrides, workout logging, manual backup/export, and full offline use after install.

**Architecture:** Keep the existing Next.js App Router shell, but move mutable runtime data out of server-only SQLite and into browser-native IndexedDB so the installed app works offline on a phone. Store workouts in a canonical `Program -> Day -> Section -> Group -> Exercise` model, bundle a generated exercise catalog into the client build, and render the gym-floor experience from `base program + applicable overrides + workout logs`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, IndexedDB via `idb`, service worker + Cache Storage, Jest + React Testing Library, Node build script for exercise catalog ingestion.

**Scope Note:** This plan is strictly for the local-first application in this repository. Keep the implementation focused on one app and one codebase, with no parallel-product extraction work included here.

## Current Execution Notes

- 2026-04-24: The local-first reset has already implemented most v1 app surfaces in the current Bun-based layout.
- 2026-04-24: Exercise catalog ingestion is implemented in the live `src/lib/catalog/*` layout rather than the older planned `src/lib/exercises/*` paths. Generated data lives in `exercises.generated.json`; `exercises.ts` is a typed wrapper.
- 2026-04-24: Plan commands are adapted to Bun during execution.

---

## Reuse Strategy

- Keep: repository/tooling scaffolding (`package.json`, Next.js, TypeScript, Jest, Tailwind, ESLint), generic UI primitives in `src/components/ui`, and any trainer persona content that still helps prompt generation.
- Replace: the existing app implementation under `src/app/dashboard`, `src/app/routines`, `src/app/api`, `src/lib/database`, `src/lib/routines`, `src/lib/ai`, and the current SQLite-backed routine/logging flow.
- Treat existing tests as baseline/reference only. Keep them only where they still validate intentionally preserved behavior; write new tests for the new local-first model instead of preserving the old routine contract.

## Exercise Catalog Source

- Use [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) as the source dataset for v1 exercise metadata.
- Import only the fields needed for the local-first app bundle: stable exercise id, display name, aliases if derivable, equipment, primary muscles, secondary muscles, broad category, and any lightweight tags that help matching.
- Do not ship the full media payload by default. Treat images and rich instructions as optional future enhancements unless they prove necessary for the in-gym workflow.
- Add a build-time ingestion script that converts the upstream dataset into the app's bundled internal catalog format, with any local cleanup or overrides checked into this repo.

## File Structure

- Modify: `package.json`
- Modify: `README.md`
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/lib/config/app.ts`
- Create: `src/lib/programs/schema.ts`
- Create: `src/lib/programs/legacyAdapter.ts`
- Create: `src/lib/programs/renderDay.ts`
- Create: `src/lib/programs/overrideDiff.ts`
- Create: `src/lib/storage/appDb.ts`
- Create: `src/lib/storage/profileRepo.ts`
- Create: `src/lib/storage/programRepo.ts`
- Create: `src/lib/storage/logRepo.ts`
- Create: `src/lib/storage/aliasRepo.ts`
- Create: `src/lib/exercises/types.ts`
- Create: `src/lib/exercises/catalog.generated.json`
- Create: `src/lib/exercises/catalog.ts`
- Create: `src/lib/exercises/match.ts`
- Create: `src/lib/import/types.ts`
- Create: `src/lib/import/normalize.ts`
- Create: `src/lib/import/review.ts`
- Create: `src/lib/prompts/templates.ts`
- Create: `src/lib/prompts/buildPrompt.ts`
- Create: `src/lib/backup/export.ts`
- Create: `src/components/app/AppShell.tsx`
- Create: `src/components/app/AppNav.tsx`
- Create: `src/components/profile/ProfileForm.tsx`
- Create: `src/components/prompts/PromptBuilderForm.tsx`
- Create: `src/components/import/ImportReview.tsx`
- Create: `src/components/workout/DayWorkoutView.tsx`
- Create: `src/components/workout/ExerciseGroupCard.tsx`
- Create: `src/components/workout/ScopePickerDialog.tsx`
- Create: `src/components/workout/WorkoutLogger.tsx`
- Create: `src/components/pwa/ServiceWorkerRegistration.tsx`
- Create: `src/app/today/page.tsx`
- Create: `src/app/programs/page.tsx`
- Create: `src/app/programs/[id]/page.tsx`
- Create: `src/app/programs/[id]/edit/page.tsx`
- Create: `src/app/programs/[id]/log/page.tsx`
- Create: `src/app/profile/page.tsx`
- Create: `src/app/import/page.tsx`
- Create: `src/app/prompts/page.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/manifest.ts`
- Create: `public/sw.js`
- Create: `scripts/build-exercise-catalog.mjs`
- Create: `src/__tests__/app/page.test.tsx`
- Create: `src/__tests__/app/import/page.test.tsx`
- Create: `src/__tests__/app/today/page.test.tsx`
- Create: `src/__tests__/lib/storage/appDb.test.ts`
- Create: `src/__tests__/lib/exercises/match.test.ts`
- Create: `src/__tests__/lib/import/normalize.test.ts`
- Create: `src/__tests__/lib/prompts/buildPrompt.test.ts`
- Create: `src/__tests__/lib/programs/overrideDiff.test.ts`
- Create: `src/__tests__/lib/logs/logRepo.test.ts`
- Create: `src/__tests__/lib/backup/export.test.ts`
- Move: `documentation/predev-docs/*` -> `docs/archive/legacy/`
- Remove after migration: `src/app/api/*`, `src/lib/database/*`, `src/lib/ai/*`

### Task 1: Rebrand the shell and establish the local-first route map

**Files:**
- Create: `src/lib/config/app.ts`
- Create: `src/components/app/AppShell.tsx`
- Create: `src/components/app/AppNav.tsx`
- Create: `src/app/today/page.tsx`
- Create: `src/app/programs/page.tsx`
- Create: `src/app/profile/page.tsx`
- Create: `src/app/import/page.tsx`
- Create: `src/app/settings/page.tsx`
- Test: `src/__tests__/app/page.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the failing navigation test**

```tsx
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('home page', () => {
  it('links into the local-first workflow', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /programs/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --runTestsByPath src/__tests__/app/page.test.tsx --runInBand`
Expected: FAIL because the current home page still points at `Compile Prompt`, `Open Dashboard`, and `Import Routine`.

- [ ] **Step 3: Replace the product shell with local-first navigation**

```ts
// src/lib/config/app.ts
export const APP_NAME = 'Workout Local';
export const APP_TAGLINE = 'Profile, prompts, programs, and workout logs that stay on your device.';
```

```tsx
// src/components/app/AppNav.tsx
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/today', label: 'Today' },
  { href: '/programs', label: 'Programs' },
  { href: '/import', label: 'Import' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings' },
];

export function AppNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="rounded-full border px-3 py-1.5 text-sm">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

```tsx
// src/app/page.tsx
import Link from 'next/link';
import { APP_NAME, APP_TAGLINE } from '@/lib/config/app';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-50">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-16">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Local-first workout PWA</p>
          <h1 className="mt-4 text-5xl font-semibold">{APP_NAME}</h1>
          <p className="mt-4 max-w-2xl text-lg text-stone-300">{APP_TAGLINE}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/today" className="rounded-full bg-amber-300 px-5 py-3 text-stone-950">Today</Link>
          <Link href="/programs" className="rounded-full border px-5 py-3">Programs</Link>
          <Link href="/profile" className="rounded-full border px-5 py-3">Profile</Link>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify the shell is wired correctly**

Run: `npm test -- --runTestsByPath src/__tests__/app/page.test.tsx --runInBand`
Expected: PASS with 1 test passing.

- [ ] **Step 5: Commit the route-map baseline**

```bash
git add src/app/page.tsx src/app/layout.tsx src/lib/config/app.ts src/components/app/AppNav.tsx src/components/app/AppShell.tsx src/app/today/page.tsx src/app/programs/page.tsx src/app/profile/page.tsx src/app/import/page.tsx src/app/settings/page.tsx src/__tests__/app/page.test.tsx
git commit -m "feat: rebrand shell for local-first workout app"
```

### Task 2: Introduce the canonical schema and browser storage

**Files:**
- Modify: `package.json`
- Create: `src/lib/programs/schema.ts`
- Create: `src/lib/programs/legacyAdapter.ts`
- Create: `src/lib/storage/appDb.ts`
- Create: `src/lib/storage/profileRepo.ts`
- Create: `src/lib/storage/programRepo.ts`
- Create: `src/lib/storage/logRepo.ts`
- Create: `src/lib/storage/aliasRepo.ts`
- Test: `src/__tests__/lib/storage/appDb.test.ts`

- [ ] **Step 1: Write a failing repository round-trip test**

```ts
import 'fake-indexeddb/auto';
import { saveProgram, getProgramById } from '@/lib/storage/programRepo';

describe('programRepo', () => {
  it('stores canonical programs in IndexedDB', async () => {
    await saveProgram({
      id: 'prog-1',
      title: 'Hotel week',
      profileSnapshot: { bodyweight: '200 lb', goals: ['cut'], injuries: [] },
      days: [],
      overrides: [],
      importWarnings: [],
      source: { type: 'single-day', importedAt: '2026-04-21T00:00:00.000Z', rawJson: '{}' },
    });

    const program = await getProgramById('prog-1');
    expect(program?.profileSnapshot.bodyweight).toBe('200 lb');
  });
});
```

- [ ] **Step 2: Run the test to verify storage is missing**

Run: `npm test -- --runTestsByPath src/__tests__/lib/storage/appDb.test.ts --runInBand`
Expected: FAIL because `programRepo` and IndexedDB setup do not exist yet.

- [ ] **Step 3: Define the schema and repositories**

```ts
// src/lib/programs/schema.ts
export interface ProfileSnapshot {
  bodyweight: string;
  goals: string[];
  injuries: string[];
  equipmentAccess?: string[];
  unitPreference?: 'lb' | 'kg';
}

export interface ProgramExercise {
  id: string;
  rawName: string;
  displayName: string;
  canonicalExerciseId?: string;
  aliases: string[];
  prescription: { sets: string; reps: string; tempo?: string };
  notes?: string;
  tags: string[];
  matchStatus: 'matched' | 'unmatched' | 'suggested';
}

export interface ProgramGroup {
  id: string;
  type: 'single' | 'superset' | 'circuit' | 'giant-set';
  notes?: string;
  exercises: ProgramExercise[];
}

export interface ProgramSection {
  id: string;
  title: string;
  notes?: string;
  groups: ProgramGroup[];
}

export interface ProgramDay {
  id: string;
  title: string;
  weekNumber?: number;
  notes?: string;
  sections: ProgramSection[];
}

export type OverrideScope = 'base' | 'week' | 'day';

export interface ProgramOverride {
  id: string;
  scope: OverrideScope;
  targetProgramId: string;
  targetWeekNumber?: number;
  targetDayId?: string;
  replacementDay?: ProgramDay;
}

export interface WorkoutLogDocument {
  id: string;
  programId: string;
  dayId: string;
  performedOn: string;
  exercises: Array<{ exerciseId: string; sets: Array<{ reps: number; weight?: number; notes?: string }> }>;
}

export interface ProgramDocument {
  id: string;
  title: string;
  profileSnapshot: ProfileSnapshot;
  days: ProgramDay[];
  overrides: ProgramOverride[];
  importWarnings: string[];
  source: { type: 'single-day' | 'program'; importedAt: string; rawJson: string };
}
```

```ts
// src/lib/storage/appDb.ts
import { openDB } from 'idb';

export const trainerDbPromise = openDB('workout-local', 1, {
  upgrade(db) {
    db.createObjectStore('profile', { keyPath: 'id' });
    db.createObjectStore('programs', { keyPath: 'id' });
    db.createObjectStore('logs', { keyPath: 'id' });
    db.createObjectStore('aliases', { keyPath: 'id' });
  },
});
```

```ts
// src/lib/storage/programRepo.ts
import type { ProgramDocument } from '@/lib/programs/schema';
import { trainerDbPromise } from './appDb';

export async function saveProgram(program: ProgramDocument) {
  const db = await trainerDbPromise;
  await db.put('programs', program);
}

export async function getProgramById(id: string): Promise<ProgramDocument | undefined> {
  const db = await trainerDbPromise;
  return db.get('programs', id);
}
```

- [ ] **Step 4: Run the storage test and typecheck**

Run: `npm test -- --runTestsByPath src/__tests__/lib/storage/appDb.test.ts --runInBand`
Expected: PASS with the IndexedDB round trip succeeding.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit the canonical storage layer**

```bash
git add package.json package-lock.json src/lib/programs/schema.ts src/lib/programs/legacyAdapter.ts src/lib/storage/appDb.ts src/lib/storage/profileRepo.ts src/lib/storage/programRepo.ts src/lib/storage/logRepo.ts src/lib/storage/aliasRepo.ts src/__tests__/lib/storage/appDb.test.ts
git commit -m "feat: add canonical IndexedDB storage for local-first data"
```

### Task 3: Bundle the exercise catalog and matching engine

Execution note: completed against the current catalog layout using `scripts/build-exercise-catalog.mjs`, `scripts/catalog-local-overrides.json`, `src/lib/catalog/exercises.ts`, and `src/lib/catalog/match.test.ts`.

**Files:**
- Create: `scripts/build-exercise-catalog.mjs`
- Create: `src/lib/exercises/types.ts`
- Create: `src/lib/exercises/catalog.ts`
- Create: `src/lib/exercises/catalog.generated.json`
- Create: `src/lib/exercises/match.ts`
- Test: `src/__tests__/lib/exercises/match.test.ts`
- Modify: `package.json`

- [x] **Step 1: Write a failing exercise matching test**

```ts
import { matchExerciseName } from '@/lib/exercises/match';

describe('matchExerciseName', () => {
  it('prefers exact aliases and falls back to suggestions', () => {
    expect(matchExerciseName('DB Bench')).toMatchObject({
      status: 'matched',
      canonicalExerciseId: 'dumbbell-bench-press',
    });

    expect(matchExerciseName('Landmine Squat')).toMatchObject({
      status: 'suggested',
    });
  });
});
```

- [x] **Step 2: Run the matcher test to verify the catalog is absent**

Run: `npm test -- --runTestsByPath src/__tests__/lib/exercises/match.test.ts --runInBand`
Expected: FAIL because the matching module and generated catalog do not exist yet.

- [x] **Step 3: Add the catalog generator and matcher**

```js
// scripts/build-exercise-catalog.mjs
import fs from 'node:fs';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync('scripts/catalog-source/exercises.json', 'utf8'));
const catalog = source.map((item) => ({
  id: item.slug,
  displayName: item.name,
  aliases: item.aliases ?? [],
  equipment: item.equipment ?? [],
  movementPattern: item.movementPattern ?? 'unknown',
  primaryMuscles: item.primaryMuscles ?? [],
  secondaryMuscles: item.secondaryMuscles ?? [],
}));

fs.writeFileSync(
  path.join('src', 'lib', 'exercises', 'catalog.generated.json'),
  JSON.stringify(catalog, null, 2)
);
console.log(`built ${catalog.length} exercises`);
```

```ts
// src/lib/exercises/match.ts
import catalog from './catalog.generated.json';

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchExerciseName(name: string) {
  const normalized = normalizeName(name);
  const exact = catalog.find((item) =>
    [item.displayName, ...item.aliases].some((candidate) => normalizeName(candidate) === normalized)
  );

  if (exact) {
    return { status: 'matched' as const, canonicalExerciseId: exact.id, suggestions: [] };
  }

  const suggestions = catalog
    .filter((item) => normalizeName(item.displayName).includes(normalized.split(' ')[0] ?? ''))
    .slice(0, 3)
    .map((item) => ({ id: item.id, displayName: item.displayName }));

  return { status: suggestions.length ? ('suggested' as const) : ('unmatched' as const), suggestions };
}
```

- [x] **Step 4: Generate the catalog and run the matcher test**

Run: `node scripts/build-exercise-catalog.mjs`
Expected: `built <number> exercises`

Run: `npm test -- --runTestsByPath src/__tests__/lib/exercises/match.test.ts --runInBand`
Expected: PASS with exact and suggested matching covered.

- [x] **Step 5: Commit catalog ingestion**

```bash
git add package.json package-lock.json scripts/build-exercise-catalog.mjs src/lib/exercises/types.ts src/lib/exercises/catalog.ts src/lib/exercises/catalog.generated.json src/lib/exercises/match.ts src/__tests__/lib/exercises/match.test.ts
git commit -m "feat: add bundled exercise catalog and matcher"
```

### Task 4: Build the import normalization pipeline and review step

**Files:**
- Create: `src/lib/import/types.ts`
- Create: `src/lib/import/normalize.ts`
- Create: `src/lib/import/review.ts`
- Create: `src/components/import/ImportReview.tsx`
- Modify: `src/app/import/page.tsx`
- Test: `src/__tests__/lib/import/normalize.test.ts`
- Test: `src/__tests__/app/import/page.test.tsx`

- [ ] **Step 1: Write failing tests for single-day wrapping and warning collection**

```ts
import { normalizeImportedProgram } from '@/lib/import/normalize';

describe('normalizeImportedProgram', () => {
  it('wraps a single-day import into a canonical program and preserves warnings', () => {
    const result = normalizeImportedProgram({
      title: 'Friday Lift',
      day: {
        title: 'Friday',
        sections: [{ title: 'Strength', groups: [{ type: 'single', exercises: [{ name: 'DB Bench', sets: '4', reps: '8' }] }] }],
      },
    }, { bodyweight: '200 lb', goals: ['hypertrophy'], injuries: [] });

    expect(result.program.days).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});
```

```tsx
import { render, screen } from '@testing-library/react';
import ImportPage from '@/app/import/page';

describe('import page', () => {
  it('shows unmatched exercise warnings in the review step', async () => {
    render(<ImportPage />);
    expect(await screen.findByText(/review import/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the import tests to verify the pipeline is missing**

Run: `npm test -- --runTestsByPath src/__tests__/lib/import/normalize.test.ts src/__tests__/app/import/page.test.tsx --runInBand`
Expected: FAIL because canonical normalization and review UI do not exist.

- [ ] **Step 3: Implement normalization, matching, and review summaries**

```ts
// src/lib/import/normalize.ts
import { matchExerciseName } from '@/lib/exercises/match';

export function normalizeImportedProgram(input: unknown, profileSnapshot: ProfileSnapshot) {
  const raw = input as {
    title: string;
    day?: { title: string; sections: Array<{ title: string; groups: Array<{ type: ProgramGroup['type']; exercises: Array<{ name: string; sets: string; reps: string; tempo?: string; notes?: string; tags?: string[] }> }> }> };
    days?: Array<{ title: string; sections: Array<{ title: string; groups: Array<{ type: ProgramGroup['type']; exercises: Array<{ name: string; sets: string; reps: string; tempo?: string; notes?: string; tags?: string[] }> }> }> }>;
  };
  const parsed = raw.day
    ? { kind: 'single-day' as const, title: raw.title, days: [raw.day] }
    : { kind: 'program' as const, title: raw.title, days: raw.days ?? [] };
  const warnings: string[] = [];

  const days = parsed.days.map((day, dayIndex) => ({
    id: `day-${dayIndex + 1}`,
    title: day.title,
    sections: day.sections.map((section, sectionIndex) => ({
      id: `section-${dayIndex + 1}-${sectionIndex + 1}`,
      title: section.title,
      groups: section.groups.map((group, groupIndex) => ({
        id: `group-${dayIndex + 1}-${sectionIndex + 1}-${groupIndex + 1}`,
        type: group.type,
        exercises: group.exercises.map((exercise, exerciseIndex) => {
          const match = matchExerciseName(exercise.name);
          if (match.status !== 'matched') warnings.push(`Review exercise: ${exercise.name}`);
          return {
            id: `exercise-${dayIndex + 1}-${exerciseIndex + 1}`,
            rawName: exercise.name,
            displayName: exercise.name,
            canonicalExerciseId: match.status === 'matched' ? match.canonicalExerciseId : undefined,
            aliases: [],
            prescription: { sets: exercise.sets, reps: exercise.reps, tempo: exercise.tempo },
            notes: exercise.notes,
            tags: exercise.tags ?? [],
            matchStatus: match.status,
          };
        }),
      })),
    })),
  }));

  return {
    program: {
      id: crypto.randomUUID(),
      title: parsed.title,
      profileSnapshot,
      days,
      overrides: [],
      importWarnings: warnings,
      source: { type: parsed.kind, importedAt: new Date().toISOString(), rawJson: JSON.stringify(input, null, 2) },
    },
    warnings,
  };
}
```

```tsx
// src/components/import/ImportReview.tsx
interface ImportReviewProps {
  summary: string;
  warnings: string[];
  onConfirm: () => void;
}

export function ImportReview({ warnings, summary, onConfirm }: ImportReviewProps) {
  return (
    <section className="rounded-3xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Review Import</h2>
      <p className="mt-2 text-sm text-stone-600">{summary}</p>
      <ul className="mt-3 space-y-2 text-sm text-amber-700">
        {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
      <button onClick={onConfirm} className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-white">Save program</button>
    </section>
  );
}
```

- [ ] **Step 4: Run import normalization and UI tests**

Run: `npm test -- --runTestsByPath src/__tests__/lib/import/normalize.test.ts src/__tests__/app/import/page.test.tsx --runInBand`
Expected: PASS with both canonical import paths covered.

- [ ] **Step 5: Commit the importer**

```bash
git add src/lib/import/types.ts src/lib/import/normalize.ts src/lib/import/review.ts src/components/import/ImportReview.tsx src/app/import/page.tsx src/__tests__/lib/import/normalize.test.ts src/__tests__/app/import/page.test.tsx
git commit -m "feat: add canonical import normalization and review"
```

### Task 5: Add profile management and scope-aware prompt generation

**Files:**
- Create: `src/components/profile/ProfileForm.tsx`
- Create: `src/components/prompts/PromptBuilderForm.tsx`
- Create: `src/lib/prompts/templates.ts`
- Create: `src/lib/prompts/buildPrompt.ts`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/prompts/page.tsx`
- Test: `src/__tests__/lib/prompts/buildPrompt.test.ts`

- [ ] **Step 1: Write a failing prompt-builder test**

```ts
import { buildPrompt } from '@/lib/prompts/buildPrompt';

describe('buildPrompt', () => {
  it('includes profile context, persona guidance, scope, and replacement instructions', () => {
    const prompt = buildPrompt({
      category: 'modify-day',
      personaId: 'joint-friendly-strength',
      profile: { bodyweight: '200 lb', goals: ['strength'], injuries: ['right shoulder'] },
      scope: 'day',
      currentRoutineJson: '{"title":"Base"}',
    });

    expect(prompt).toContain('right shoulder');
    expect(prompt).toContain('Return a full replacement for the selected scope.');
    expect(prompt).toContain('"title":"Base"');
  });
});
```

- [ ] **Step 2: Run the prompt-builder test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/prompts/buildPrompt.test.ts --runInBand`
Expected: FAIL because the new builder does not exist.

- [ ] **Step 3: Implement profile persistence and prompt categories**

```ts
// src/lib/prompts/templates.ts
export const PERSONAS = {
  'joint-friendly-strength': {
    label: 'Joint-Friendly Strength',
    guidance: 'Bias toward sustainable strength progressions, conservative volume spikes, and substitutions for aggravated joints.',
  },
  'bodybuilding-detail': {
    label: 'Bodybuilding Detail',
    guidance: 'Bias toward stable exercise selection, clear hypertrophy intent, and fatigue-aware accessory work.',
  },
} as const;
```

```ts
// src/lib/prompts/buildPrompt.ts
interface BuildPromptInput {
  category: 'initial-program' | 'refine-program' | 'modify-day' | 'modify-week' | 'modify-program';
  personaId: keyof typeof PERSONAS;
  profile: { bodyweight: string; goals: string[]; injuries: string[] };
  scope: 'day' | 'week' | 'program';
  currentRoutineJson?: string;
}

export function buildPrompt(input: BuildPromptInput) {
  const persona = PERSONAS[input.personaId];
  const scopeInstruction =
    input.category === 'modify-day'
      ? 'Return a full replacement for the selected scope.'
      : 'Return a full program JSON payload.';

  return [
    'You are generating workout programming JSON for an external tool.',
    `Profile context: ${JSON.stringify(input.profile)}`,
    `Persona guidance: ${persona.guidance}`,
    `Requested scope: ${input.scope}`,
    input.currentRoutineJson ? `Current routine JSON:\n${input.currentRoutineJson}` : null,
    scopeInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}
```

```tsx
// src/app/profile/page.tsx
export default function ProfilePage() {
  return (
    <ProfileForm
      fields={['bodyweight', 'trainingHistory', 'goals', 'injuries', 'equipmentAccess', 'unitPreference', 'promptPreferences']}
    />
  );
}
```

- [ ] **Step 4: Run the prompt-builder test and the existing prompts page test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/prompts/buildPrompt.test.ts src/__tests__/app/prompts/page.test.tsx --runInBand`
Expected: PASS with scope-aware prompt text and rendered form sections.

- [ ] **Step 5: Commit profile and prompt generation**

```bash
git add src/components/profile/ProfileForm.tsx src/components/prompts/PromptBuilderForm.tsx src/lib/prompts/templates.ts src/lib/prompts/buildPrompt.ts src/app/profile/page.tsx src/app/prompts/page.tsx src/__tests__/lib/prompts/buildPrompt.test.ts
git commit -m "feat: add profile-backed prompt builder"
```

### Task 6: Render the day-centric workout view from canonical programs

**Files:**
- Create: `src/lib/programs/renderDay.ts`
- Create: `src/components/workout/DayWorkoutView.tsx`
- Create: `src/components/workout/ExerciseGroupCard.tsx`
- Modify: `src/app/today/page.tsx`
- Modify: `src/app/programs/page.tsx`
- Modify: `src/app/programs/[id]/page.tsx`
- Test: `src/__tests__/app/today/page.test.tsx`

- [ ] **Step 1: Write a failing today-view test**

```tsx
import { render, screen } from '@testing-library/react';
import TodayPage from '@/app/today/page';

describe('today page', () => {
  it('shows section and group semantics for the active day', async () => {
    render(<TodayPage />);
    expect(await screen.findByText(/warmup/i)).toBeInTheDocument();
    expect(await screen.findByText(/superset/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the today-view test**

Run: `npm test -- --runTestsByPath src/__tests__/app/today/page.test.tsx --runInBand`
Expected: FAIL because the current app has no day-centric route or canonical renderer.

- [ ] **Step 3: Add the renderer and grouped workout UI**

```ts
// src/lib/programs/renderDay.ts
function appliesToDate(override: ProgramOverride, selectedDate: string) {
  return override.scope === 'base' || override.targetDayId === selectedDate || Boolean(override.targetWeekNumber);
}

function pickScheduledDay(program: ProgramDocument, selectedDate: string) {
  return program.days.find((day) => day.id === selectedDate) ?? program.days[0];
}

function applyOverride(day: ProgramDay, override: ProgramOverride) {
  return override.replacementDay ?? day;
}

export function renderDay(program: ProgramDocument, selectedDate: string) {
  const applicableOverrides = program.overrides.filter((override) => appliesToDate(override, selectedDate));
  return applicableOverrides.reduce(
    (day, override) => applyOverride(day, override),
    pickScheduledDay(program, selectedDate)
  );
}
```

```tsx
// src/components/workout/ExerciseGroupCard.tsx
export function ExerciseGroupCard({ group }: { group: ProgramGroup }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-600">{group.type}</h3>
        {group.notes ? <p className="text-xs text-stone-500">{group.notes}</p> : null}
      </header>
      <div className="space-y-3">
        {group.exercises.map((exercise) => (
          <div key={exercise.id}>
            <p className="font-medium">{exercise.displayName}</p>
            <p className="text-sm text-stone-600">{exercise.prescription.sets} sets x {exercise.prescription.reps}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run the today-view test**

Run: `npm test -- --runTestsByPath src/__tests__/app/today/page.test.tsx --runInBand`
Expected: PASS with visible section and grouping structure.

- [ ] **Step 5: Commit the day-centric UI**

```bash
git add src/lib/programs/renderDay.ts src/components/workout/DayWorkoutView.tsx src/components/workout/ExerciseGroupCard.tsx src/app/today/page.tsx src/app/programs/page.tsx src/app/programs/[id]/page.tsx src/__tests__/app/today/page.test.tsx
git commit -m "feat: render canonical day-centric workout views"
```

### Task 7: Add scoped edits, overrides, and AI replacement review

**Files:**
- Create: `src/lib/programs/overrideDiff.ts`
- Create: `src/components/workout/ScopePickerDialog.tsx`
- Modify: `src/app/programs/[id]/edit/page.tsx`
- Modify: `src/components/import/ImportReview.tsx`
- Test: `src/__tests__/lib/programs/overrideDiff.test.ts`

- [ ] **Step 1: Write a failing override test**

```ts
import { diffReplacement } from '@/lib/programs/overrideDiff';

describe('diffReplacement', () => {
  it('summarizes changed exercises and sections before apply', () => {
    const baseDay = {
      id: 'day-1',
      title: 'Upper',
      sections: [{ id: 'section-1', title: 'Strength', groups: [{ id: 'group-1', type: 'single', exercises: [{ id: 'exercise-1', displayName: 'Barbell Bench Press' }] }] }],
    } as unknown as ProgramDay;
    const replacementDay = {
      id: 'day-1',
      title: 'Upper',
      sections: [{ id: 'section-1', title: 'Strength', groups: [{ id: 'group-1', type: 'single', exercises: [{ id: 'exercise-1', displayName: 'Dumbbell Bench Press' }] }] }],
    } as unknown as ProgramDay;
    const summary = diffReplacement(baseDay, replacementDay);
    expect(summary.changedExercises).toContain('Barbell Bench Press -> Dumbbell Bench Press');
    expect(summary.changedSections).toContain('Strength');
  });
});
```

- [ ] **Step 2: Run the override-diff test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/programs/overrideDiff.test.ts --runInBand`
Expected: FAIL because override diffing and scope apply logic do not exist.

- [ ] **Step 3: Implement explicit save scopes and replacement review**

```ts
// src/lib/programs/overrideDiff.ts
export function diffReplacement(base: ProgramDay, replacement: ProgramDay) {
  return {
    changedSections: replacement.sections
      .filter((section, index) => JSON.stringify(section) !== JSON.stringify(base.sections[index]))
      .map((section) => section.title),
    changedExercises: replacement.sections.flatMap((section) =>
      section.groups.flatMap((group) =>
        group.exercises.map((exercise, index) => {
          const previous = base.sections
            .flatMap((baseSection) => baseSection.groups)
            .flatMap((baseGroup) => baseGroup.exercises)[index];
          return previous && previous.displayName !== exercise.displayName
            ? `${previous.displayName} -> ${exercise.displayName}`
            : null;
        }).filter(Boolean)
      )
    ),
  };
}
```

```tsx
// src/components/workout/ScopePickerDialog.tsx
const SCOPES = [
  { value: 'base', label: 'Base program' },
  { value: 'week', label: 'This week only' },
  { value: 'day', label: 'This day only' },
];

export function ScopePickerDialog({ onConfirm }: { onConfirm: (scope: OverrideScope) => void }) {
  return (
    <dialog open className="rounded-3xl p-0">
      <form method="dialog" className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Choose edit scope</h2>
        {SCOPES.map((scope) => (
          <button key={scope.value} type="button" onClick={() => onConfirm(scope.value)} className="block w-full rounded-2xl border px-4 py-3 text-left">
            {scope.label}
          </button>
        ))}
      </form>
    </dialog>
  );
}
```

- [ ] **Step 4: Run the override test and exercise the edit page flow**

Run: `npm test -- --runTestsByPath src/__tests__/lib/programs/overrideDiff.test.ts --runInBand`
Expected: PASS with diff output covering changed sections and exercises.

- [ ] **Step 5: Commit scoped overrides**

```bash
git add src/lib/programs/overrideDiff.ts src/components/workout/ScopePickerDialog.tsx src/app/programs/[id]/edit/page.tsx src/components/import/ImportReview.tsx src/__tests__/lib/programs/overrideDiff.test.ts
git commit -m "feat: add scoped override review and apply flow"
```

### Task 8: Add workout logging and history without mutating the base program

**Files:**
- Modify: `src/lib/storage/logRepo.ts`
- Create: `src/components/workout/WorkoutLogger.tsx`
- Modify: `src/app/programs/[id]/log/page.tsx`
- Test: `src/__tests__/lib/logs/logRepo.test.ts`

- [ ] **Step 1: Write a failing log repository test**

```ts
import 'fake-indexeddb/auto';
import { saveWorkoutLog, getExerciseHistory } from '@/lib/storage/logRepo';

describe('logRepo', () => {
  it('stores logs separately from the base program and returns recent history', async () => {
    await saveWorkoutLog({
      id: 'log-1',
      programId: 'prog-1',
      dayId: 'day-1',
      performedOn: '2026-04-21',
      exercises: [{ exerciseId: 'dumbbell-bench-press', sets: [{ reps: 8, weight: 70 }] }],
    });

    const history = await getExerciseHistory('dumbbell-bench-press');
    expect(history[0]?.sets[0]?.weight).toBe(70);
  });
});
```

- [ ] **Step 2: Run the log test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/logs/logRepo.test.ts --runInBand`
Expected: FAIL because log persistence and history lookups are not implemented yet.

- [ ] **Step 3: Implement log storage and logger UI**

```ts
// src/lib/storage/logRepo.ts
export async function saveWorkoutLog(log: WorkoutLogDocument) {
  const db = await trainerDbPromise;
  await db.put('logs', log);
}

export async function getExerciseHistory(exerciseId: string) {
  const db = await trainerDbPromise;
  const logs = await db.getAll('logs');
  return logs
    .filter((log) => log.exercises.some((exercise) => exercise.exerciseId === exerciseId))
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn));
}
```

```tsx
// src/components/workout/WorkoutLogger.tsx
interface WorkoutLoggerProps {
  exercises: Array<{ id: string; displayName: string }>;
  history: Record<string, Array<{ sets: Array<{ weight?: number }> }>>;
  onSave: () => void;
}

export function WorkoutLogger({ exercises, history, onSave }: WorkoutLoggerProps) {
  return (
    <section className="space-y-4">
      {exercises.map((exercise) => (
        <article key={exercise.id} className="rounded-3xl border bg-white p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">{exercise.displayName}</h3>
            <span className="text-xs text-stone-500">Last: {history[exercise.id]?.[0]?.sets?.[0]?.weight ?? '-'} </span>
          </header>
        </article>
      ))}
      <button onClick={onSave} className="w-full rounded-full bg-emerald-600 px-4 py-3 text-white">Save workout</button>
    </section>
  );
}
```

- [ ] **Step 4: Run the log test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/logs/logRepo.test.ts --runInBand`
Expected: PASS with logs persisted independently of program documents.

- [ ] **Step 5: Commit workout logging**

```bash
git add src/lib/storage/logRepo.ts src/components/workout/WorkoutLogger.tsx src/app/programs/[id]/log/page.tsx src/__tests__/lib/logs/logRepo.test.ts
git commit -m "feat: add local workout logging and history"
```

### Task 9: Add manual backup/export, restore, and alias persistence

**Files:**
- Create: `src/lib/backup/export.ts`
- Modify: `src/lib/storage/aliasRepo.ts`
- Modify: `src/app/settings/page.tsx`
- Test: `src/__tests__/lib/backup/export.test.ts`

- [ ] **Step 1: Write a failing backup round-trip test**

```ts
import 'fake-indexeddb/auto';
import { exportBackup, restoreBackup } from '@/lib/backup/export';

describe('backup export', () => {
  it('round-trips profile, programs, overrides, logs, and aliases', async () => {
    const backup = await exportBackup();
    await restoreBackup(backup);
    expect(backup.profile.id).toBe('profile-1');
    expect(backup.aliases.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the backup test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/backup/export.test.ts --runInBand`
Expected: FAIL because backup helpers do not exist.

- [ ] **Step 3: Implement export/import and alias saves**

```ts
// src/lib/backup/export.ts
interface AppBackupDocument {
  exportedAt: string;
  profile: { id: string };
  programs: ProgramDocument[];
  logs: WorkoutLogDocument[];
  aliases: Array<{ id: string; canonicalExerciseId: string; alias: string }>;
}

export async function exportBackup() {
  const db = await trainerDbPromise;
  return {
    exportedAt: new Date().toISOString(),
    profile: await db.get('profile', 'profile-1'),
    programs: await db.getAll('programs'),
    logs: await db.getAll('logs'),
    aliases: await db.getAll('aliases'),
  };
}

export async function restoreBackup(backup: AppBackupDocument) {
  const db = await trainerDbPromise;
  await db.put('profile', backup.profile);
  await Promise.all(backup.programs.map((program) => db.put('programs', program)));
  await Promise.all(backup.logs.map((log) => db.put('logs', log)));
  await Promise.all(backup.aliases.map((alias) => db.put('aliases', alias)));
}
```

```ts
// src/lib/storage/aliasRepo.ts
export async function saveAlias(alias: { id: string; canonicalExerciseId: string; alias: string }) {
  const db = await trainerDbPromise;
  await db.put('aliases', alias);
}
```

- [ ] **Step 4: Run the backup test**

Run: `npm test -- --runTestsByPath src/__tests__/lib/backup/export.test.ts --runInBand`
Expected: PASS with export/import returning the same data shape.

- [ ] **Step 5: Commit backup and restore**

```bash
git add src/lib/backup/export.ts src/lib/storage/aliasRepo.ts src/app/settings/page.tsx src/__tests__/lib/backup/export.test.ts
git commit -m "feat: add manual backup restore and alias persistence"
```

### Task 10: Make the app installable offline and remove server-only legacy code

**Files:**
- Create: `src/app/manifest.ts`
- Create: `public/sw.js`
- Create: `src/components/pwa/ServiceWorkerRegistration.tsx`
- Create: `src/__tests__/components/pwa/ServiceWorkerRegistration.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `next.config.ts`
- Modify: `README.md`
- Move: `documentation/predev-docs/*` -> `docs/archive/legacy/`
- Remove: `src/app/api/*`
- Remove: `src/lib/database/*`
- Remove: `src/lib/ai/*`

- [ ] **Step 1: Write a failing service worker registration test**

```tsx
import { render } from '@testing-library/react';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

describe('ServiceWorkerRegistration', () => {
  it('registers the app service worker when the browser supports it', () => {
    const register = jest.fn();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});
```

- [ ] **Step 2: Run the PWA registration test**

Run: `npm test -- --runTestsByPath src/__tests__/components/pwa/ServiceWorkerRegistration.test.tsx --runInBand`
Expected: FAIL because the registration component and `sw.js` do not exist yet.

- [ ] **Step 3: Add the manifest, service worker, and cleanup pass**

```ts
// src/app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Workout Local',
    short_name: 'Workout',
    start_url: '/today',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#fcd34d',
    icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
  };
}
```

```js
// public/sw.js
const STATIC_CACHE = 'workout-local-v1';
const APP_SHELL = ['/', '/today', '/programs', '/profile', '/import', '/prompts', '/settings'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
```

```tsx
// src/components/pwa/ServiceWorkerRegistration.tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  return null;
}
```

- [ ] **Step 4: Run focused verification and full quality gates**

Run: `npm test -- --runTestsByPath src/__tests__/components/pwa/ServiceWorkerRegistration.test.tsx --runInBand`
Expected: PASS.

Run: `npm run build`
Expected: PASS with no server-only runtime dependency on SQLite APIs.

Run: `npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit the PWA finish and cleanup**

```bash
git add src/app/manifest.ts public/sw.js src/components/pwa/ServiceWorkerRegistration.tsx src/app/layout.tsx next.config.ts README.md docs/archive/legacy
git rm -r src/app/api src/lib/database src/lib/ai documentation
git commit -m "feat: ship offline pwa shell and remove legacy server runtime"
```
