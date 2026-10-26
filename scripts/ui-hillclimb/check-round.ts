import { readFile } from "node:fs/promises";
import { evaluateRound, type Round } from "./gate";

const report = process.argv[2];
if (!report) {
  console.error("Usage: bun scripts/ui-hillclimb/check-round.ts <round.json>");
  process.exit(1);
}
try {
  const result = evaluateRound(JSON.parse(await readFile(report, "utf8")) as Round);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
} catch (error) {
  console.error(`Invalid round report: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
