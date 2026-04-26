# Local-First Technical Roadmap

Date: 2026-04-26

## Purpose

This roadmap defines the technical backlog required to evolve `trAIner` from its current local-first v1 prototype into a durable, high-density workout workspace that matches the product direction in [trAIner_local_first_prd.md](/home/dj/code/trAIner/docs/trAIner_local_first_prd.md) and the current mockup set in [docs/mockups](/home/dj/code/trAIner/docs/mockups).

The roadmap is intentionally phase-based and epic-sized:

- each phase groups related work into a coherent delivery sequence
- each numbered item is an epic, not a ticket
- each session should begin by selecting one epic and refining it into concrete implementation tasks
- refactor work is treated as first-class backlog, not hidden cleanup

## Scope

This roadmap includes:

- user-facing app capabilities
- engineering infrastructure needed to support those capabilities
- refactors that create better extension seams for future development

This roadmap does not attempt to cover:

- hosted SaaS concerns
- multi-user workflows
- release management bureaucracy
- speculative post-v1 analytics features

## Planning Rules

1. Start each work session by choosing a single epic.
2. Expand that epic into a short implementation plan for the session.
3. If shared patterns or architecture boundaries are changing, create explicit refactor tasks within the session plan instead of burying them inside feature work.
4. Treat UI density, offline resilience, and editing speed as product requirements, not polish.
5. Avoid introducing abstractions early unless they clearly reduce repeated complexity across phases.

## Phase Overview

1. [Phase 1: Foundation Reset](./01-foundation-reset.md)
2. [Phase 2: Core Workout Workspace](./02-core-workout-workspace.md)
3. [Phase 3: Import, Prompting, and Program Shaping](./03-import-prompting-and-program-shaping.md)
4. [Phase 4: History, Overrides, and Power-User Control](./04-history-overrides-and-power-user-control.md)
5. [Phase 5: Hardening and Extension Readiness](./05-hardening-and-extension-readiness.md)

## Epic Index

1. App shell and navigation realignment
2. Workout domain model cleanup and type boundaries
3. Local storage and repository hardening
4. Shared workspace UI primitives and layout system
5. Refactor pass: separate view models from storage and import concerns
6. Today screen redesign around active workout context
7. Workout view with visible sections, groups, and dense prescription display
8. Spreadsheet-like live logging flow
9. Inline and manual editing for workout documents
10. Refactor pass: reusable editing and cell interaction patterns
11. Prompt builder overhaul around reusable blocks and personas
12. JSON import workflow and parser UX
13. Program normalization and canonical shaping pipeline
14. Exercise matching, aliasing, and resolution workflow
15. Import review, warnings, and acceptance flow
16. Exercise history lookup in workout context
17. Scoped override architecture for day, week, and base replacements
18. Modification-with-AI workflow and replacement diff review
19. Program map and explorer views
20. Workspace-level export, import, and recovery controls
21. PWA installability and offline behavior verification
22. Test strategy expansion across domain, storage, and UI-critical flows
23. Sample data, fixtures, and import corpus for regression coverage
24. Performance and density pass for mobile workout usage
25. Refactor pass: extension seams for future analytics and advanced tooling

## Session Workflow

When starting a new session:

1. Pick the next epic from the roadmap.
2. Define the smallest meaningful slice that advances that epic.
3. Note any enabling refactor work that should happen in the same slice.
4. Identify verification for the slice before implementation begins.
5. Update the roadmap or add follow-on notes if scope changes during execution.

## Backlog Shape

Each phase file contains:

- the phase objective
- the epics in that phase
- why the phase comes in this order
- dependencies and handoff notes to later phases

Each future implementation plan derived from an epic should capture:

- target user workflow
- relevant files and modules
- refactor intent, if any
- test and verification expectations
- explicit out-of-scope boundaries for the session
