/**
 * One-time ingest: wger exercise fixtures → scripts/sources/wger-snapshot.json
 *
 * No authentication required. Fetches from the wger GitHub repo.
 *
 * Usage:
 *   node scripts/ingest/ingest-wger.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WGER_RAW = "https://raw.githubusercontent.com/wger-project/wger/master/wger/exercises/fixtures";
const OUTPUT_PATH = path.join("scripts", "sources", "wger-snapshot.json");

async function fetchFixture(name) {
  const url = `${WGER_RAW}/${name}`;
  console.log(`  fetching ${name}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${name}: ${response.status}`);
  return response.json();
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

const MUSCLE_BY_PK = new Map([
  [1, "biceps"],
  [2, "shoulders"],
  [3, "serratus anterior"],
  [4, "chest"],
  [5, "triceps"],
  [6, "abs"],
  [7, "calves"],
  [8, "glutes"],
  [9, "traps"],
  [10, "quads"],
  [11, "hamstrings"],
  [12, "lats"],
  [13, "brachialis"],
  [14, "obliques"],
  [15, "soleus"],
  [16, "lower back"],
]);

const EQUIPMENT_BY_PK = new Map([
  [1, "barbell"],
  [2, "ez bar"],
  [3, "dumbbell"],
  [4, "gym mat"],
  [5, "swiss ball"],
  [6, "pull-up bar"],
  [7, "bodyweight"],
  [8, "bench"],
  [9, "incline bench"],
  [10, "kettlebell"],
  [11, "resistance band"],
]);

const CATEGORY_BY_PK = new Map([
  [8, "arms"],
  [9, "legs"],
  [10, "abs"],
  [11, "chest"],
  [12, "back"],
  [13, "shoulders"],
  [14, "calves"],
  [15, "cardio"],
]);

function normalizeId(value) {
  return String(value)
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("Fetching wger fixtures from GitHub...");
const [exerciseData, translationData] = await Promise.all([
  fetchFixture("exercise-base-data.json"),
  fetchFixture("translations.json"),
]);

// Index translations by exercise ID (language 2 = English)
const englishByExerciseId = new Map();
for (const record of translationData) {
  if (record.model === "exercises.translation" && record.fields.language === 2) {
    const exerciseId = record.fields.exercise;
    if (!englishByExerciseId.has(exerciseId)) {
      englishByExerciseId.set(exerciseId, record.fields);
    }
  }
}

// Transform exercises
const exercises = [];
for (const record of exerciseData) {
  if (record.model !== "exercises.exercise") continue;

  const translation = englishByExerciseId.get(record.pk);
  if (!translation?.name) continue;

  const name = cleanText(translation.name);
  const fields = record.fields;

  exercises.push({
    id: normalizeId(name),
    name,
    aliases: [],
    equipment: (fields.equipment ?? [])
      .map((pk) => EQUIPMENT_BY_PK.get(pk))
      .filter(Boolean),
    movementPatterns: [CATEGORY_BY_PK.get(fields.category)].filter(Boolean),
    muscles: {
      primary: (fields.muscles ?? []).map((pk) => MUSCLE_BY_PK.get(pk)).filter(Boolean),
      secondary: (fields.muscles_secondary ?? []).map((pk) => MUSCLE_BY_PK.get(pk)).filter(Boolean),
    },
    tags: [CATEGORY_BY_PK.get(fields.category)].filter(Boolean),
  });
}

// Deduplicate by ID
const byId = new Map();
for (const ex of exercises) {
  if (!byId.has(ex.id)) byId.set(ex.id, ex);
}
const deduped = [...byId.values()];

console.log(`Transformed ${exercises.length} exercises → ${deduped.length} after dedup.`);

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(deduped, null, 2)}\n`);
console.log(`Saved to ${OUTPUT_PATH}`);
console.log("Run 'npm run build:catalog' to incorporate into the catalog.");
