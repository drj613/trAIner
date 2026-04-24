# Project Reset And Local-First Rebuild Plan

> **For agentic workers:** This plan is intentionally destructive, but implementation must not start by deleting files blindly. First preserve the listed source artifacts, create a recoverable Git checkpoint, then rebuild the local-first PWA from a clean Bun-based scaffold.

**Goal:** Reset this repository from a half-finished hosted AI fitness app into a clean local-first workout PWA for one user on one device.

**Product sentence:** This app is a local-first PWA that helps a single user turn routines from human trainers or external LLMs into structured, editable, loggable workouts that work offline on a phone.

**Reset posture:** Keep the product thinking. Discard the old implementation.

---

## Source Artifacts To Preserve

These files contain the useful product and data context:

- `docs/2026-04-24-product-context-summary.md`
- `docs/superpowers/plans/2026-04-21-local-first-pwa-design.md`
- `docs/superpowers/plans/2026-04-23-bun-migration.md`
- `documentation/example-structure.json`

During the reset, move the example JSON into the `docs/` tree because the product context explicitly says the old `documentation/` folder name should go away:

- Move: `documentation/example-structure.json` -> `docs/examples/example-structure.json`

Everything else is disposable unless it is recreated as part of the fresh scaffold.

---

## Hard Rules

- No in-app AI calls.
- No auth, billing, accounts, hosted runtime, or cloud sync.
- No runtime network requests required for normal app use.
- Single user, single profile, single device for v1.
- Manual backup/export for v1.
- Offline-capable PWA once installed.
- External LLMs are used by copy/paste prompt workflows only.
- Imports are permissive: messy data should warn, not block, unless structurally unusable.
- Stored data preserves rich training structure; UI stays day-centric.

---

## Reset Strategy

1. Create a recoverable checkpoint before deletion.
2. Preserve the source artifacts above.
3. Remove old hosted-product implementation, old Taskmaster/Claude command scaffolding, old SQLite/API/runtime AI code, old tests, old docs, and the broken nested worktree.
4. Recreate a minimal Bun + Next.js + TypeScript + Tailwind + Jest app.
5. Rebuild the PWA around local IndexedDB storage and static bundled exercise data.
6. Verify with focused tests after every rebuild slice.

Do not merge the stranded `.worktrees/local-first-pwa` branch as-is. It can be used as reference for schema/storage ideas, but it is based on older package/runtime assumptions.

---

## Target Fresh File Shape

```text
docs/
  2026-04-24-product-context-summary.md
  examples/
    example-structure.json
  superpowers/
    plans/
      2026-04-21-local-first-pwa-design.md
      2026-04-23-bun-migration.md
      2026-04-24-project-reset-local-first-rebuild.md

public/
  sw.js
  icon-192.png
  icon-512.png

scripts/
  build-exercise-catalog.mjs

src/
  app/
    import/page.tsx
    manifest.ts
    page.tsx
    profile/page.tsx
    programs/page.tsx
    programs/[id]/page.tsx
    programs/[id]/edit/page.tsx
    programs/[id]/log/page.tsx
    prompts/page.tsx
    settings/page.tsx
    today/page.tsx
    globals.css
    layout.tsx
  components/
    app/
    import/
    profile/
    prompts/
    pwa/
    workout/
  lib/
    backup/
    catalog/
    import/
    prompts/
    programs/
    storage/
  test/
    fixtures/
```

There should be no `src/app/api`, no `src/lib/database`, and no `src/lib/ai` in the v1 local-first app.

---

## Phase 0: Safety And Preservation

- [ ] Create a checkpoint branch or tag for the current state.
- [ ] Confirm the source artifacts exist.
- [ ] Create `docs/examples/`.
- [ ] Move `documentation/example-structure.json` to `docs/examples/example-structure.json`.
- [ ] Add a short `docs/README.md` that points to the context summary, example JSON, and active rebuild plan.
- [ ] Commit the preservation step before deleting implementation files.

