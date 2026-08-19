export * from "./core";
export { buildRegistries, canonicalizeModifiers, flattenMerges, signatureFor, validateNormalizedCatalogue } from "./normalize";
export {
  loadVariantCandidates,
  loadVariantReviews,
  TIER_1_MOVEMENT_IDS,
  idForSignature,
  joinCandidateReviews,
  materializeVariant,
  validateAliasOutcomes,
  validateRegistries,
  validateVariantRule,
  validateVariantCandidates,
} from "./validate";
export type {
  VariantCandidate,
  VariantReviewArtifact,
  VariantReviewDecision,
  VariantRule,
} from "./types";

import { runCompilerCli } from "./core";

if (import.meta.main) await runCompilerCli(process.argv.slice(2));
