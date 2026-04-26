# Phase 1: Foundation Reset

## Objective

Reshape the current prototype into a maintainable technical base for the local-first workout workspace. This phase reduces architectural drag before deeper feature work compounds it.

## Why This Phase Comes First

The current app already has key routes and local data behavior, but several flows still read like scaffolding. Before investing in richer import, editing, logging, and history workflows, the shared shell, data boundaries, and local persistence patterns should be stable enough to extend without repeated rewrites.

## Epics

### 1. App shell and navigation realignment

Align the app shell with the workspace model shown in the approved mockups and PRD. Navigation should reflect the product's actual primary surfaces rather than a prototype route list.

Expected outcomes:

- clearer top-level workspace structure
- navigation that supports mobile-first workout use and desktop workspace use
- a shell that can host power-user panels and future workspace views

### 2. Workout domain model cleanup and type boundaries

Audit and tighten the canonical program, day, section, group, exercise, log, and override types so later phases build on explicit invariants instead of ad hoc assumptions.

Expected outcomes:

- clearer boundaries between canonical domain objects and UI convenience shapes
- fewer ambiguities around imported versus normalized data
- a safer base for overrides, diffing, and history lookup

### 3. Local storage and repository hardening

Strengthen local repositories and persistence flows so programs, logs, profile state, and future workspace metadata are stored consistently and recover predictably.

Expected outcomes:

- more reliable repository interfaces
- better failure handling for malformed or missing local data
- storage patterns ready for backups, imports, and migration logic

### 4. Shared workspace UI primitives and layout system

Create reusable technical-workspace UI primitives that reflect the density and visual hierarchy in the mockups without cloning styles across screens.

Expected outcomes:

- a coherent layout vocabulary for panels, grids, headers, chips, and data rows
- easier implementation of later workout and import screens
- fewer one-off view-level styling decisions

### 5. Refactor pass: separate view models from storage and import concerns

Introduce cleaner transformation seams between persisted data, derived display state, and UI-specific interaction models.

Expected outcomes:

- less coupling between React components and raw storage shapes
- easier testing of presentation logic
- better extensibility for history, diff review, and editing workflows

## Dependencies

- This phase should be completed before major investment in the logging, import, and override systems.

## Session Planning Prompts

- Which existing files are acting as both storage adapters and view-model builders?
- What shared UI primitives would reduce duplication across today's view, program detail, prompt builder, and future import flows?
- What type ambiguities are most likely to create churn in later phases?
