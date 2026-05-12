/**
 * One-time ingest: ExerciseDB Pro local JSON → scripts/sources/exercisedbpro-snapshot.json
 *
 * Usage:
 *   node scripts/ingest/ingest-exercisedbpro.mjs
 *
 * Reads: exerciseDBpro720px/exerciseData_complete.json
 * Writes:
 *   scripts/sources/exercisedbpro-snapshot.json  — normalized ExerciseCatalogItem[]
 *   scripts/sources/exercisedbpro-review.txt      — uncertain matches (0.60–0.80 Jaccard)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve repo root: use git to find the main worktree's root (handles linked worktrees)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot() {
  try {
    // Parse `git worktree list --porcelain` to find the main worktree
    const output = execSync("git worktree list --porcelain", {
      cwd: __dirname,
      encoding: "utf8",
    });
    const lines = output.split("\n");
    // First worktree entry is always the main worktree
    const mainWorktreeLine = lines.find((l) => l.startsWith("worktree "));
    if (mainWorktreeLine) {
      return mainWorktreeLine.slice("worktree ".length).trim();
    }
  } catch {
    // ignore — fall back to script-relative resolution
  }
  // Fall back: two levels up from scripts/ingest/
  return path.resolve(__dirname, "..", "..");
}

const REPO_ROOT = findRepoRoot();

const PRO_DATA_PATH = path.join(REPO_ROOT, "exerciseDBpro720px", "exerciseData_complete.json");
const CATALOG_PATH = path.join(REPO_ROOT, "src", "lib", "catalog", "exercises.generated.json");
const SNAPSHOT_PATH = path.join(REPO_ROOT, "scripts", "sources", "exercisedbpro-snapshot.json");
const REVIEW_PATH = path.join(REPO_ROOT, "scripts", "sources", "exercisedbpro-review.txt");

// ─── Normalization helpers (copied from build-exercise-catalog.mjs) ───────────

const EQUIPMENT_ALIASES = new Map([
  // from build script
  ["body only", "bodyweight"],
  ["bands", "resistance band"],
  ["band", "resistance band"],
  ["none", "bodyweight"],
  ["ez curl bar", "ez bar"],
  ["e-z curl bar", "ez bar"],
  ["other", "other"],
  // Pro additions
  ["body weight", "bodyweight"],
  ["ez barbell", "ez bar"],
  ["leverage machine", "machine"],
  ["olympic barbell", "barbell"],
  ["smith machine", "smith machine"],  // keep as-is — distinct from generic machine
  ["stability ball", "exercise ball"],
  ["assisted", "bodyweight"],
  ["assisted (towel)", "bodyweight"],
  ["weighted", "other"],
  ["wheel roller", "other"],
  ["rope", "cable"],
  ["trap bar", "trap bar"],             // keep as-is — distinct barbell variant
  ["bosu ball", "exercise ball"],
  ["roller", "foam roll"],
]);

const MUSCLE_ALIASES = new Map([
  // from build script
  ["abdominals", "abs"],
  ["quadriceps", "quads"],
  ["middle back", "mid back"],
  ["glute", "glutes"],
  ["quad", "quads"],
  ["hamstring", "hamstrings"],
  ["lat", "lats"],
  ["tricep", "triceps"],
  ["bicep", "biceps"],
  ["calf", "calves"],
  ["trap", "traps"],
  ["abdominal", "abs"],
  ["oblique", "obliques"],
  ["thigh - inner", "adductors"],
  ["thigh - outer", "abductors"],
  ["shoulder - front", "front delts"],
  ["shoulder - side", "side delts"],
  ["shoulder - back", "rear delts"],
  ["rotator cuff - back", "rotator cuff"],
  ["rotator cuff - front", "rotator cuff"],
  ["forearm - inner", "forearms"],
  ["forearm - outer", "forearms"],
  ["pecs", "chest"],
  ["delts", "shoulders"],
  ["cardiovascular system", "heart"],
  ["levator scapulae", "upper back"],
  ["spine", "lower back"],
  // Pro additions
  ["pectorals", "chest"],
  ["cardiovascular system", "heart"],   // already present but kept for clarity
  ["quadriceps", "quads"],
  ["back", "upper back"],
  ["serratus anterior", "serratus anterior"],
  ["upper back", "upper back"],
]);

const ABBREVIATIONS = [
  ["Dumbbell", "DB"],
  ["Dumbbells", "DBs"],
  ["Barbell", "BB"],
  ["Kettlebell", "KB"],
  ["Kettlebells", "KBs"],
];

function normalizeId(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function normalizeMuscle(name) {
  const cleaned = cleanText(name).toLowerCase();
  return MUSCLE_ALIASES.get(cleaned) ?? cleaned;
}

function normalizeEquipment(value) {
  const eq = cleanText(value).toLowerCase();
  if (!eq || eq === "null") return [];
  return [EQUIPMENT_ALIASES.get(eq) ?? eq];
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function uniqueMuscles(values) {
  return [...new Set(values.map(normalizeMuscle).filter(Boolean))];
}

function removeParenthetical(value) {
  return cleanText(value.replace(/\s*\([^)]*\)\s*/g, " "));
}

