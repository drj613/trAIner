# Phase 4: History, Overrides, and Power-User Control

## Objective

Add the long-term workflows that make the app useful beyond day-one logging: historical review, scoped program changes, replacement review, workspace exploration, and local control over data.

## Why This Phase Comes Fourth

These workflows matter a lot, but they build on strong workout rendering, logging, import, and normalized program structures. They should arrive after the core loop and import pipeline are reliable.

## Epics

### 16. Exercise history lookup in workout context

Surface recent and relevant prior sessions near the place where the user decides what to do today.

Expected outcomes:

- fast historical lookup for a given exercise
- context-aware history within workout execution screens
- preserved value of the original spreadsheet workflow

### 17. Scoped override architecture for day, week, and base replacements

Implement the layering model that allows modifications to apply at different scopes without corrupting the canonical program baseline.

Expected outcomes:

- explicit override boundaries
- predictable rendered output from layered sources
- cleaner reasoning about edits versus replacements

### 18. Modification-with-AI workflow and replacement diff review

Support the scoped modification flow where the user prepares a prompt, gets replacement JSON from an external model, and reviews the resulting changes before applying them.

Expected outcomes:

- a trustworthy modification workflow
- side-by-side or structured change review
- safer acceptance of AI-generated replacements

### 19. Program map and explorer views

Provide a wider lens on a program so users can understand structure across days, weeks, and sections without drilling through one screen at a time.

Expected outcomes:

- better navigation across complex programs
- clearer structural visibility
- a workspace feel closer to a technical editor than a single-screen form

### 20. Workspace-level export, import, and recovery controls

Give users robust control over backup and restore of their local-first workspace state.

Expected outcomes:

- explicit backup/export mechanisms
- import/restore pathways for workspace data
- better confidence in local ownership of data

## Dependencies

- Depends on Phases 2 and 3.
- Creates the product foundation for future analytics and advanced planning tools.

## Session Planning Prompts

- Where should history appear so it helps decision-making without cluttering the workout surface?
- What data should diff review emphasize for workout modifications?
- How should export and restore distinguish between programs, logs, profile data, and aliases?
