# Local-First Workout PWA Design

Date: 2026-04-21

## Summary

This repository is being repurposed into a local-first workout PWA for a single user on a single device. The app is intended to replace a manual Google Sheets workflow while preserving the flexibility of using external LLMs to generate and modify workout routines.

The product does not make in-app AI calls. Instead, it helps the user:

1. Maintain a local profile used for prompt generation.
2. Assemble prompts that include profile context, persona guidance, and output instructions.
3. Paste prompts into an external LLM of choice.
4. Import the returned JSON back into the app.
5. Normalize and enrich the imported routine locally.
6. View, edit, override, and log workouts from a phone-friendly PWA.

The original hosted AI product concept remains valid, but it should be pulled out into a separate `trAIner/` app later. This repository should be renamed and focused entirely on the local-first tool.

## Product Goals

- Replace manual transcription from trainer notes or AI-generated routines into Sheets.
- Support a hybrid workflow where routines may come from a human trainer, the user, or an external LLM.
- Preserve enough structure and metadata to support future workout-quality analysis.
- Keep runtime fully offline after install, with no external API requests required.
- Optimize for the in-gym workflow: open phone, see today, make fast edits, log lifts.

## Non-Goals For V1

- In-app AI chat or any direct LLM API calls.
- Auth, accounts, subscriptions, payments, or hosted multi-user features.
- Cross-device sync.
- A finished workout-quality scoring algorithm.
- Multi-profile or multi-user support.

## Repo Direction

### Local-First App

This repository becomes the local-first PWA. It should be renamed to reflect that it is no longer the hosted AI product.

Responsibilities:

- Single-user profile management
- Prompt generation
- JSON import
- Routine normalization
- Exercise matching
- Scoped overrides
- Lift logging
- Manual backup/export
- Offline PWA support

### Hosted AI Product

The original all-inclusive AI product should be split into a separate directory or repository later and retain the `trAIner` name.

Responsibilities for that future app:

- Hosted runtime
- In-app AI chat
- Billing and deployment
- Multi-user concerns
- Sync and cloud storage

Shared logic between the two apps should be copied intentionally if needed, not prematurely coupled through a shared runtime core.

## Core User Model

The app is single-user and single-profile.

The main use case is one person going to the gym, seeing what they are supposed to do today, optionally making changes, and recording performance.

## Core Data Model

The app should use a hybrid canonical model:

- Rich structure is preserved in storage.
- The UI remains day-centric and simple.

### Entities

#### Profile

Stores reusable prompt-generation context, including:

- bodyweight
- training history
- goals
- injuries or medical constraints
- equipment access
- unit preferences
- user prompt preferences

The profile is separate from routines and is reused over time.

#### Program

Canonical stored routine object. A program can represent:

- a full imported multi-day or multi-week plan
- a wrapped single-day import

Each program stores:

- program metadata
- normalized days
- original import source JSON
- import warnings
- profile snapshot used at import time

The profile snapshot exists so historical routines preserve context such as injury state or equipment availability at the time they were generated.

#### Day

The primary UI unit. A program contains one or more days.

A day contains:

- title
- optional week or cycle placement
- sections
- notes
- local override relationships

#### Section

Used to preserve programming intent such as:

- warmup
- strength
- explosive
- metcon
- hypertrophy
- rehab

Sections remain visible in the UI.

#### Exercise Group

Used to preserve grouping semantics such as:

- single
- superset
- circuit
- giant set

Groups remain visible in the UI so the user knows how to perform the workout correctly.

#### Exercise

Exercise rows remain easy to edit in the UI while still carrying normalized metadata and source values.

Stored fields may include:

- raw imported name
- canonical exercise id if matched
- display name
- aliases
- sets and reps prescription
- notes
- tempo fields
- AI-provided tags
- catalog-derived metadata
- match status

#### Workout Log

Separate from the base program. Stores actual performed sets, reps, weight, notes, and other log details for a given day and date.

#### Override

Represents a scoped modification layered on top of a base program.

Allowed scopes:

- base program
- week only
- day only

The rendered workout is produced from:

`base program + applicable week overrides + applicable day overrides`

## Import Model

The importer should support two entry shapes:

1. Single-day rich JSON import
2. Full-program import containing an array of days

The canonical store remains program-shaped, but a single-day import can be wrapped into a minimal program container.

## Import And Normalization Pipeline

The normalization pipeline should:

1. Parse incoming JSON.
2. Detect whether it is a single-day or full-program shape.
3. Convert it into canonical `Program -> Days -> Sections -> Groups -> Exercises`.
4. Match exercises against the built-in catalog and user aliases.
5. Enrich matched exercises with canonical metadata.
6. Preserve original AI-provided fields where useful.
7. Mark unmatched exercises for manual review.
8. Attach suggested matches.
9. Store warnings instead of blocking import unless the JSON is structurally unusable.

Import should always succeed when the JSON is structurally parseable and mappable, even if some exercises are unknown.

## Exercise Catalog

The app ships with a built-in curated exercise catalog plus optional user aliases.

### Catalog Purpose

The catalog serves two purposes:

1. Make messy LLM output usable.
2. Provide the structured foundation for later workout analysis.

### Catalog Data

Each canonical exercise entry should support:

- canonical id
- display name
- aliases
- equipment
- movement pattern
- primary muscles
- secondary muscles
- optional modifiers or tags
- optional default tempo hints