Verification:

- `git status` shows only intended preservation moves.
- `docs/examples/example-structure.json` still contains the rich section/group/exercise example.

---

## Phase 1: Demolition

Remove all old implementation and scaffolding that belongs to the previous hosted/prompt-to-routine app:

- [ ] Remove `.worktrees/`.
- [ ] Remove `.taskmaster/` if present.
- [ ] Remove `.claude/` command scaffolding unless a minimal project note is intentionally recreated.
- [ ] Remove old `documentation/`.
- [ ] Remove old `src/`.
- [ ] Remove old `scripts/`.
- [ ] Remove old generated/runtime files such as `.next/`, `.swc/`, coverage, SQLite data, and build artifacts.
- [ ] Remove old package lockfiles that do not belong to Bun.

Keep or recreate:

- `bun.lock`
- `bunfig.toml`
- `mise.toml`
- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `postcss.config.mjs`
- `eslint.config.mjs`
- `jest.config.js`
- `jest.setup.js`
- `.github/workflows/ci.yml`
- `.gitignore`
- `README.md`

If the existing config files are noisy from prior migrations, replace them with minimal fresh versions rather than preserving old content.

Verification:

- No old app routes remain.
- No SQLite, server API, AI SDK runtime, or routine database modules remain.
- `.worktrees/` no longer causes Jest package-name collisions.

---

## Phase 2: Fresh Bun App Baseline

- [ ] Rebuild the package manifest around Bun.
- [ ] Keep Next.js App Router, React, TypeScript, Tailwind, Jest, React Testing Library, `idb`, and `fake-indexeddb`.
- [ ] Remove AI SDK, SQLite, auth, billing, and hosted runtime dependencies.
- [ ] Wire CI to use Bun only:

```yaml
- uses: actions/checkout@v4
- uses: jdx/mise-action@v4
  with:
    install: true
- run: bun install --frozen-lockfile
- run: bun run lint
- run: bun x tsc --noEmit
- run: bun x tsc --noEmit -p tsconfig.test.json
- run: bun run test -- --runInBand
- run: bun run build
```

Verification:

- `bun install`
- `bun x tsc --noEmit`
- `bun run test -- --runInBand`
- `bun run build`

---

## Phase 3: Canonical Local Data Model

- [ ] Define `ProfileDocument`.
- [ ] Define `ProgramDocument`.
- [ ] Define `ProgramDay`.
- [ ] Define `ProgramSection`.
- [ ] Define `ProgramGroup`.
- [ ] Define `ProgramExercise`.
- [ ] Define `ProgramOverride`.
- [ ] Define `WorkoutLogDocument`.
- [ ] Define `AliasDocument`.
- [ ] Store all mutable runtime data in IndexedDB via `idb`.
- [ ] Store original import JSON and import warnings on every imported program.
- [ ] Store profile snapshots on imported/generated programs.

Repositories:

- `profileRepo`
- `programRepo`
- `logRepo`
- `aliasRepo`
- `backupRepo`

Verification:

- IndexedDB round-trip tests pass with `fake-indexeddb`.
- Program data can be saved, listed, fetched, and exported without server APIs.

---

## Phase 4: Exercise Catalog And Matching

- [ ] Choose and import a seed exercise dataset during development.
- [ ] Convert it into bundled static app data.
- [ ] Preserve canonical exercise IDs, display names, aliases, equipment, movement patterns, muscles, and tags.
- [ ] Implement layered matching:
  1. exact canonical match
  2. exact alias match
  3. normalized name match
  4. fuzzy suggestions
- [ ] Persist user-approved aliases locally.
- [ ] Keep unmatched exercises importable with review warnings.

Verification:

- Known examples from `docs/examples/example-structure.json` normalize without blocking import.
- Unknown exercise names produce warnings and suggestions instead of failed imports.

---

## Phase 5: Import Pipeline

