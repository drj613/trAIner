# Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert this repository from Node/npm-first tooling to Bun-first tooling, with `mise` as the runtime version manager and Jest kept as the test framework.

**Architecture:** Treat Bun as the package manager and JavaScript runtime entrypoint for repo workflows while keeping framework-level behavior intact. Pin Bun in repo-managed `mise` config, route package scripts and helper scripts through Bun, replace npm-specific CI/docs guidance, and remove the last runtime assumption that depends on `npm`-injected environment variables.

**Tech Stack:** Bun 1.3.12, `mise`, Next.js 15, React 19, TypeScript, Jest, GitHub Actions.

---

## File Structure

- Create: `mise.toml`
- Create: `src/__tests__/app/api/health/route.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Modify: `scripts/migrate.js`
- Modify: `scripts/reset-db.js`
- Modify: `scripts/run-migration.mjs`
- Modify: `src/app/api/health/route.ts`
- Delete: `package-lock.json`
- Create after install: `bun.lock`

### Task 1: Lock the Repo to Bun Through Mise

**Files:**
- Create: `mise.toml`
- Modify: `package.json`
- Delete: `package-lock.json`
- Create after install: `bun.lock`

- [ ] **Step 1: Add repo-level Bun version management**

```toml
[tools]
bun = "1.3.12"
```

- [ ] **Step 2: Update package metadata for Bun**

```json
{
  "packageManager": "bun@1.3.12",
  "scripts": {
    "db:migrate": "bun scripts/migrate.js",
    "db:migrate-local": "bun scripts/run-migration.mjs",
    "db:reset": "bun scripts/reset-db.js"
  }
}
```

- [ ] **Step 3: Replace the npm lockfile with Bun’s lockfile**

Run: `bun install`
Expected: `bun.lock` created and `package-lock.json` no longer needed

- [ ] **Step 4: Verify Bun can run the standard repo entrypoints**

Run: `bun run test -- --runTestsByPath src/__tests__/app/api/health/route.test.ts`
Expected: the test suite runs under Bun and reports the targeted regression result

- [ ] **Step 5: Commit**

```bash
git add mise.toml package.json bun.lock package-lock.json
git commit -m "chore: switch repo package management to bun"
```

### Task 2: Remove the Last npm-Specific Runtime Assumption

**Files:**
- Create: `src/__tests__/app/api/health/route.test.ts`
- Modify: `src/app/api/health/route.ts`

- [ ] **Step 1: Write the failing regression test**

```ts
import packageJson from '../../../../../package.json';
import { GET } from '@/app/api/health/route';

jest.mock('@/lib/database/sqlite', () => ({
  checkDatabaseHealth: jest.fn(() => ({ ok: true })),
}));

describe('GET /api/health', () => {
  it('reports the application version from package metadata', async () => {
    const response = await GET();
    const json = await response.json();

    expect(json.version).toBe(packageJson.version);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails before the route change**

Run: `bun run test -- --runTestsByPath src/__tests__/app/api/health/route.test.ts`
Expected: FAIL because the route currently falls back to `"1.0.0"` when `npm_package_version` is absent

- [ ] **Step 3: Replace the npm env dependency with a direct package import**

```ts
import packageJson from '../../../../package.json';

const health = {
  version: packageJson.version,
};
```

- [ ] **Step 4: Re-run the targeted test**

Run: `bun run test -- --runTestsByPath src/__tests__/app/api/health/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health/route.ts src/__tests__/app/api/health/route.test.ts
git commit -m "test: pin health route version to package metadata"
```

### Task 3: Convert Supporting Tooling, Scripts, and Docs

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `scripts/migrate.js`
- Modify: `scripts/reset-db.js`
- Modify: `scripts/run-migration.mjs`

- [ ] **Step 1: Make helper scripts runtime-agnostic under Bun**

```js
const result = spawnSync(process.execPath, ['scripts/migrate.js'], {
  stdio: 'inherit',
  env: process.env,
});
```

- [ ] **Step 2: Move CI from setup-node/npm to mise + Bun**

```yaml
- uses: actions/checkout@v4
- uses: jdx/mise-action@v4
  with:
    install: true
- run: bun install --frozen-lockfile
- run: bun run lint
- run: bun x tsc --noEmit
- run: bun x tsc --noEmit -p tsconfig.test.json
- run: bun run test
- run: bun run build
```

- [ ] **Step 3: Update user-facing docs to Bun commands**

```md
- Bun 1.3.12 via `mise`
- `bun install`
- `bun run dev`
- `bun run test`
- `bun x tsc --noEmit`
```

- [ ] **Step 4: Run the full quality gate through Bun**

Run:
- `bun run lint`
- `bun x tsc --noEmit`
- `bun x tsc --noEmit -p tsconfig.test.json`
- `bun run test -- --runInBand`
- `bun run build`

Expected: all commands succeed with Bun as the only repo execution entrypoint

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml README.md .gitignore scripts/migrate.js scripts/reset-db.js scripts/run-migration.mjs
git commit -m "chore: run repo workflows through bun"
```
