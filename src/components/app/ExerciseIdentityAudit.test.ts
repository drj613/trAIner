import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Task 14's identity-bypass audit, expressed as a test rather than as a
 * paragraph in a report — a report goes stale the moment someone adds a file.
 *
 * Two things it pins:
 *
 * 1. **Every consumer that touches identity is named here with a verdict.**
 *    The list below is the audit table. A row is either `"resolver"` (identity
 *    is decided by `resolveExerciseIdentity`, directly or through the provider
 *    / migration context) or `"exact-only"` (the file reads a concrete
 *    catalogue record for its metadata and performs no grouping).
 * 2. **The table is complete.** `covers every runtime catalogue reader` walks
 *    `src/` and fails if any non-test module reads the generated catalogue
 *    without a row here. That is what stops a new surface from quietly
 *    reintroducing the bypass this plan removed — three of the files below did
 *    not exist when the plan's own thirteen-entry list was written.
 */

/**
 * The exact marker the plan mandates on a surviving direct lookup. Spelled as a
 * literal, not imported from the code it checks: a constant shared with the
 * source would agree with itself if the text were changed in both places.
 */
const EXACT_ONLY_MARKER =
  "// Exact concrete metadata lookup; grouping is intentionally not performed here.";

/**
 * A read of the generated catalogue array that picks records out of it — the
 * shape a bypass takes. Whole-array enumeration (`.map`, `.length`) is
 * deliberately not here: building a list to hand to the resolver is not a
 * lookup, and marking it `exact-only` would be a false comment.
 *
 * `\s*` spans newlines because the chain in `ResolutionStep` is written over
 * two lines, and a line-oriented `rg` pattern — the one the plan supplies —
 * silently misses it. That miss is why this is a parser and not a grep.
 */