- [ ] Accept pasted JSON.
- [ ] Detect single-day vs full-program payloads.
- [ ] Wrap single-day imports in a minimal `ProgramDocument`.
- [ ] Normalize sections, groups, exercises, prescriptions, tempo, notes, and tags.
- [ ] Preserve raw source JSON.
- [ ] Show review before saving.
- [ ] Let the user approve suggested exercise matches.
- [ ] Let approved fixes become aliases.

Verification:

- `docs/examples/example-structure.json` imports as a program with one day.
- Warmup, explosive, strength, metcon, hypertrophy, circuit, and superset semantics remain visible after import.

---

## Phase 6: Gym-Floor UI

Primary route:

- `/today`

Supporting routes:

- `/programs`
- `/programs/[id]`
- `/programs/[id]/edit`
- `/programs/[id]/log`
- `/profile`
- `/prompts`
- `/import`
- `/settings`

UI priorities:

- [ ] Phone-first layout.
- [ ] Fast access to today's active workout.
- [ ] Section headers remain visible.
- [ ] Supersets/circuits are obvious.
- [ ] Exercise prescriptions are scannable.
- [ ] Logging numbers is fast.
- [ ] No raw JSON editing in the gym-floor flow.

Verification:

- Imported example data renders as grouped workout UI.
- Today's view works offline after data exists locally.

---

## Phase 7: Prompt Builder And External LLM Modification Flow

- [ ] Store one local profile.
- [ ] Build initial routine prompts from profile, persona guidance, and output schema.
- [ ] Build modification prompts for base program, week, or day scopes.
- [ ] Include current JSON for the selected scope.
- [ ] Ask the external LLM to return a full replacement for that scope.
- [ ] Paste replacement JSON back into the app.
- [ ] Show a diff/review before applying.

Scope choices:

- base program
- this week only
- this day only

Verification:

- Prompt output includes profile context, selected scope, current JSON, and replacement instructions.
- Replacement import can be reviewed before applying.

---

## Phase 8: Overrides And Logging

- [ ] Apply base edits directly to the program.
- [ ] Store week/day edits as overrides layered over the base program.
- [ ] Render workouts from `base program + applicable overrides`.
- [ ] Store workout logs separately from the base program.
- [ ] Show recent exercise history while logging.
- [ ] Preserve override history for future analysis.

Verification:

- A day-only substitution does not mutate the base program.
- Logs can be exported and restored independently from program definitions.

---

## Phase 9: Backup And Offline PWA

- [ ] Export profile, programs, overrides, logs, and aliases as one backup JSON document.
- [ ] Restore from backup JSON.
- [ ] Add web manifest.
- [ ] Add service worker.
- [ ] Cache app shell routes and static assets.
- [ ] Avoid runtime network requirements for normal use.

Verification:

- Backup round-trip test passes.
- PWA build includes manifest and service worker.
- Installed/offline workflow can open the app and show saved local data.

---

## Phase 10: Definition Of MVP Done

The reset MVP is done when:

- [ ] The old hosted app implementation is gone.
- [ ] The repo uses Bun cleanly.
- [ ] The app has one saved profile.
- [ ] The app can build external LLM prompts.
- [ ] The app can import the preserved example JSON.
- [ ] The imported program renders as a day-centric workout.
- [ ] Sections and exercise-group semantics are visible.
- [ ] The user can log workout performance locally.
- [ ] The user can make base/week/day scoped changes.
- [ ] The user can export and restore all local data.
- [ ] The app is installable and usable offline after saved data exists.

---

## Explicitly Deferred

- In-app AI calls.
- Hosted sync.
- Auth.
- Billing.
- Multi-user or multi-profile support.
- Finished workout-quality analysis.
- Cloud backup.
- Sharing programs with other users.

---

## First Implementation Move

Start with Phase 0 only. Do not delete the old implementation until the source artifacts are safely preserved in `docs/` and committed.

After Phase 0, perform demolition as a separate commit. That keeps the reset readable and easy to recover from if we need to inspect old code later.
