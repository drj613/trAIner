export * from "./core";
export { buildRegistries, canonicalizeModifiers, flattenMerges, signatureFor, validateNormalizedCatalogue } from "./normalize";
export { validateAliasOutcomes, validateRegistries } from "./validate";

import { runCompilerCli } from "./core";

if (import.meta.main) await runCompilerCli(process.argv.slice(2));
