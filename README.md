# trAIner

trAIner is a local-first workout PWA for one person on one device. It turns routines from human trainers or external LLMs into structured, editable, loggable workouts that work offline after install.

## Using the App

### Getting started

1. Open the app and go to **Prompts** — copy the prompt template and paste it into any external LLM (ChatGPT, Claude, etc.).
2. Describe your goals, schedule, and available equipment. The LLM returns a JSON workout program.
3. Go to **Import**, paste the JSON, and step through exercise resolution. The app maps exercises to its built-in catalog and flags any it can't match so you can pick alternatives.
4. Your program appears under **Routines**. Browse days, edit sets/reps, and reorder exercises inline.

### Logging a workout

- Go to **Today** to see the routine scheduled for the current day.
- Tap any set to log reps and weight. The app tracks your history across sessions.
- **History** shows a full log of past workouts. **Profile** shows a training heatmap and per-muscle volume breakdown.

### Your data stays on your device

trAIner stores everything — programs, logs, and settings — in your browser's IndexedDB. **Nothing is sent to any server.** There are no accounts, no cloud sync, and no telemetry.

### How not to lose your progress

Because everything is local, a few things can erase your data:

| Action | Risk |
|---|---|
| Clearing browser site data / cookies | **Wipes all data** |
| Using a different browser or profile | Data is not shared across browsers |
| Private/incognito mode | Data is lost when the window closes |
| Reinstalling or resetting the browser | **Wipes all data** |

**Back up regularly.** Go to **Workspace** → *Export full workspace* to download a `.json` file. Keep it somewhere safe (cloud storage, email to yourself, etc.). To move to a new device or browser, use *Import workspace* on the new side.

You can also take in-app **snapshots** (Workspace → *Snapshot current state*) as quick checkpoints stored alongside your data — but these are in IndexedDB too, so they are not a substitute for exporting a file.

## Local Workflow

```bash
mise install
bun install
bun run dev
```

Open <http://localhost:5173/today>.

## Quality Gates

```bash
bun run lint
bun x tsc --noEmit
bun x tsc --noEmit -p tsconfig.test.json
bun run test -- --runInBand
bun run build
```

## Product Rules

- No in-app AI calls
- No auth, billing, accounts, hosted runtime, or cloud sync
- Runtime app data lives in IndexedDB
- External LLMs are used through copy/paste prompts only
- Backup and restore use local JSON files

## Exercise Catalog

The bundled catalog merges four sources:

- [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) — fetched at build time
- [wger](https://github.com/wger-project/wger) fixture snapshot (`scripts/sources/wger-snapshot.json`)
- [ExerciseDB](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb) snapshot via RapidAPI (`scripts/sources/exercisedb-snapshot.json`)
- **ExerciseDB Pro** — richer muscle/equipment metadata applied as an enrichment pass over the merged catalog (`scripts/sources/exercisedbpro-snapshot.json`)

Local aliases and additions live in `scripts/catalog-local-overrides.json`. The generated output is `src/lib/catalog/exercises.generated.json`; `src/lib/catalog/exercises.ts` is a small typed wrapper used by the app.

### Rebuild the catalog

```bash
bun run catalog:build
```

### Refresh a snapshot (one-time, requires network)

```bash
# wger — no credentials needed
bun run catalog:ingest:wger

# ExerciseDB — requires a RapidAPI key
RAPIDAPI_KEY=<your-key> bun run catalog:ingest:exercisedb
```

Commit the updated snapshot file(s) and re-run `catalog:build`.

### Re-ingest ExerciseDB Pro (one-time, requires local data)

ExerciseDB Pro was ingested from a locally downloaded dataset. If the source file is available:

```bash
# Requires exerciseDBpro720px/exerciseData_complete.json at the repo root
# Also requires exercises.generated.json to exist — run catalog:build first
bun scripts/ingest/ingest-exercisedbpro.mjs
```

This writes `scripts/sources/exercisedbpro-snapshot.json` and a review file (`exercisedbpro-review.txt`) listing uncertain matches. Commit the snapshot and re-run `catalog:build`.
