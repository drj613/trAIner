# trAIner

trAIner is a local-first workout PWA for one person on one device. It turns routines from human trainers or external LLMs into structured, editable, loggable workouts that work offline after install.

## Local Workflow

```bash
mise install
bun install
bun run dev
```

Open <http://localhost:3000/today>.

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

The bundled catalog is generated from [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) plus local aliases and additions in `scripts/catalog-local-overrides.json`.

```bash
bun run catalog:build
```
