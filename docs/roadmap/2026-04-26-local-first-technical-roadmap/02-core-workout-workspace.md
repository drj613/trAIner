# Phase 2: Core Workout Workspace

> **Status (2026-06): Phase 2 is COMPLETE — all five epics shipped as of 2026-05.** This roadmap is retained as the original plan; see `src/` for current implementation.

## Objective

Deliver the central user experience: opening the app, understanding today's workout instantly, making quick edits, and logging performance faster than a spreadsheet on a phone.

## Why This Phase Comes Second

This is the product's core loop. Once the foundation is sturdy, the next highest-leverage work is making the daily workout workflow truly excellent before moving into advanced import and power-user tooling.

## Epics

### 6. Today screen redesign around active workout context

Rebuild the landing surface so it prioritizes the active day, recent context, and the next likely action.

Expected outcomes:

- better first-load clarity
- less navigation friction before training
- stronger active-program and active-day affordances

### 7. Workout view with visible sections, groups, and dense prescription display

Present the workout as a structured, high-density document that preserves programming intent such as warmups, supersets, and circuits.

Expected outcomes:

- sections remain visible while scrolling
- grouping semantics are obvious
- prescriptions are scannable without opening extra panels

### 8. Spreadsheet-like live logging flow

Replace simplistic logging inputs with a faster, more flexible live logging model centered on freeform set-entry cells.

Expected outcomes:

- freeform set strings
- add/remove cells without friction
- faster between-set entry on mobile

### 9. Inline and manual editing for workout documents

Support direct edits to exercise names, prescriptions, notes, ordering, and group composition without forcing users into heavyweight modals for common changes.

Expected outcomes:

- lightweight inline editing by default
- deliberate escalation paths for more complex edits
- better parity with spreadsheet flexibility

### 10. Refactor pass: reusable editing and cell interaction patterns

Consolidate repeated interaction logic for editable cells, row controls, focus movement, and dense workspace editing states.

Expected outcomes:

- consistent editing interactions across screens
- lower complexity for future override and diff tools
- better testability of high-friction UI behavior

## Dependencies

- Depends on Phase 1 shell, UI primitive, and data-boundary work.
- Enables later history overlays and override application workflows.

## Session Planning Prompts

- What interaction model makes freeform logging fastest on a phone?
- Which edits should remain inline and which deserve a focused editor?
- What cell and row primitives need to be reusable across workout, history, and diff views?
