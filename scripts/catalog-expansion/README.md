# Propose catalogue additions

Search before proposing an exercise. The CLI searches all catalogue names and aliases, reviewed additions, and proposal files from other workers. It prints compact JSON lines, so workers do not need to open the generated catalogue.

```sh
bun run catalog:search search "DB incline press" "incline dumbbell bench press"
bun run catalog:search search "hip adduction" --limit 20
bun run catalog:search show cable-hip-adduction
```

A call accepts up to 20 queries and returns five hits per query by default. `--limit` accepts 1 through 100. Each result includes the corpus fingerprint, candidate count, truncation flag, and possible conflicts. Narrow a broad query or increase the limit to inspect more hits.

The checker folds abbreviations, selected synonyms, word order, and common plurals for retrieval. Character similarity retrieves spelling mistakes. Opposite terms appear as potential conflicts. A matching label is not proof of equivalent movement, and an empty result is not proof of novelty. Check alternate names and inspect related entries before proposing anything. Missing equipment and execution details remain unknown.

## Generate independently

Give each worker one file under `proposals/` and a bounded domain. A proposal file has this shape:

```json
{
  "schemaVersion": 1,
  "generator": "model-name",
  "proposals": []
}
```

Each proposal records `id`, `name`, `aliases`, `equipment`, `movementPatterns`, `muscles`, `tags`, an independently authored `description`, a `difference` from nearby entries, `comparedIds`, supporting `references`, and the `queries` used. Query names, alternative names, and the description's movement terms. Fetch references to verify that they support the distinction. Do not copy descriptions or media from other catalogues.

Write a complete temporary file ending in `.tmp`, then rename it to the worker's `.json` file. The checker ignores temporary files and includes completed proposals immediately. Workers do not edit the compiled catalogue or the approved additions manifest.

## Review and build

Review proposals across all workers and the original catalogue. For accepted entries, place the exercise metadata, comparison rationale, reviewer identity, and provenance in `scripts/catalog-normalization/additions.json`. This manifest records a review of the proposed repository change; merging the PR remains the maintainer's decision.

Review the execution, not just the closest label. Established differences in equipment, grip, body position, support, laterality, range of motion, or travel direction can define useful variants. A generic neighbouring entry does not establish that a specific variant is already covered. Cosmetic renaming, different loads or repetition counts, and invented combinations do not create new exercises. References must describe the actual movement or variation, not just the sport or body region.

When a common name describes an existing exercise, add it to `scripts/catalog-normalization/alias-additions.json`. Each record has `exerciseId`, `aliases`, `status: "approved"`, `reviewer`, `rationale`, and `references`. This preserves the original ID and appends the reviewed names. The compiler rejects cross-record collisions and records the number of aliases added. Generic names that could mean several exercises belong in the existing disambiguation manifests instead of becoming an alias for an arbitrary choice.

The compiler rejects unapproved or malformed records, duplicate IDs, unknown comparison IDs, and name or alias collisions. Its conservative token check also rejects reordered names, abbreviations, and recognized synonyms across separate exercises. Those alternative forms may remain aliases within one exercise. A rejection means the name needs review, not that the compiler has proven semantic equivalence. This guard does not replace review of new meanings or synonyms it does not know.

Proposal files are local drafts and are git-ignored. They are not approval records or exercise instructions. Only the reviewed additions manifest feeds the compiled catalogue, and each of its records keeps the reviewer, rationale, and references.

New entries are standalone unless separately curated into the movement taxonomy. The frozen vendor snapshot stays unchanged. The normalization report records the additions count and input hash, and the generated catalogue includes the accepted rows.

```sh
bun run catalog:test
bun run catalog:build
bun run catalog:check
bun run typecheck
bun run test -- --runInBand
bun run build
```

Run `catalog:build` before tests that compare the checked-in output after changing the additions manifest. The build requires no network access. Reference verification belongs to review, not the compiler.

`src/lib/catalog/routineCoverage.test.ts` checks the user's routine examples and sends every approved new name and alias through the actual runtime matcher. The generation checker finding a candidate is not sufficient proof that importing that name will resolve correctly.
