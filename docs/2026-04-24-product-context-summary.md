# Product Context Summary

Date: 2026-04-24

## Why This Reset Is Happening

The previous codebase was a half-finished app that started life as a broader hosted AI fitness product and later pivoted into a local-first personal tool. At this point, migrating the partially-built app forward is more expensive than restarting with a clean architecture and Bun-based tooling.

The purpose of this document is to preserve the product context and decisions that came out of the design discussion so the application can be rebuilt from zero without losing the important thinking.

## The Original Product Idea

The original `trAIner` concept was a larger all-inclusive AI product:

- in-app AI chat
- hosted runtime
- user accounts
- billing and subscriptions
- multi-user concerns
- cloud sync
- trainer-style personas and routine generation inside the product

That idea still has merit, but it drags in operational complexity:

- deployment and hosting
- payments
- cloud storage
- maintenance burden
- startup-style product obligations

That complexity got in the way of having something useful for personal day-to-day training.

## The Actual Problem To Solve Now

The immediate problem is much simpler and more pragmatic.

The user historically:

- created routines manually in Google Sheets
- transcribed trainer-written routines into Sheets
- later started using AI to create routines
- got tired of manually transcribing AI output into a loggable format

The new goal is to take that hybrid manual-plus-AI workflow one step further without becoming a hosted startup.

## The New Product Direction

This repository should become a local-first workout PWA for a single user on a single device.

The app is not an AI runtime. It is a personal tool that:

1. stores the user's profile locally
2. generates prompts for external LLMs
3. accepts routine JSON pasted back from those LLMs
4. translates that JSON into a workout UI
5. supports routine edits and overrides
6. stores everything locally
7. works offline once installed

The app should feel like a smarter, phone-friendly replacement for a Google Sheets workout workflow.

## High-Level Workflow

The intended user loop is:

1. Open the app from a phone as a PWA.
2. Use a saved profile and persona selection to build a prompt.
3. Copy the prompt into ChatGPT, Claude, or another LLM of choice.
4. Refine the routine through conversation in that external tool.
5. Ask the LLM for structured JSON in the app's expected format.
6. Copy and paste that JSON back into the app.
7. Let the app normalize and enrich the routine locally.
8. Use the app in the gym to see today's workout, make adjustments, and log lifts.

## Hard Product Rules

These are core decisions, not tentative preferences.

- No in-app AI calls.
- No external API requests required for normal runtime use.
- Single-user and single-profile.
- Single-device local-first for v1.
- Manual export/import backup for v1.
- Fully-contained PWA that can be used entirely offline once saved.

## Product Split

The product direction now assumes two separate apps.

### This Repository

This repo becomes the local-first PWA and should be renamed.

Its responsibilities:

- local profile management
- prompt generation
- routine import
- normalization
- exercise matching
- override handling
- workout logging
- local export/import backup
- offline PWA support

### Future Hosted Product

The original hosted AI product should be pulled into its own separate directory or repository later and keep the `trAIner` identity.

Its responsibilities would include:

- hosted runtime
- in-app AI
- billing
- auth
- cloud sync
- multi-user concerns

The local-first app should not stay coupled to those runtime assumptions.

## Core Use Case

This app is for one person going to the gym who wants:

- to know what they are doing today
- to make fast changes when circumstances change
- to record actual lift performance

The "standing in the gym with a phone" use case is the primary one. The UX should optimize for that above everything else.

## Profile Model

Profile data lives separately from routines and feeds prompt generation.

Examples of profile fields:

- bodyweight
- training history or training age
- goals
- current injuries or limitations
- medical issues worth accounting for
- equipment access
- unit preferences
- prompt-generation preferences

Routines should also store a snapshot of the relevant profile context at generation/import time.

This matters because old routines need historical context. Example:

- a routine was created while the user had a shoulder issue
- later the user looks back at that routine
- the injury context should still be visible

## Routine And Program Shape

The chosen direction is a hybrid canonical model:

- the UI stays simple and day-centric
- the stored data preserves richer structure

The app should internally store a full program-shaped model, but the user mostly interacts with it as days/workouts.

The model should support both:

- single-day imports
- full-program imports

Recommended canonical hierarchy:

- Program
- Days
- Sections
- Exercise Groups
- Exercises

This preserves richer programming semantics without forcing the UI to become overly complex.

## Why Rich Structure Matters

The app should not flatten away important training semantics.

Examples that should remain first-class:

- warmup blocks
- strength blocks
- explosive blocks
- hypertrophy blocks
- metcon blocks
- supersets
- circuits
- other grouped exercise relationships

The workout UI should remain simple, but these structures must stay visible and understandable. Example:

- if two exercises are a superset, the user needs to see that they are supposed to be done back-to-back
- if something is a circuit, the grouping and notes need to remain obvious

## Import Philosophy

Import must be permissive.

Unknown or messy data should not block the user unless the JSON is structurally unusable.

That means:

- parse the JSON
- detect whether it is a single day or a full program
- normalize it into the canonical internal model
- preserve the original imported JSON
- attach warnings when needed
- import should still succeed even if exercise matching is imperfect

The app should accept both:

- single workout/day JSON
- full program JSON containing multiple days

Single-day import should be wrapped into a minimal program container internally.

## Editing And Override Philosophy

Routine changes are a core workflow, not an edge case.

The user specifically wants the ability to:

