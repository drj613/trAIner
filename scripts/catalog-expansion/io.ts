import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { searchCatalogue, type SearchExercise } from "./search";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeRow(value: unknown, context: string): SearchExercise {
  if (!object(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
      !value.id.trim() || !value.name.trim() || !Array.isArray(value.aliases) ||
      !value.aliases.every((v) => typeof v === "string") || !Array.isArray(value.equipment) ||
      !value.equipment.every((v) => typeof v === "string") ||
      (value.description !== undefined && typeof value.description !== "string")) {
    throw new Error(`Invalid ${context} exercise`);
  }
  return { id: value.id, name: value.name, aliases: value.aliases, equipment: value.equipment,
    ...(typeof value.description === "string" ? { description: value.description } : {}) };
}

async function optionalJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (object(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function loadSearchCatalogue(root: string): Promise<SearchExercise[]> {
  const catalogue: unknown = JSON.parse(await readFile(join(root, "src/lib/catalog/exercises.generated.json"), "utf8"));
  if (!Array.isArray(catalogue)) throw new Error("Invalid catalogue array");
  const rows = catalogue.map((row) => decodeRow(row, "catalogue"));
  const additions = await optionalJson(join(root, "scripts/catalog-normalization/additions.json"));
  if (additions !== undefined) {
    if (!object(additions) || additions.schemaVersion !== 1 || !Array.isArray(additions.records)) throw new Error("Invalid additions manifest");
    for (const record of additions.records) {
      if (!object(record)) throw new Error("Invalid addition");
      const row = decodeRow(record.exercise, "addition");
      if (!rows.some((existing) => existing.id === row.id)) rows.push(row);
    }
  }
  const directory = join(root, "scripts/catalog-expansion/proposals");
  let files: string[] = [];
  try { files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    if (!(object(error) && error.code === "ENOENT")) throw error;
  }
  for (const file of files) {
    const input = await optionalJson(join(directory, file));
    if (!object(input) || input.schemaVersion !== 1 || typeof input.generator !== "string" || !Array.isArray(input.proposals)) {
      throw new Error(`Invalid proposal file: ${file}`);
    }
    for (const proposal of input.proposals) {
      const row = decodeRow(proposal, "proposal");
      rows.push({ ...row, id: `proposal:${input.generator}:${row.id}` });
    }
  }
  return rows;
}

export async function runSearchCli(argv: string[], root: string): Promise<string[]> {
  const [command, ...args] = argv;
  if (command !== "search" && command !== "show") throw new Error("Usage: search <query...> [--limit 1..100] | show <id>");
  const limitAt = args.indexOf("--limit");
  let limit = 5;
  if (limitAt !== -1) {
    if (limitAt !== args.length - 2) throw new Error("--limit must be last, followed by a number");
    limit = Number(args[limitAt + 1]);
    args.splice(limitAt, 2);
  }
  const rows = await loadSearchCatalogue(root);
  if (command === "show") {
    if (args.length !== 1 || limitAt !== -1) throw new Error("Usage: show <id>");
    const row = rows.find((row) => row.id === args[0]);
    if (!row) throw new Error(`Unknown catalogue ID: ${args[0]}`);
    return [JSON.stringify(row)];
  }
  return searchCatalogue(rows, args, limit).map((result) => JSON.stringify(result));
}
