# Phase 5: Hardening and Extension Readiness

## Objective

Make the app trustworthy in real use and structurally ready for future capabilities without prematurely implementing those future capabilities now.

## Why This Phase Comes Fifth

By this point, the main product model should exist. Hardening can then target real workflows rather than hypothetical ones, and refactors can be guided by actual pressure points discovered in earlier phases.

## Epics

### 21. PWA installability and offline behavior verification

Audit installability, caching behavior, and offline survivability so the product behaves like a true local-first tool after installation.

Expected outcomes:

- reliable install experience
- verified offline startup and usage
- fewer surprises around cached assets and local state

### 22. Test strategy expansion across domain, storage, and UI-critical flows

Expand coverage around the parts of the system most likely to regress as the product gets denser and more stateful.

Expected outcomes:

- better domain-level confidence
- repository and storage regression checks
- focused coverage for risky interaction flows

### 23. Sample data, fixtures, and import corpus for regression coverage

Create reusable datasets that reflect realistic workout structures, edge-case imports, and tricky exercise-matching scenarios.

Expected outcomes:

- easier regression testing
- better reproducibility for bug reports
- stronger safety net for future refactors

### 24. Performance and density pass for mobile workout usage

Tune the live workout experience for real-world mobile constraints such as narrow screens, one-handed use, and repeated edits during training.

Expected outcomes:

- reduced input friction
- improved rendering and interaction responsiveness
- better information density without losing readability

### 25. Refactor pass: extension seams for future analytics and advanced tooling

Create deliberate seams for later analytics, derived metrics, and richer training insights without building those features prematurely.

Expected outcomes:

- clearer interfaces for future derived-data systems
- less need for invasive rewrites later
- better separation between event capture, canonical state, and future analysis layers

## Dependencies

- Depends on the main product flows existing in earlier phases.

## Session Planning Prompts

- Which current workflows are most fragile under offline or mobile conditions?
- What fixtures are missing for meaningful regression confidence?
- Which parts of the app are likely future extension points and should be isolated now?