- permanently update the base routine
- temporarily modify only the current week
- temporarily modify only the current day

Examples:

- sore shoulder today, so a bench-focused day needs safer substitutions and rehab work
- out of town for a work conference during week 3, so that week needs hotel-gym adjustments
- a trainer permanently replaces one movement going forward

The UI should require an explicit scope choice for edits:

- base program
- this week only
- this day only

Under the hood, the app should preserve the base routine and apply overrides as layers rather than mutating everything blindly.

## External LLM Modification Flow

When the user wants AI-assisted changes, the app should generate a prompt for an external LLM.

That prompt should include:

- current profile or profile snapshot context
- the relevant current JSON for the chosen scope
- the user's requested change
- instructions to return a full replacement for that scope

The app should prefer full replacement over patch-style output.

Why:

- LLMs are more reliable at regenerating a coherent whole than emitting precise structural patches
- patch-like output tends to be brittle and highly dependent on exact IDs and paths

Expected scopes:

- replacement day
- replacement week
- replacement program

After paste-back, the app should show a review step before applying the change.

## Exercise Catalog

The app should ship with a built-in curated exercise catalog plus optional user aliases.

This catalog is important for two reasons:

1. It makes messy LLM output usable.
2. It creates the foundation for later workout analysis.

The catalog should support:

- canonical exercise ids
- display names
- aliases
- movement patterns
- primary muscles
- secondary muscles
- equipment
- optional default tempo guidance
- useful tags or modifiers

## Matching Strategy

Exercise matching should be permissive and layered.

Suggested strategy:

1. exact canonical match
2. exact alias match
3. normalized name match
4. fuzzy suggestions for manual review

If an exercise is not matched:

- import still succeeds
- the raw exercise is preserved
- the item is flagged for review
- the UI can suggest likely catalog matches

User-approved fixes should become local aliases for future imports.

## Catalog Sourcing

The exercise library should not start from zero.

The preferred direction is:

- find an existing exercise dataset
- import it during development
- massage it into the app's internal format
- ship it as bundled static data

Important constraint:

- all catalog ingestion and cleanup happens during development
- not at runtime
- no external requests from the user's device to build or resolve the catalog

The shipped app should contain the catalog already in the right shape.

## Metadata And Future Workout Analysis

The app is not trying to ship a fully-realized workout-quality algorithm in v1, but it should preserve the right inputs from day one.

The rationale is that richer structured data creates the "golden thread" needed to build an analyzer later.

The app should preserve:

- section intent
- exercise-group semantics
- AI-provided tags
- catalog-derived metadata
- profile snapshot
- override history
- workout logs
- unresolved or low-confidence exercise matches

This gives the future analyzer enough signal to reason about:

- muscle-group distribution
- movement-pattern balance
- exercise redundancy
- conditioning vs strength vs hypertrophy emphasis
- quality relative to the user's goals and constraints

## Storage Direction

V1 storage direction is:

- single-device local-first
- manual export/import backup
- no sync required

Runtime data should remain fully local and self-contained.

Suggested local stores:

- one saved profile
- stored programs
- stored overrides
- workout logs
- user aliases
- bundled read-only exercise catalog

Sync can be deferred to a later phase if the product proves itself.

## PWA Direction

The app should be installable as a PWA and work offline once saved on the device.

The key gym-floor flow should be:

1. open app
2. see active program or today's workout
3. understand the section and grouping structure immediately
4. make quick edits if needed
5. log numbers fast

Everything else is secondary to that.

## V1 Scope

What should be in v1:

- single saved profile
- prompt builder using profile plus persona guidance
- import for single-day JSON
- import for full-program JSON
- canonical normalization pipeline
- bundled exercise catalog
- user alias support
- unmatched exercise review with suggestions
- day-centric workout UI
- visible sections and group semantics
- scoped overrides for base, week, and day
- external-LLM modification prompt generation
- workout logging
- local manual backup/export
- offline-capable PWA runtime

What should be explicitly deferred:

- in-app AI calls
- auth
- billing
- hosting
- cloud sync
- multi-user support
- fully realized workout analyzer algorithm

## Documentation And Structure Notes

The repo had a `documentation/` folder, but that naming is disliked and should be turned into `docs/`.

This summary, future specs, and the rebuild plan should live under `docs/`.

## Technical Reset Direction

The app was moved into WSL and is being reset deliberately rather than migrated incrementally.

The stated preference is to:

- largely start from zero
- use Bun for everything
- keep the valuable context from the earlier discussion
- rebuild cleanly instead of dragging forward half-finished code

That reset is intentional, not accidental. The goal is not to preserve old implementation details. The goal is to preserve the right product and architecture decisions while discarding the awkward partially-built app.

## Recommended Rebuild Mindset

When rebuilding, prioritize:

- clear local-first boundaries
- small clean data model decisions
- day-centric UX
- offline-ready architecture
- permissive imports
- explicit override scopes
- exercise catalog seeding during development
- preserving rich structure without overcomplicating the UI

Avoid:

- reintroducing hidden hosted assumptions
- adding runtime AI dependencies
- building analyzer logic too early
- turning the workout UI into a raw JSON editor
- forcing the user through heavy flows when they just need today's workout

## Most Important Product Sentence

This app is a local-first PWA that helps a single user turn routines from human trainers or external LLMs into structured, editable, loggable workouts that work offline on a phone.
