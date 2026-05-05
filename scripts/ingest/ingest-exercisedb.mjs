/**
 * One-time ingest: ExerciseDB V1 via RapidAPI → scripts/sources/exercisedb-snapshot.json
 *
 * Usage:
 *   RAPIDAPI_KEY=<your-key> node scripts/ingest/ingest-exercisedb.mjs
 *
 * After running, commit the snapshot file and the catalog will include it on next build.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.RAPIDAPI_KEY;
if (!API_KEY) {
  console.error("Error: RAPIDAPI_KEY environment variable is required.");
  console.error("Usage: RAPIDAPI_KEY=<your-key> node scripts/ingest/ingest-exercisedb.mjs");
  process.exit(1);
}

const BASE_URL = "https://exercisedb.p.rapidapi.com";
const HEADERS = {
  "X-RapidAPI-Key": API_KEY,
  "X-RapidAPI-Host": "exercisedb.p.rapidapi.com",
};
// The free tier caps limit at 10 per request — use 10 and paginate until empty.
const PAGE_SIZE = 10;
const OUTPUT_PATH = path.join("scripts", "sources", "exercisedb-snapshot.json");

const MUSCLE_ALIASES = new Map([
  ["pecs", "chest"],
  ["delts", "shoulders"],
  ["cardiovascular system", "heart"],
  ["levator scapulae", "upper back"],
  ["spine", "lower back"],
  ["upper back", "upper back"],
  ["lower back", "lower back"],
  ["abductors", "abductors"],
  ["adductors", "adductors"],
]);

const EQUIPMENT_ALIASES = new Map([
  ["body weight", "bodyweight"],
  ["assisted", "machine"],
  ["leverage machine", "machine"],
  ["smith machine", "smith machine"],
  ["ez barbell", "ez bar"],
  ["weighted", "dumbbell"],
]);

function normalizeMuscle(name) {
  const cleaned = (name ?? "").trim().toLowerCase();
  return MUSCLE_ALIASES.get(cleaned) ?? cleaned;
}

function normalizeEquipment(value) {
  const cleaned = (value ?? "").trim().toLowerCase();
  return EQUIPMENT_ALIASES.get(cleaned) ?? cleaned;
}

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

function titleCase(str) {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function transform(source) {
  // ExerciseDB names are lowercase — convert to title case
  const name = titleCase(cleanText(source.name));
  const equipment = normalizeEquipment(source.equipment);

  return {
    id: normalizeId(name),
    name,
    aliases: [],
    equipment: equipment ? [equipment] : [],
    movementPatterns: [source.bodyPart, source.category].filter(Boolean),
    muscles: {
      primary: [normalizeMuscle(source.target)].filter(Boolean),
      secondary: (source.secondaryMuscles ?? []).map(normalizeMuscle).filter(Boolean),
    },
    tags: [source.bodyPart, source.category].filter(Boolean),
  };
}

async function fetchPage(offset) {
  const url = `${BASE_URL}/exercises?limit=${PAGE_SIZE}&offset=${offset}`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }
  return response.json();
}

console.log("Fetching exercises from ExerciseDB V1...");
const allExercises = [];
let offset = 0;

while (true) {
  console.log(`  fetching offset=${offset}...`);
  const page = await fetchPage(offset);
  if (!Array.isArray(page) || page.length === 0) break;
  allExercises.push(...page);
  offset += page.length;
}

console.log(`Fetched ${allExercises.length} exercises. Transforming...`);

const normalized = allExercises.map(transform);

// Deduplicate by ID (keep first)
const byId = new Map();
for (const ex of normalized) {
  if (!byId.has(ex.id)) byId.set(ex.id, ex);
}
const deduped = [...byId.values()];

console.log(`After dedup: ${deduped.length} exercises.`);

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(deduped, null, 2)}\n`);
console.log(`Saved to ${OUTPUT_PATH}`);
console.log("Run 'npm run build:catalog' to incorporate into the catalog.");