function aliasesForName(name, sourceId) {
  const aliases = new Set([name, cleanText(sourceId.replace(/[_-]+/g, " "))]);
  const beforeDash = cleanText(name.split(" - ")[0]);
  if (beforeDash && beforeDash !== name) aliases.add(beforeDash);

  const noParenthetical = removeParenthetical(name);
  if (noParenthetical && noParenthetical !== name) aliases.add(noParenthetical);

  for (const [word, abbreviation] of ABBREVIATIONS) {
    if (!name.includes(word)) continue;
    const abbreviated = cleanText(name.replaceAll(word, abbreviation));
    aliases.add(abbreviated);
    const shortenedPress = abbreviated.replace(/\s+Press$/i, "");
    if (shortenedPress !== abbreviated) aliases.add(shortenedPress);
  }

  return [...aliases].filter((alias) => alias !== name);
}

// ─── Pro-specific normalization ───────────────────────────────────────────────

/** Strip gender suffixes: (male), (female), (men), (women), case-insensitive */
function stripGenderSuffix(name) {
  return cleanText(name.replace(/\s*\((male|female|men|women)\)\s*$/i, ""));
}

/**
 * Split a potentially comma-separated equipment string and normalize each part.
 * E.g. "dumbbell, exercise ball" → ["dumbbell", "exercise ball"]
 */
function normalizeEquipmentPro(value) {
  const raw = cleanText(value);
  if (!raw || raw === "null") return [];
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .flatMap((part) => {
      if (!part) return [];
      return [EQUIPMENT_ALIASES.get(part) ?? part];
    })
    .filter(Boolean);
}

/**
 * Map Pro category to movementPatterns and tags.
 */
const CATEGORY_MAP = {
  strength: { movementPatterns: ["strength"], tags: ["strength"] },
  cardio: { movementPatterns: ["cardio"], tags: ["cardio"] },
  mobility: { movementPatterns: ["mobility"], tags: ["mobility"] },
  plyometrics: { movementPatterns: ["plyometrics"], tags: ["plyometrics"] },
  stretching: { movementPatterns: ["flexibility"], tags: ["flexibility"] },
  balance: { movementPatterns: ["stability"], tags: ["stability"] },
  rehabilitation: { movementPatterns: ["rehab"], tags: ["rehab"] },
};

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

/** Tokenize a name for Jaccard comparison: lowercase, split on non-alphanumeric, filter empty */
function tokenize(name) {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
}

/** Jaccard similarity between two Sets */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Transform ────────────────────────────────────────────────────────────────

