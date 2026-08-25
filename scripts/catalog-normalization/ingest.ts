import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

type Exercise = {
  id: string;
  name: string;
  aliases: string[];
  equipment: string[];
  movementPatterns: string[];
  muscles: { primary: string[]; secondary: string[] };
  tags: string[];
};

type SourceDescriptor = {
  name: string;
  url: string;
  extract?: (data: unknown) => unknown[];
  transform: (source: Record<string, unknown>) => Exercise;
};

const REPOSITORY_ROOT = process.cwd();
const STAGING_ROOT = resolve(REPOSITORY_ROOT, "scripts/catalog-normalization/staging");
const CURATED_PATH = resolve(REPOSITORY_ROOT, "scripts/sources/curated.json");
const SNAPSHOT_PATHS = [
  resolve(REPOSITORY_ROOT, "scripts/sources/exercisedb-snapshot.json"),
  resolve(REPOSITORY_ROOT, "scripts/sources/wger-snapshot.json"),
];
const PRO_SNAPSHOT_PATH = resolve(REPOSITORY_ROOT, "scripts/sources/exercisedbpro-snapshot.json");

const equipmentAliases = new Map([
  ["body only", "bodyweight"], ["bands", "resistance band"], ["band", "resistance band"],
  ["none", "bodyweight"], ["ez curl bar", "ez bar"], ["e-z curl bar", "ez bar"],
]);
const muscleAliases = new Map([
  ["abdominals", "abs"], ["quadriceps", "quads"], ["middle back", "mid back"], ["glute", "glutes"],
  ["quad", "quads"], ["hamstring", "hamstrings"], ["lat", "lats"], ["tricep", "triceps"],
  ["bicep", "biceps"], ["calf", "calves"], ["trap", "traps"], ["abdominal", "abs"],
  ["oblique", "obliques"], ["thigh - inner", "adductors"], ["thigh - outer", "abductors"],
  ["shoulder - front", "front delts"], ["shoulder - side", "side delts"],
  ["shoulder - back", "rear delts"], ["rotator cuff - back", "rotator cuff"],
  ["rotator cuff - front", "rotator cuff"], ["forearm - inner", "forearms"],
  ["forearm - outer", "forearms"],
  ["pecs", "chest"], ["delts", "shoulders"], ["cardiovascular system", "heart"],
  ["levator scapulae", "upper back"], ["spine", "lower back"],
]);
const ABBREVIATIONS = [["Dumbbell", "DB"], ["Dumbbells", "DBs"], ["Barbell", "BB"], ["Kettlebell", "KB"], ["Kettlebells", "KBs"]] as const;