const CATALOG_LOOKUP =
  /\bexerciseCatalog\s*(?:\r?\n\s*)?\.\s*(?:find|filter|flatMap|some|every|reduce|findIndex|findLast|at|slice|indexOf|sort)\b|\bfor\s*\(\s*const\s+\w+\s+of\s+exerciseCatalog\b/g;

/**
 * A module-level `Map`/`Set` built out of the catalogue. Reading one by key is
 * the same bypass as calling `.find` on the array, only pre-indexed, and naming
 * `catalogIndex` explicitly would have missed `catalogExerciseIds` — which is
 * exactly the "one grep is not an audit" failure this file exists to avoid.
 *
 * Deliberately module-level only. `context.catalogById.get(...)` is a read of
 * the resolver's OWN context, downstream of a resolution that already happened;
 * treating it as a bypass would mark the resolver as bypassing itself.
 *
 * `[^;]` rather than `[\s\S]`: the first form of this pattern matched
 * `const outcomes = new Set<string>();` several lines above an unrelated
 * `exerciseCatalog`, and reported a false site. The index must be built FROM
 * the catalogue, in one statement.
 */
const DERIVED_INDEX =
  /\bconst\s+(\w+)\s*(?::[^=]+)?=\s*new\s+(?:Map|Set)\b[^;]{0,160}?\bexerciseCatalog\b/g;

/** Any mention at all of the runtime catalogue, used only by the completeness sweep. */
const CATALOG_REFERENCE = /\bexerciseCatalog\b|\bcatalogIndex\b/;

/**
 * The shared entry points identity may be decided through. A `"resolver"` row
 * names ONE of these as its `via`, and the test requires that exact symbol.
 *
 * Naming the specific one matters. An earlier form of this test accepted "any
 * marker present", and renaming `projectExerciseHistory` in `HistoryClient` —
 * a surface that would then be doing its own grouping — left all 26 green,
 * because the file still imported `useExerciseNormalization` for other reasons.
 */
const RESOLVER_ENTRY_POINTS = [
  "resolveExerciseIdentity",
  "matchExercise",
  "useExerciseNormalization",
  "createMigrationContext",
  "prepareImportName",
  "projectExerciseHistory",
  "groupCatalogItems",
  "ExerciseIdentityResolver",
] as const;

type ResolverEntryPoint = (typeof RESOLVER_ENTRY_POINTS)[number];

/**
 * `"declaration"` is the third verdict, and it exists for exactly one file:
 * the module that BUILDS the catalogue array. It neither resolves nor looks
 * anything up, and forcing it into either of the other two would mean writing
 * a false comment or a false claim.
 */
type Verdict = "resolver" | "exact-only" | "declaration";

/**
 * The audit table. The plan supplied thirteen rows; this is a superset, because
 * the plan predates `groupCatalog.ts`, `NestedExerciseList.tsx`, the rewritten
 * history surfaces, and the correction sheet.
 */
const IDENTITY_CONSUMERS: ReadonlyArray<{
  file: string;
  verdict: Verdict;
  /** For a `"resolver"` row: the entry point identity must be decided through. */
  via?: ResolverEntryPoint;
  why: string;
}> = [
  // --- the resolver and the data it reads ------------------------------------
  { file: "src/lib/catalog/identity.ts", verdict: "resolver", via: "ExerciseIdentityResolver", why: "the resolver itself" },
  { file: "src/lib/catalog/exercises.ts", verdict: "declaration", why: "declares the catalogue; reads nothing out of it" },
  { file: "src/lib/catalog/match.ts", verdict: "resolver", via: "resolveExerciseIdentity", why: "import matching delegates to resolveExerciseIdentity" },
  { file: "src/lib/catalog/groupCatalog.ts", verdict: "resolver", via: "ExerciseIdentityResolver", why: "grouping is keyed on identity.groupKey" },
  { file: "src/components/app/ExerciseNormalizationProvider.tsx", verdict: "resolver", via: "resolveExerciseIdentity", why: "builds the one shared context" },

  // --- import ---------------------------------------------------------------
  { file: "src/lib/import/parser.ts", verdict: "resolver", via: "matchExercise", why: "matches through matchExercise" },
  { file: "src/lib/import/resolution.ts", verdict: "resolver", via: "prepareImportName", why: "shares the resolver's name preparation" },
  { file: "src/components/import/ImportClient.tsx", verdict: "exact-only", why: "labels a chosen concrete id" },
  { file: "src/components/import/ResolutionStep.tsx", verdict: "exact-only", why: "labels and searches concrete versions the user picks between" },

  // --- storage, migration, backup -------------------------------------------
  { file: "src/lib/storage/aliasRepo.ts", verdict: "resolver", via: "prepareImportName", why: "derives its token with prepareImportName" },
  { file: "src/lib/storage/appDb.ts", verdict: "resolver", via: "createMigrationContext", why: "migration runs through createMigrationContext" },
  { file: "src/lib/storage/migrations/v10Identity.ts", verdict: "exact-only", why: "rewrites via the resolver; the alias purge gate enumerates exact names" },
  { file: "src/lib/storage/normalizationOverrideRepo.ts", verdict: "exact-only", why: "validates that an exercise-id target exists" },
  { file: "src/components/catalog/ExerciseCorrectionSheet.tsx", verdict: "resolver", via: "useExerciseNormalization", why: "labels through the resolver's own context" },
  { file: "src/lib/backup/backup.ts", verdict: "resolver", via: "createMigrationContext", why: "restore normalizes through createMigrationContext" },

  // --- analysis -------------------------------------------------------------
  { file: "src/lib/analysis/muscles.ts", verdict: "exact-only", why: "reads muscles/equipment off one concrete record" },

  // --- catalogue and selection surfaces --------------------------------------
  { file: "src/components/catalog/LibraryClient.tsx", verdict: "resolver", via: "groupCatalogItems", why: "nests through groupCatalogItems" },
  { file: "src/components/catalog/NestedExerciseList.tsx", verdict: "resolver", via: "groupCatalogItems", why: "nests through groupCatalogItems" },
  { file: "src/components/workout/ExercisePickerSheet.tsx", verdict: "exact-only", why: "muscle filter options only; nesting is NestedExerciseList's" },
  { file: "src/components/workout/ExerciseReplaceSheet.tsx", verdict: "exact-only", why: "muscle filter options only; nesting is NestedExerciseList's" },

  // --- history --------------------------------------------------------------
  { file: "src/lib/workout/historyProjection.ts", verdict: "resolver", via: "resolveExerciseIdentity", why: "one resolver call per log entry" },
  { file: "src/components/workout/HistoryClient.tsx", verdict: "resolver", via: "projectExerciseHistory", why: "projects through projectExerciseHistory" },
  { file: "src/components/workout/WorkoutDayClient.tsx", verdict: "resolver", via: "projectExerciseHistory", why: "drawer resolves the slot then projects" },
];

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/**
 * Blanks out comments while preserving every byte offset, so a lookup written
 * inside prose does not read as a real one and line numbers stay honest.
 */
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

type LookupSite = { line: number; text: string };

function lookupSites(source: string): LookupSite[] {
  const masked = maskComments(source);
  const lines = source.split("\n");
  const sites: LookupSite[] = [];
  const push = (index: number) => {
    const line = masked.slice(0, index).split("\n").length;
    sites.push({ line, text: lines[line - 1] });
  };

  for (const match of masked.matchAll(CATALOG_LOOKUP)) push(match.index);

  for (const declaration of masked.matchAll(DERIVED_INDEX)) {
    const indexName = declaration[1];
    const reads = new RegExp(`(?<![.\\w])${indexName}\\s*\\.\\s*(?:get|has)\\s*\\(`, "g");
    for (const read of masked.matchAll(reads)) push(read.index);
  }

  return sites.sort((left, right) => left.line - right.line);
}

function listSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(REPO_ROOT, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(relative, found);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.|testFixtures|\.d\.ts$/.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

describe("exercise identity consumer audit", () => {
  it.each(IDENTITY_CONSUMERS.map((row) => [row.file, row.verdict, row.why, row.via] as const))(
    "%s — %s (%s)",
    (file, verdict, _why, via) => {
      const source = readSource(file);
      const sites = lookupSites(source);

      if (verdict === "declaration") {
        expect(sites).toEqual([]);
        expect(source).toContain("export const exerciseCatalog");
        return;
      }

      if (verdict === "resolver") {
        // Not merely "has no bypass": it must positively route through the
        // resolver, or a file that stopped resolving identity altogether would
        // pass by doing nothing.
        // Word-boundary, not `includes`: `projectExerciseHistoryX` contains
        // `projectExerciseHistory`, so a substring test would accept a renamed
        // — i.e. removed — call.
        expect(via).toBeDefined();
        expect(new RegExp(`\\b${via!}\\b`).test(source)).toBe(true);
        expect(sites.map((site) => `${file}:${site.line}`)).toEqual([]);
        return;
      }

      // An exact-only row still has to say so at each site, in the mandated
      // words, on the line the catalogue is read from.
      expect(sites.length).toBeGreaterThan(0);
      const unmarked = sites
        .filter((site) => !site.text.includes(EXACT_ONLY_MARKER))
        .map((site) => `${file}:${site.line}  ${site.text.trim()}`);
      expect(unmarked).toEqual([]);
    },
  );

  it("covers every runtime catalogue reader in src/", () => {
    const listed = new Set(IDENTITY_CONSUMERS.map((row) => row.file));
    const readers = listSourceFiles("src").filter((file) =>
      CATALOG_REFERENCE.test(maskComments(readSource(file))),
    );

    expect(readers.filter((file) => !listed.has(file))).toEqual([]);

    // Every row names a file that still exists. A row pointing at a deleted or
    // renamed module would otherwise sit here claiming coverage of nothing —
    // `readSource` throws, which is the check.
    expect(() => IDENTITY_CONSUMERS.forEach((row) => readSource(row.file))).not.toThrow();
  });

  it("finds no history or analysis surface grouping by canonicalExerciseId ?? exerciseId", () => {
    // Scoped exactly as the spec scopes the prohibition: "No history or
    // analysis surface may group by `canonicalExerciseId ?? exerciseId`". The
    // resolver itself is not in scope and must not be — its standalone branch
    // is REQUIRED to fall back to the slot id, and a repo-wide sweep would
    // report the one place the spec mandates the shape.
    const surfaces = [
      "src/lib/workout",
      "src/lib/analysis",
      "src/lib/analytics",
      "src/components/workout",
      "src/components/catalog",
    ].flatMap((directory) => listSourceFiles(directory));
    expect(surfaces.length).toBeGreaterThan(20);

    const offenders = surfaces.filter((file) =>
      /canonicalExerciseId\s*\?\?\s*[^;\n]*(?:exerciseId|slotId)\b/.test(maskComments(readSource(file))),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps one dispatcher and one listener for the identity refresh signal", () => {
    const wireName = "trainer-exercise-identity-changed";
    const holders = listSourceFiles("src").filter((file) => readSource(file).includes(wireName));
    // The literal lives in exactly one module; every other site imports the
    // constant, so a typo cannot produce a silently dead listener.
    expect(holders).toEqual(["src/lib/catalog/identityEvents.ts"]);

    const listeners = listSourceFiles("src").filter((file) =>
      /addEventListener\(\s*EXERCISE_IDENTITY_CHANGED_EVENT/.test(readSource(file)),
    );
    expect(listeners).toEqual(["src/components/app/ExerciseNormalizationProvider.tsx"]);
  });
});
