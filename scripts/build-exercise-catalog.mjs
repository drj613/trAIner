import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CATALOG_DIR = path.join("src", "lib", "catalog");
const OUTPUT_JSON_PATH = path.join(CATALOG_DIR, "exercises.generated.json");
const OUTPUT_WRAPPER_PATH = path.join(CATALOG_DIR, "exercises.ts");
const CURATED_PATH = path.join("scripts", "sources", "curated.json");

// Snapshot files produced by scripts/ingest/*.mjs — skipped if absent
const SNAPSHOT_PATHS = [
  path.join("scripts", "sources", "exercisedb-snapshot.json"),
  path.join("scripts", "sources", "wger-snapshot.json"),
];

// ─── Normalization helpers ────────────────────────────────────────────────────

const EQUIPMENT_ALIASES = new Map([
  ["body only", "bodyweight"],
  ["bands", "resistance band"],
  ["band", "resistance band"],
  ["none", "bodyweight"],
  ["ez curl bar", "ez bar"],
  ["e-z curl bar", "ez bar"],
  ["other", "other"],
]);

const MUSCLE_ALIASES = new Map([
  // free-exercise-db
  ["abdominals", "abs"],
  ["quadriceps", "quads"],
  ["middle back", "mid back"],
  // exercemus
  ["middle back", "mid back"],
  // longhaul-fitness (singular forms)
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
  // ExerciseDB
  ["pecs", "chest"],
  ["delts", "shoulders"],
  ["cardiovascular system", "heart"],
  ["levator scapulae", "upper back"],
  ["spine", "lower back"],
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

// Used by the Pro enrichment pass (see "Loading Pro snapshot" below).
function mergeExercise(base, override) {
  if (!base) return override;
  return {
    ...base,
    ...override,
    name: base.name ?? override.name,   // preserve existing name
    aliases: unique([...(base.aliases ?? []), ...(override.aliases ?? [])]),
    equipment: unique([...(base.equipment ?? []), ...(override.equipment ?? [])]),
    movementPatterns: unique([...(base.movementPatterns ?? []), ...(override.movementPatterns ?? [])]),
    muscles: {
      primary: unique([...(base.muscles?.primary ?? []), ...(override.muscles?.primary ?? [])]),
      secondary: unique([...(base.muscles?.secondary ?? []), ...(override.muscles?.secondary ?? [])]),
    },
    tags: unique([...(base.tags ?? []), ...(override.tags ?? [])]),
  };
}

// ─── Source adapters ──────────────────────────────────────────────────────────

function transformFreeExerciseDb(source) {
  const name = cleanText(source.name);
  return {
    id: normalizeId(name),
    name,
    aliases: aliasesForName(name, cleanText(source.id || name)),
    equipment: normalizeEquipment(source.equipment),
    movementPatterns: unique([source.category, source.force, source.mechanic]),
    muscles: {
      primary: uniqueMuscles(normalizeList(source.primaryMuscles)),
      secondary: uniqueMuscles(normalizeList(source.secondaryMuscles)),
    },
    tags: unique([source.category, source.level, source.mechanic, source.force]),
  };
}

function transformExercemus(source) {
  const name = cleanText(source.name);
  const equipment = normalizeList(source.equipment)
    .map((e) => EQUIPMENT_ALIASES.get(e.toLowerCase()) ?? e.toLowerCase())
    .filter((e) => e && e !== "other");
  return {
    id: normalizeId(name),
    name,
    aliases: aliasesForName(name, normalizeId(name)),
    equipment,
    movementPatterns: unique([source.category]),
    muscles: {
      primary: uniqueMuscles(normalizeList(source.primary_muscles)),
      secondary: uniqueMuscles(normalizeList(source.secondary_muscles)),
    },
    tags: unique([source.category]),
  };
}

function transformLonghaul(source) {
  const name = cleanText(source.name);
  return {
    id: normalizeId(name),
    name,
    aliases: source.slug ? [cleanText(source.slug.replace(/-/g, " "))] : [],
    equipment: [],
    movementPatterns: [],
    muscles: {
      primary: uniqueMuscles(normalizeList(source.primaryMuscles)),
      secondary: uniqueMuscles(normalizeList(source.secondaryMuscles)),
    },
    tags: [],
  };
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function loadSource(descriptor) {
  const data = await fetchJson(descriptor.url);
  const items = descriptor.extract ? descriptor.extract(data) : data;
  return items.map(descriptor.transform).filter(Boolean);
}

async function loadSnapshot(filePath) {
  if (!existsSync(filePath)) return [];
  const data = JSON.parse(await readFile(filePath, "utf8"));
  console.log(`  loaded snapshot ${path.basename(filePath)}: ${data.length} exercises`);
  return data;
}

// ─── Live sources (fetched every build) ──────────────────────────────────────

const LIVE_SOURCES = [
  {
    name: "free-exercise-db",
    url: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
    transform: transformFreeExerciseDb,
  },
  {
    name: "exercemus",
    url: "https://raw.githubusercontent.com/exercemus/exercises/main/exercises.json",
    extract: (data) => data.exercises,
    transform: transformExercemus,
  },
  {
    name: "longhaul-strength",
    url: "https://raw.githubusercontent.com/longhaul-fitness/exercises/main/strength.json",
    transform: transformLonghaul,
  },
  {
    name: "longhaul-flexibility",
    url: "https://raw.githubusercontent.com/longhaul-fitness/exercises/main/flexibility.json",
    transform: transformLonghaul,
  },
];

// ─── Build ────────────────────────────────────────────────────────────────────

const byId = new Map();

function addExercises(exercises, sourceName) {
  let added = 0;
  for (const exercise of exercises) {
    if (!exercise?.id) continue;
    if (!byId.has(exercise.id)) {
      byId.set(exercise.id, exercise);
      added++;
    }
  }
  console.log(`  ${sourceName}: ${exercises.length} exercises, ${added} new`);
}

console.log("Loading curated entries...");
const curated = JSON.parse(await readFile(CURATED_PATH, "utf8"));
const curatedStubs = [];
let curatedLoaded = 0;
for (const entry of curated) {
  if (!entry?.id) continue;
  if (entry.name) {
    byId.set(entry.id, entry);
    curatedLoaded++;
  } else {
    curatedStubs.push(entry); // alias-only stubs — applied after other sources
  }
}
console.log(`  loaded ${curatedLoaded} curated entries, ${curatedStubs.length} stubs deferred`);

console.log("Loading live sources...");
for (const descriptor of LIVE_SOURCES) {
  const exercises = await loadSource(descriptor);
  addExercises(exercises, descriptor.name);
}

console.log("Loading snapshots...");
for (const snapshotPath of SNAPSHOT_PATHS) {
  const exercises = await loadSnapshot(snapshotPath);
  if (exercises.length > 0) addExercises(exercises, path.basename(snapshotPath));
}

for (const stub of curatedStubs) {
  if (byId.has(stub.id)) {
    byId.set(stub.id, mergeExercise(byId.get(stub.id), stub));
  }
}
if (curatedStubs.length > 0) {
  console.log(`  Applied ${curatedStubs.length} curated stubs`);
}

console.log("Applying Pro enrichment...");
const PRO_SNAPSHOT_PATH = path.join("scripts", "sources", "exercisedbpro-snapshot.json");
if (existsSync(PRO_SNAPSHOT_PATH)) {
  const proEntries = JSON.parse(await readFile(PRO_SNAPSHOT_PATH, "utf8"));
  let enriched = 0;
  let added = 0;
  for (const entry of proEntries) {
    if (!entry?.id) continue;
    if (byId.has(entry.id)) {
      byId.set(entry.id, mergeExercise(byId.get(entry.id), entry));
      enriched++;
    } else {
      byId.set(entry.id, entry);
      added++;
    }
  }
  console.log(`  Pro enrichment: ${enriched} enriched, ${added} new`);
} else {
  console.log("  Pro snapshot not found — skipping (run scripts/ingest/ingest-exercisedbpro.mjs first)");
}

// Demote front_delts from primary to secondary on pressing exercises.
// The RP volume landmark model treats front delt volume from pressing as indirect;
// mavHigh:8 is calibrated for direct front delt work only.
const PRESSING_PATTERN = /\b(press|push[-\s]?up|fly|flye|dip|bench)\b/i;
let frontDeltsCorrected = 0;
for (const [id, exercise] of byId) {
  const isPressing = PRESSING_PATTERN.test(exercise.name);
  if (!isPressing) continue;
  const primaryIdx = exercise.muscles.primary.indexOf("front delts");
  if (primaryIdx === -1) continue;
  // Move front delts from primary to secondary
  exercise.muscles.primary.splice(primaryIdx, 1);
  if (!exercise.muscles.secondary.includes("front delts")) {
    exercise.muscles.secondary.push("front delts");
  }
  frontDeltsCorrected++;
}
if (frontDeltsCorrected > 0) {
  console.log(`  Taxonomy: demoted front_delts→secondary on ${frontDeltsCorrected} pressing exercises`);
}

const catalog = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

function renderTypeScriptWrapper() {
  const sourceList = LIVE_SOURCES.map((s) => s.name).join(", ");
  return `import catalog from "./exercises.generated.json";

// Data generated by scripts/build-exercise-catalog.mjs
// Sources: ${sourceList}, plus snapshots in scripts/sources/ and curated entries.
export type ExerciseCatalogItem = {
  id: string;
  name: string;
  aliases: string[];
  equipment: string[];
  movementPatterns: string[];
  muscles: {
    primary: string[];
    secondary: string[];
  };
  tags: string[];
};

export const exerciseCatalog: ExerciseCatalogItem[] = catalog;
`;
}

await mkdir(CATALOG_DIR, { recursive: true });
await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(OUTPUT_WRAPPER_PATH, renderTypeScriptWrapper());

console.log(`\nBuilt ${catalog.length} exercises total.`);
