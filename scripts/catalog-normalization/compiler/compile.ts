export * from "./core";
export { buildRegistries, canonicalizeModifiers, flattenMerges, signatureFor, validateNormalizedCatalogue } from "./normalize";
export {
  loadVariantCandidates,
  TIER_1_MOVEMENT_IDS,
  validateAliasOutcomes,
  validateRegistries,
  validateVariantCandidates,
} from "./validate";
export type { VariantCandidate, VariantRule } from "./types";

import { runCompilerCli } from "./core";

if (import.meta.main) await runCompilerCli(process.argv.slice(2));
