import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUT_FILES } from "./core";

const COMPLETE_MANIFESTS = [
  "movements.json",
  "modifiers.json",
  "merges.json",
  "assignments.json",
  "alias-classifications.json",
  "disambiguations.json",
  "variant-rules.json",
  "reviews/variant-candidates.json",
  "reviews/variant-adversarial-review.json",
];

const EMPTY_ARTIFACT = `${JSON.stringify({ schemaVersion: 1, records: [] })}\n`;

export async function createCompilerFixtureRoot(options: { snapshotRecords: number }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "catalog-fixture-"));
  const catalogRoot = join(root, "scripts/catalog-normalization");
  const snapshot = `${JSON.stringify(
    Array.from({ length: options.snapshotRecords }, (_, index) => ({
      id: `fixture-${index}`,
      name: `Fixture ${index}`,
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
    })),
    null,
    2,
  )}\n`;
  await mkdir(join(catalogRoot, "reviews"), { recursive: true });
  await writeFile(join(catalogRoot, "catalog-v1.snapshot.json"), snapshot);
  await writeFile(
    join(catalogRoot, "catalog-v1.sha256"),
    `${createHash("sha256").update(snapshot).digest("hex")}\n`,
  );
  await Promise.all(
    COMPLETE_MANIFESTS.map((fileName) => writeFile(join(catalogRoot, fileName), EMPTY_ARTIFACT)),
  );

  const outputDir = join(root, "src/lib/catalog");
  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    OUTPUT_FILES.map((fileName) =>
      writeFile(join(outputDir, fileName), fileName === "exercises.generated.json" ? snapshot : EMPTY_ARTIFACT),
    ),
  );
  return root;
}

export async function runProcess(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(argv[0], argv.slice(1));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolveProcess({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}