### Matching Strategy

Matching should use:

1. Exact canonical or alias matches
2. Normalized-name matches
3. Suggested fuzzy matches for manual review

If no match is found:

- preserve the exercise exactly as imported
- flag it as unmatched
- let the user resolve it later

Approved user fixes should become local aliases for future imports.

### Catalog Sourcing

The exercise catalog should not be built manually from zero. A third-party exercise dataset should be imported during development, massaged into the app's internal format, and then bundled with the shipped app.

This ingestion and cleanup happens during development only. The user device makes no external requests to build or update the catalog in v1.

Implementation note, 2026-04-24: the bundled catalog is generated from `yuhonas/free-exercise-db`'s combined `dist/exercises.json` file, then merged with local aliases and additions in `scripts/catalog-local-overrides.json`. Generated catalog data lives in `src/lib/catalog/exercises.generated.json`, with `src/lib/catalog/exercises.ts` kept as a typed wrapper. Media and rich instruction payloads are omitted from the client bundle.

## Prompt Generation

Prompt generation uses the saved profile plus selectable persona guidance and output instructions.

The app generates prompts for external LLMs only.

Prompt categories include:

- initial routine generation
- routine refinement
- scoped modification prompts for day, week, or full program replacement

Generated prompts should include:

- user profile context
- relevant constraints or injuries
- selected persona guidance
- scope instructions
- the relevant current routine JSON when modifying
- instructions to return a full replacement for the selected scope

## External LLM Modification Model

When the user wants an AI-assisted change, the app does not call an API directly. It generates a prompt for an external LLM and expects a full replacement for the requested scope.

Supported scopes:

- replacement day
- replacement week
- replacement program

Patch-style LLM output is explicitly not the primary model because it is less reliable than full replacement.

The app should show a review step before applying the replacement:

- old vs new summary
- changed exercises, sections, groups, sets, or notes
- unmatched exercise warnings
- apply destination: base program, week only, or day only

## Editing Model

The day view is the main editing surface.

The UI should remain simple and spreadsheet-like for common edits, especially:

- exercise name
- sets
- reps
- notes
- optional tempo values

At the same time, the UI must preserve and visibly communicate section and group semantics so the user can understand workout flow.

Examples:

- supersets must clearly show which exercises are paired
- circuits must clearly show exercises are performed back-to-back
- metcon blocks must preserve their grouping and notes
- warmups should remain visually distinct from main lifts

### Edit Scopes

Whenever the user saves an edit, the app should require an explicit scope choice:

- Base program
- This week only
- This day only

This prevents silent mutation and supports both permanent edits and temporary adjustments such as hotel gym substitutions or injury-based day modifications.

## Analyzer Foundation

The workout analyzer is not a v1 feature in full, but the data model should support it from day one.

The app should preserve the inputs that will matter later, including:

- section intent
- group semantics
- exercise classification
- profile snapshot
- override history
- workout logs
- match confidence and unresolved exercises
- AI-provided tags
- catalog-derived metadata

The analyzer should be deferred as a later algorithmic layer built on top of this preserved structure.

## Storage Model

The app is single-device, local-first for v1.

Runtime should remain fully contained:

- bundled app
- bundled exercise catalog
- local profile data
- local programs
- local overrides
- local logs
- local alias mappings

Backup and restore are manual via export/import.

Cross-device sync is deferred.

## PWA Expectations

The app should be installable as a PWA and usable offline once saved to the device.

The main runtime priority is a phone-friendly, low-friction day workflow:

1. open app
2. see active program or today's workout
3. understand section and grouping structure
4. make quick edits if necessary
5. log lifts fast

Prompt generation, import review, exercise cleanup, and backup/export remain important, but must not obstruct the gym-floor workflow.

## Suggested V1 Scope

### Include

- single saved profile
- prompt builder using profile, personas, and output instructions
- single-day import
- full-program import
- canonical normalization pipeline
- built-in exercise catalog
- user aliases
- manual review for unmatched exercises
- day-centric workout UI
- visible sections and grouping semantics
- scoped overrides for base, week, and day
- external-LLM modification prompt generation
- workout logging
- local manual backup/export
- fully offline-capable PWA runtime after install

### Defer

- in-app AI calls
- sync between devices
- auth and hosting
- billing and subscriptions
- multi-user support
- completed workout-quality scoring algorithm
- runtime dependency on external exercise APIs

## Migration Notes From Current Repo

The current codebase already contains parts of the desired local-first flow, but still includes remnants of the original hosted AI product.

Expected cleanup during planning and implementation:

- rename `documentation/` to `docs/` and consolidate product/design docs there
- rename this repository and product identity
- remove or isolate legacy hosted-AI scaffolding
- move future hosted AI product work into a separate `trAIner/` directory or repository
- align current routine schema and UI with the new canonical hybrid model
- replace any stale docs or tooling references that still point to removed systems

## Open Implementation Questions

These are intentionally left as planning questions, not design blockers:

- final app name for the renamed local-first product
- exact internal schema fields for program, day, section, group, exercise, and override records
- local persistence choice for bundled data plus mutable data
- exact source dataset for the initial exercise catalog
- import review UX details
- diff presentation UX for AI-assisted replacements
- exact prompt templates and persona packaging