function transformPro(source) {
  const cleanedName = stripGenderSuffix(source.name);
  const name = cleanedName;
  const equipment = unique(normalizeEquipmentPro(source.equipment));
  const category = (source.category ?? "").toLowerCase();
  const categoryMapping = CATEGORY_MAP[category] ?? { movementPatterns: [], tags: [] };

  return {
    id: normalizeId(name),                     // may be overridden after matching
    name,
    aliases: aliasesForName(name, normalizeId(name)),
    equipment,
    movementPatterns: unique(categoryMapping.movementPatterns),
    muscles: {
      primary: uniqueMuscles([source.target]),
      secondary: uniqueMuscles(normalizeList(source.secondaryMuscles)),
    },
    tags: unique(categoryMapping.tags),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("Reading Pro data...");
const proData = JSON.parse(await readFile(PRO_DATA_PATH, "utf8"));
console.log(`  ${proData.length} exercises read`);

console.log("Loading existing catalog...");
const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
console.log(`  ${catalog.length} catalog entries loaded`);

// Pre-tokenize catalog entries for fuzzy matching
const catalogTokens = catalog.map((entry) => ({
  id: entry.id,
  name: entry.name,
  tokens: tokenize(entry.name),
}));

console.log("Transforming and fuzzy-matching Pro exercises...");

let strongMatches = 0;
let uncertainMatches = 0;
let newEntries = 0;

const uncertainReportEntries = [];
const byId = new Map();

for (const source of proData) {
  const exercise = transformPro(source);
  const proTokens = tokenize(exercise.name);

  // Find best Jaccard match in existing catalog
  let bestScore = 0;
  let bestEntry = null;
  for (const catalogEntry of catalogTokens) {
    const score = jaccard(proTokens, catalogEntry.tokens);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = catalogEntry;
    }
  }

  if (bestScore >= 0.80) {
    // Strong match — use existing catalog slug
    exercise.id = bestEntry.id;
    strongMatches++;
  } else if (bestScore >= 0.60) {
    // Uncertain — keep generated slug, add to review report
    uncertainMatches++;
    uncertainReportEntries.push({
      score: bestScore,
      proName: exercise.name,
      existingName: bestEntry?.name ?? "(none)",
    });
  } else {
    newEntries++;
  }

  // Deduplicate by id (keep first, matching build-script convention)
  if (!byId.has(exercise.id)) {
    byId.set(exercise.id, exercise);
  }
}

const snapshot = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

console.log(`\nResults:`);
console.log(`  Total Pro exercises read:  ${proData.length}`);
console.log(`  Strong matches (≥0.80):    ${strongMatches}`);
console.log(`  Uncertain (0.60–0.80):     ${uncertainMatches}`);
console.log(`  New entries (<0.60):       ${newEntries}`);
console.log(`  Total written (deduped):   ${snapshot.length}`);

// ─── Write snapshot ───────────────────────────────────────────────────────────

await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`\nWrote snapshot → ${SNAPSHOT_PATH}`);

// ─── Write review report ──────────────────────────────────────────────────────

uncertainReportEntries.sort((a, b) => b.score - a.score);

const timestamp = new Date().toISOString();
const PAD_SCORE = 6;
const PAD_PRO = 36;

const lines = [
  "ExerciseDBPro uncertain matches (0.60–0.80 Jaccard) — review manually",
  "Add correct mappings to scripts/catalog-local-overrides.json as { \"id\": \"<existing-slug>\", ... }",
  `Generated: ${timestamp}`,
  "",
  `${"score".padEnd(PAD_SCORE)} ${"Pro name".padEnd(PAD_PRO)} → Existing match`,
];

for (const entry of uncertainReportEntries) {
  const score = entry.score.toFixed(2).padEnd(PAD_SCORE);
  const proName = entry.proName.padEnd(PAD_PRO);
  lines.push(`${score} ${proName} → ${entry.existingName}`);
}

await writeFile(REVIEW_PATH, lines.join("\n") + "\n");
console.log(`Wrote review report → ${REVIEW_PATH}`);
console.log(`  ${uncertainReportEntries.length} uncertain matches listed`);