function cleanText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeId(value: unknown): string {
  return cleanText(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function normalizedMuscles(value: unknown): string[] {
  return unique(normalizeList(value).map((muscle) => muscleAliases.get(muscle.toLowerCase()) ?? muscle.toLowerCase()));
}

function aliasesForName(name: string, sourceId: string): string[] {
  const aliases = new Set([cleanText(sourceId.replace(/[_-]+/g, " "))]);
  const beforeDash = cleanText(name.split(" - ")[0]);
  if (beforeDash && beforeDash !== name) aliases.add(beforeDash);
  const noParenthetical = cleanText(name.replace(/\s*\([^)]*\)\s*/g, " "));
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

function freeExerciseDb(source: Record<string, unknown>): Exercise {
  const name = cleanText(source.name);
  const equipment = cleanText(source.equipment).toLowerCase();
  return {
    id: normalizeId(name), name, aliases: aliasesForName(name, cleanText(source.id || name)),
    equipment: !equipment || equipment === "null" ? [] : [equipmentAliases.get(equipment) ?? equipment],
    movementPatterns: unique([cleanText(source.category), cleanText(source.force), cleanText(source.mechanic)]),
    muscles: { primary: normalizedMuscles(source.primaryMuscles), secondary: normalizedMuscles(source.secondaryMuscles) },
    tags: unique([cleanText(source.category), cleanText(source.level), cleanText(source.mechanic), cleanText(source.force)]),
  };
}

function exercemus(source: Record<string, unknown>): Exercise {
  const name = cleanText(source.name);
  return {
    id: normalizeId(name), name, aliases: aliasesForName(name, normalizeId(name)),
    equipment: unique(normalizeList(source.equipment).map((value) => equipmentAliases.get(value.toLowerCase()) ?? value.toLowerCase()).filter((value) => value !== "other")),
    movementPatterns: unique([cleanText(source.category)]),
    muscles: { primary: normalizedMuscles(source.primary_muscles), secondary: normalizedMuscles(source.secondary_muscles) },
    tags: unique([cleanText(source.category)]),
  };
}

function longhaul(source: Record<string, unknown>): Exercise {
  const name = cleanText(source.name);
  return {
    id: normalizeId(name), name,
    aliases: source.slug ? [cleanText(source.slug).replace(/-/g, " ")] : [],
    equipment: [], movementPatterns: [],
    muscles: { primary: normalizedMuscles(source.primaryMuscles), secondary: normalizedMuscles(source.secondaryMuscles) },
    tags: [],
  };
}

const LIVE_SOURCES: SourceDescriptor[] = [
  { name: "free-exercise-db", url: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json", transform: freeExerciseDb },
  { name: "exercemus", url: "https://raw.githubusercontent.com/exercemus/exercises/main/exercises.json", extract: (data) => (data as { exercises?: unknown[] }).exercises ?? [], transform: exercemus },
  { name: "longhaul-strength", url: "https://raw.githubusercontent.com/longhaul-fitness/exercises/main/strength.json", transform: longhaul },
  { name: "longhaul-flexibility", url: "https://raw.githubusercontent.com/longhaul-fitness/exercises/main/flexibility.json", transform: longhaul },
];

function mergeExercise(base: Exercise, override: Partial<Exercise>): Exercise {
  return {
    ...base, ...override, name: base.name,
    aliases: unique([...base.aliases, ...(override.aliases ?? [])]),
    equipment: unique([...base.equipment, ...(override.equipment ?? [])]),
    movementPatterns: unique([...base.movementPatterns, ...(override.movementPatterns ?? [])]),
    muscles: {
      primary: unique([...base.muscles.primary, ...(override.muscles?.primary ?? [])]),
      secondary: unique([...base.muscles.secondary, ...(override.muscles?.secondary ?? [])]),
    },
    tags: unique([...base.tags, ...(override.tags ?? [])]),
  };
}

function parseOutput(argv: string[]): string {
  if (argv.length === 0) return resolve(STAGING_ROOT, "catalog-candidate.json");
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) throw new Error("usage: --output <staging-json-path>");
  return resolve(REPOSITORY_ROOT, argv[1]);
}

function assertStagingOutput(outputPath: string): void {
  const relativeOutput = relative(STAGING_ROOT, outputPath);
  if (!relativeOutput || relativeOutput.startsWith("..") || relativeOutput.includes("../")) {
    throw new Error("ingestion output must be inside scripts/catalog-normalization/staging");
  }
  if (!outputPath.endsWith(".json")) throw new Error("ingestion output must be a .json file");
}

async function fetchSource(descriptor: SourceDescriptor): Promise<Exercise[]> {
  const response = await fetch(descriptor.url);
  if (!response.ok) throw new Error(`Failed to fetch ${descriptor.url}: ${response.status}`);
  const data: unknown = await response.json();
  const raw = descriptor.extract ? descriptor.extract(data) : data;
  if (!Array.isArray(raw)) throw new Error(`source did not return an array: ${descriptor.name}`);
  return raw.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map(descriptor.transform).filter((exercise) => Boolean(exercise.id));
}

async function loadSnapshot(snapshotPath: string): Promise<Exercise[]> {
  if (!existsSync(snapshotPath)) return [];
  const entries = JSON.parse(await readFile(snapshotPath, "utf8")) as Exercise[];
  return Array.isArray(entries) ? entries : [];
}

function renderWrapper(jsonFileName: string): string {
  return `import catalog from "./${jsonFileName}";\n\nexport type ExerciseCatalogItem = {\n  id: string;\n  name: string;\n  aliases: string[];\n  equipment: string[];\n  movementPatterns: string[];\n  muscles: { primary: string[]; secondary: string[] };\n  tags: string[];\n};\n\nexport const exerciseCatalog: ExerciseCatalogItem[] = catalog;\n`;
}

export async function runIngestion(argv: string[]): Promise<{ jsonPath: string; wrapperPath: string }> {
  const jsonPath = parseOutput(argv);
  assertStagingOutput(jsonPath);
  const wrapperPath = `${jsonPath.slice(0, -".json".length)}.ts`;
  const byId = new Map<string, Exercise>();
  const curated = JSON.parse(await readFile(CURATED_PATH, "utf8")) as Array<Partial<Exercise>>;
  const deferredCurated: Array<Partial<Exercise>> = [];
  for (const entry of curated) {
    if (!entry.id) continue;
    if (entry.name) byId.set(entry.id, entry as Exercise); else deferredCurated.push(entry);
  }
  for (const descriptor of LIVE_SOURCES) {
    for (const exercise of await fetchSource(descriptor)) if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
  }
  for (const snapshotPath of SNAPSHOT_PATHS) {
    for (const exercise of await loadSnapshot(snapshotPath)) if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
  }
  for (const entry of deferredCurated) {
    if (entry.id && byId.has(entry.id)) byId.set(entry.id, mergeExercise(byId.get(entry.id)!, entry));
  }
  if (existsSync(PRO_SNAPSHOT_PATH)) {
    for (const entry of await loadSnapshot(PRO_SNAPSHOT_PATH)) {
      if (byId.has(entry.id)) byId.set(entry.id, mergeExercise(byId.get(entry.id)!, entry));
      else byId.set(entry.id, entry);
    }
  }
  const pressingPattern = /\b(press|push[-\s]?up|fly|flye|dip|bench)\b/i;
  for (const exercise of byId.values()) {
    if (!pressingPattern.test(exercise.name)) continue;
    const primaryIndex = exercise.muscles.primary.indexOf("front delts");
    if (primaryIndex === -1) continue;
    exercise.muscles.primary.splice(primaryIndex, 1);
    if (!exercise.muscles.secondary.includes("front delts")) exercise.muscles.secondary.push("front delts");
  }
  const catalog = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(catalog, null, 2)}\n`);
  await writeFile(wrapperPath, renderWrapper(jsonPath.split("/").at(-1)!));
  return { jsonPath, wrapperPath };
}

if (process.argv[1]?.endsWith("scripts/catalog-normalization/ingest.ts")) {
  void runIngestion(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
