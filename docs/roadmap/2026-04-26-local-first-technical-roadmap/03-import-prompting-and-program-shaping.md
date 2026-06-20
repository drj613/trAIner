# Phase 3: Import, Prompting, and Program Shaping

> **Status (2026-06): Phase 3 is COMPLETE — all five epics shipped as of 2026-05.** This roadmap is retained as the original plan; see `src/` for current implementation.

## Objective

Make the external-LLM workflow reliable from prompt construction through import, normalization, review, and acceptance into the local workspace.

## Why This Phase Comes Third

Once the workout workspace is usable, the next step is improving how routines enter and change within the system. This phase turns the app from a viewer/logger into a true local-first programming tool.

## Epics

### 11. Prompt builder overhaul around reusable blocks and personas

Evolve prompt generation into a more composable system that reuses profile context, persona guidance, output rules, and scope-specific routine context.

Expected outcomes:

- prompts assembled from intentional blocks
- better use of trainer personas
- clearer distinction between initial generation and modification prompts

### 12. JSON import workflow and parser UX

Create an import flow that handles pasted JSON, communicates parse failures clearly, and sets up the user for successful normalization.

Expected outcomes:

- strong happy path for structured imports
- actionable parse and shape errors
- better trust in the import step

### 13. Program normalization and canonical shaping pipeline

Build the canonical transformation path from imported JSON into stored program structures while preserving original source data where useful.

Expected outcomes:

- deterministic program shaping
- support for both single-day and multi-day program imports
- normalized structures ready for rendering and later overrides

### 14. Exercise matching, aliasing, and resolution workflow

Resolve imported exercises against the bundled catalog and local aliases without blocking useful imports.

Expected outcomes:

- sensible automatic matches
- durable handling of unmatched exercises
- user-driven alias learning that improves future imports

### 15. Import review, warnings, and acceptance flow

Let users review what the importer understood, where it made tradeoffs, and what still needs attention before they accept a program into the workspace.

Expected outcomes:

- warnings presented without derailing import
- confidence in accepted programs
- a clear boundary between raw import and active workspace data

## Dependencies

- Depends on Phase 1 data boundaries and storage hardening.
- Benefits from Phase 2 document-display and editing primitives.

## Session Planning Prompts

- Which parse failures should block import, and which should degrade gracefully?
- What source fields should always be preserved for traceability?
- How should unresolved exercises be represented so later manual repair is straightforward?
