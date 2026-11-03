/** @jest-environment node */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSearchCli } from "./io";

test("CLI searches catalogue and separate worker proposals in one compact response", async () => {
  const root = await mkdtemp(join(tmpdir(), "expansion-search-"));
  await mkdir(join(root, "src/lib/catalog"), { recursive: true });
  await mkdir(join(root, "scripts/catalog-expansion/proposals"), { recursive: true });
  const row = { id: "row", name: "Cable Row", aliases: [], equipment: ["cable"] };
  await writeFile(join(root, "src/lib/catalog/exercises.generated.json"), JSON.stringify([row]));
  await writeFile(join(root, "scripts/catalog-expansion/proposals/luna.json"), JSON.stringify({
    schemaVersion: 1, generator: "luna", proposals: [{ ...row, id: "kneeling-row", name: "Kneeling Cable Row" }],
  }));
  const lines = await runSearchCli(["search", "kneeling cable row", "--limit", "2"], root);
  const result = JSON.parse(lines[0]);
  expect(result.hits[0].id).toBe("proposal:luna:kneeling-row");
  expect(result.hits).toHaveLength(2);
  const shown = JSON.parse((await runSearchCli(["show", "row"], root))[0]);
  expect(shown.name).toBe("Cable Row");
  await expect(runSearchCli(["show", "missing"], root)).rejects.toThrow("Unknown");
  await expect(runSearchCli(["search", "row", "--limit", "oops"], root)).rejects.toThrow("limit");
  await writeFile(join(root, "scripts/catalog-expansion/proposals/broken.json"), "{}");
  await expect(runSearchCli(["search", "row"], root)).rejects.toThrow("proposal");
});
