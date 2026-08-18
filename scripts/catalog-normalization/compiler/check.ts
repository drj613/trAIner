import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileCatalog, OUTPUT_FILES } from "./core";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseCheckCli(argv: string[]): string {
  if (argv.length === 0) return process.cwd();
  if (argv.length === 2 && argv[0] === "--fixture-root" && argv[1]) return resolve(argv[1]);
  throw new Error("usage: [--fixture-root <path>]");
}

export async function runCatalogCheck(argv: string[]): Promise<void> {
  const rootDir = parseCheckCli(argv);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "catalog-check-"));
  const catalogOutputDir = join(temporaryRoot, "catalog");
  const report = await compileCatalog({
    rootDir,
    catalogOutputDir,
    reportOutputPath: join(temporaryRoot, "report.json"),
    stage: "complete",
  });

  for (const fileName of OUTPUT_FILES) {
    const [expected, generated] = await Promise.all([
      readFile(join(rootDir, "src/lib/catalog", fileName)),
      readFile(join(catalogOutputDir, fileName)),
    ]);
    if (!expected.equals(generated)) throw new Error(`catalog output differs: ${fileName}`);
    if (report.outputHashes[fileName] !== sha256(expected)) {
      throw new Error(`catalog output hash differs: ${fileName}`);
    }
  }
}

if (import.meta.main) await runCatalogCheck(process.argv.slice(2));
