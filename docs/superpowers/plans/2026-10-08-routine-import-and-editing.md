# Routine import and editing implementation plan

Implement the scope confirmed in the grilling interview: visible validation and safe defaults, structured import editing, consistent edits across recurring workouts, and shorter generation prompts that preserve optional coach personas.

This document plans implementation. No feature work is included in the planning commit.

Track implementation in [GitHub issue #8](https://github.com/drj613/trAIner/issues/8).

## Confirmed behavior

| Area | Required behavior |
| --- | --- |
| Validation | Normalize usable input, apply safe defaults to unusable values, and show every correction. Warn about unequal superset set counts. Allow saving with these warnings. |
| Import editor | Edit exercises, sets and reps, grouping, and workout-slot order. Start with the repeating template, expose week-specific differences, and preview the expanded program. Keep raw JSON accessible. |
| Scope | Offer this occurrence or every occurrence of the same recurring workout. After training starts, the repeated option targets the current uncompleted occurrence and later uncompleted occurrences. |
| Exceptions | Apply only edited fields. Preserve deliberate progression, deloads, and exercise substitutions by default. Show affected and skipped occurrences. Allow explicit selection of exceptions. |
| Identity | Identify the recurring workout independently of its title, ordinal day number, or position. Reordering a workout preserves its identity. |
| Prompt | Keep a precise output contract and athlete preferences. Make detailed coaching rules optional. Preserve persona selection, edited persona text, and presets. Request a repeating template with sparse weekly changes. |
| Length | Ask models to generate at most eight weeks. Do not introduce a longer-program toggle, import restriction, or import warning based solely on exceeding eight weeks. |
| Density training | Defer overlapping exercise queues to a separate exploration. Keep the existing group types. |

The user continues copying a plaintext prompt into an external chat and pasting JSON back. Do not add model integrations.

## Repository baseline

Ground this plan in commit `f30865b`, after updating the clean checkout from `aea0e2b`. Recheck these paths when implementation starts.

- [ImportClient](../../../src/components/import/ImportClient.tsx) implements paste, exercise resolution, and confirmation. Confirmation shows counts, without a structured routine editor or general warning list.
- [parser](../../../src/lib/import/parser.ts) expands a base template into stored weekly occurrences. Exercise variants get new exercise IDs, then lose their variant metadata. Structural diagnostics already exist, but several corrections are silent.
- [resolution](../../../src/lib/import/resolution.ts) groups unmatched and underspecified names. Preserve specific-version choices, custom exercises, local-only resolutions, opt-in remembered aliases, conflict notices, and repeat-save behavior.
- [overrides](../../../src/lib/programs/overrides.ts) applies full replacement days, with day overrides taking precedence over week overrides. `dedupOverrides` removes the previous override for an entire numbered week.
- [DiffPage](../../../src/components/workout/DiffPage.tsx) labels an AI edit as "Entire week" while replacing only one day inside that week. It can discard other replacements in the same week.
- [programDiff](../../../src/lib/workout/programDiff.ts) compares exercise fields, but does not report grouping or section structure changes. AI identity remapping currently relies on names.
- [WorkoutDayClient](../../../src/components/workout/WorkoutDayClient.tsx) saves manual exercise patches as one full-day override. It also coordinates session hydration and autosave.
- [RoutineBuilderClient](../../../src/components/workout/RoutineBuilderClient.tsx) has useful exercise-picker and day-order patterns. Its local draft model drops fields needed by imports, so do not convert imported programs through `draftToProgram`.
- [builder](../../../src/lib/prompts/builder.ts) combines output schema, conversational sequence, audits, numerical training rules, progression, and deload requirements. `buildSchemaBlock()` currently emits 12,605 characters before profile or persona text.
- [PromptBuilderClient](../../../src/components/prompts/PromptBuilderClient.tsx) allows zero, one, or several editable personas. The default is `rp`. Preserve this behavior.

Reproduce the prompt baseline with:

```bash
bun --eval 'import { buildSchemaBlock } from "./src/lib/prompts/builder.ts"; console.log(buildSchemaBlock().length);'
```

Use Bun to invoke the repository scripts. `bun run test` invokes Jest. Do not substitute Bun's native test runner.

## Implementation boundaries

### Separate routine lineage from exercise catalog identity

Retain `ProgramDocument.days` and existing overrides as the rendering contract. Add optional, versioned editing metadata to `ProgramDocument`. Do not replace the logging or storage models wholesale.

Define `ProgramEditingMetadata` in a new `src/lib/programs/editTypes.ts`, referenced by an optional `ProgramDocument.editing` field. Include:

- Normalized base-template days, with stable template day, section, group, and exercise IDs. Keep parser-only `variants` carriers out of stored `ProgramExercise` objects.
- Bindings from each occurrence day ID to its template day ID, and from occurrence elements to template elements. Exercise bindings are scoped by occurrence day because existing base exercise IDs repeat across weeks.
- Field-level exception records and structural exception records. Store the reason and originating week or occurrence. Values remain in the existing expanded days and override replacements.

Capture variant fields before expansion strips them. For complete week replacements, bind only unique, clear matches and compare fields with the base template. A complete serialized replacement does not make every unchanged field an exception. Treat unmatched topology or alternate exercises as structural exceptions.

`canonicalExerciseId` identifies a catalog exercise, not a position in a routine. Never use it alone as lineage: a workout can prescribe the same exercise twice.

For older programs, derive metadata lazily without replacing existing IDs. Use stored import source only to recover clear relationships, not to regenerate the saved routine. Leave ambiguous relationships unbound and expose them in the edit preview. Single-occurrence editing remains available.

Optional document fields need no new IndexedDB store or index. Verify repository writes, backup restore, identity transforms, and duplication preserve them. Do not require older programs to have metadata.

### Normalize once, diagnose after edits

Add `src/lib/programs/validation.ts` for shared prescription normalization and deterministic checks. Keep JSON syntax handling and catalog resolution in their existing modules.

Extend `ImportWarning` with optional typed fields for diagnostic code, correction details, stable target IDs, and affected weeks. Preserve existing `path`, `rawName`, `resolutionKind`, and catalog suggestions for compatibility. Structural diagnostics must not enter the exercise-resolution queue.

Use these rules:

| Input | Normalized result and diagnostic |
| --- | --- |
| Positive integer sets | Preserve. |
| Numeric string such as `"4"` | Convert to `4`; show the correction. |
| Missing, non-finite, fractional, zero, or negative sets | Use `3`, the existing logging default; show original value or absence and replacement. Do not round fractions. |
| Missing required names or unsupported types | Use the existing compatible fallback and identify it in the review. Preserve the original input. |
| Valid rep strings | Preserve ranges, duration prescriptions, and text such as `AMRAP`. Do not invent numeric-only rep validation. |
| Numeric reps | Convert to text and show the correction. |
| Unequal effective sets in a superset | Warn with exercise names, counts, and affected occurrences. Do not equalize counts or dissolve the group automatically. |
| Invalid JSON, non-object root, or no recoverable days | Keep the existing recovery flow. A structured editor cannot operate without a recoverable routine. |

Check base prescriptions, active exercise variants, and rendered override days. A superset that is valid in the template may become invalid in one week. Compare effective counts after applying defaults.

Never silently discard exercises, groups, or unsupported source content. If an entry cannot be represented, show its location and preserve it in the original JSON for manual repair. Distinguish correction history from current warnings: repairing a superset removes its current mismatch warning without erasing the earlier correction record.

### Preview edits before saving

Add pure operations in `src/lib/programs/edits.ts` and persistence coordination in `src/lib/programs/applyEdit.ts`.

Use an explicit `ProgramEdit` union for exercise-field edits, exercise replacement, grouping changes, and day reordering. Distinguish an omitted field from an explicit clear. Represent structural edits with stable element IDs and ordered membership, not array-index patches.

Expose these operations:

```ts
normalizePrescription(input, target): NormalizedPrescription
validateProgram(program): ProgramDiagnostic[]
createImportDraft(review): ImportDraft
previewProgramEdit(program, edit, context): ProgramEditPreview
applyProgramEdit(program, preview): ProgramDocument
```

Define validation types in Task 1, metadata types in Task 2, edit types in Task 3, and draft types in Task 5. `ProgramEditPreview` carries the proposed document, per-occurrence field changes, preserved exceptions, unmapped targets, validation results, and the source revision. The apply operation must produce exactly the document previewed.

Use UI scope values `occurrence` and `routine-day`. Keep stored override scopes `day` and `week` compatible. Do not reinterpret existing saved week overrides as recurring edits.

For a repeated edit:

1. Resolve the source recurring workout through metadata, not its current title or day number.
2. Select eligible occurrences in routine order. At import all are eligible. After training starts, exclude earlier occurrences and completed or skipped occurrences in the relevant pass. Use the same completed-log counts and current-pass definition as `resolveNextDay`, rather than excluding a day merely because it has any historical log.
3. Apply only changed fields. Preserve field and structural exceptions. The source occurrence remains explicitly targeted by the user's edit.
4. Skip substituted or unbound exercises rather than matching by position. Offer explicit target selection for those exceptions.
5. Build replacements from each occurrence's current rendered content. Preserve its unrelated fields and existing changes.
6. Revalidate and show the resulting changes, warnings, and skipped targets.
7. Re-read the saved program and completion state before commit. If either changed since preview, recompute and show the revised preview.

Keep full-day overrides as the initial persistence strategy. Merge each targeted day from current rendered content, without deleting unrelated days from an existing week override. Preserve override precedence. Do not remove a whole week override to update one workout.

Persist metadata changes with the edit. Repeated template edits update the template baseline for the edited fields. Single-occurrence edits create corresponding exceptions. Explicitly included exceptions update their records. Do not let a later edit mistake a previous repeated change for an independent week-specific exception.

Group operations must preserve every member and unrelated group. Reorder days by template identity, including rest slots, then update display ordinals and override placement together. Keep occurrence day IDs stable so navigation and logs still resolve.

Completed session data must remain unchanged. The app also allows another pass through a routine using existing day IDs. Where a day ID is reused, preserve the completed prescription with an optional `WorkoutLogDocument.prescriptionSnapshot`, and have historical rendering prefer it. Capture existing completed prescriptions before changing their reused day, without altering recorded sets, exercise identities, dates, or completion markers. Save snapshots and the program edit atomically.

For an active session, flush autosave before applying changes. Preserve entered cells when sets shrink. Preserve already logged exercises when replacement or regrouping changes row identities; do not relabel recorded sets as a different catalog exercise. Use the existing hydration and preserved-entry machinery, extending it where needed.

### Edit the import draft without repeated reparsing

Add `src/lib/import/draft.ts` and `src/components/import/ImportReviewEditor.tsx`. Keep one normalized draft with metadata, corrections, warnings, and exercise-resolution decisions.

Change the flow to paste, resolve names when needed, then review and edit before save. The review defaults to template view, with a week selector and an expanded read-only program preview. Users can return to resolution after adding or changing an exercise.

Key new draft resolution decisions by stable source targets. Translate legacy positional paths at the resolution boundary. Reordering or regrouping must not move a resolution decision onto another exercise. Preserve decisions and remembered-alias choices for unchanged targets.

Keep the original pasted JSON separate from a serialization of the edited draft. Show both through the raw JSON control with clear labels. Generate edited JSON in the supported external format, not the internal `ProgramDocument` shape. Applying a raw JSON edit creates a new draft revision and reconciles only unambiguous unchanged targets.

Changing view or going back must not reset the draft. Saving the same draft again updates the same program. Catalog aliases remain opt-in and are written only after the program succeeds, preserving current conflict behavior.

### Split output requirements from coaching preferences

Retain `buildSchemaBlock()` as the short required output-contract entry point. Extract optional detailed programming advice into `buildCoachingBlock()`. Move persona synthesis out of the component into a small pure builder function.

The required block includes supported hierarchy and types, valid JSON output, effective set-count semantics, equal superset counts, volume-role semantics, compact base templates and sparse variants or overrides, and a maximum of eight generated weeks. Include short progression guidance without enforcing a particular method or compulsory deload.

Use one concise, valid JSON example. Make optional fields optional in the explanation instead of filling the example with long placeholder prose. Let models discuss the routine as needed and emit JSON when asked for the final routine. Remove the forced multi-step conversation, repeated audits, exact all-caps trigger, and repeated footer from the default instructions.

Always include the required output contract in a generation prompt. Replace the current schema checkbox with an optional detailed-coaching checkbox, off by default. Keep the legacy `schemaOn` preset field readable; it must not disable the new required contract or silently enable detailed coaching. Add optional `coachingOn`, with absence meaning false. Preserve all persona IDs, edits, field toggles, and existing preset identity.

Leave persona text unchanged in this work. Shorten surrounding synthesis instructions while preserving each selected coach's contribution and the precedence of athlete constraints and output requirements. Shorter defaults do not mean removing selected personas.

Keep the recovery prompt focused on repairing the routine being imported. It must not truncate an existing twelve-week routine to eight weeks. Generation length guidance belongs in generation prompts only.

## Task sequence

Write the behavioral tests for each task before its implementation. Run the focused Jest suites before continuing. Proposed filenames below are new unless linked to an existing file.

| Task | Deliverable | Depends on |
| --- | --- | --- |
| 1 | Shared validation and visible correction data | None |
| 2 | Stable template lineage and exception metadata | 1 |
| 3 | Pure edit preview and application engine | 2 |
| 4 | Safe persistence, completion protection, and session integration | 3 |
| 5 | Import draft and structured review editor | 1, 3, 4 |
| 6 | Shared scope controls for manual and AI editing | 3, 4, 5 |
| 7 | Short generation contract and optional coaching | 1; otherwise independent |
| 8 | Browser verification and compatibility gates | 5, 6, 7 |

### Task 1: Normalize prescriptions and expose diagnostics

Files: new `src/lib/programs/validation.ts` and tests; modify [types](../../../src/lib/programs/types.ts), [parser](../../../src/lib/import/parser.ts), [cellMap](../../../src/lib/workout/cellMap.ts), and their tests.

- [ ] Test coercion and fallback rules using raw JSON, including variant and override prescriptions.
- [ ] Test a valid base superset that becomes mismatched in a later week, and a mismatch repaired by an override.
- [ ] Define `ProgramDiagnostic` and optional compatible `ImportWarning` fields. Keep structural diagnostics separate from catalog matching.
- [ ] Apply safe normalization at the parser boundary and reuse the same set-count rule at logging and manual-edit boundaries. Do not add conflicting defaults in components.
- [ ] Test real `buildInitialCells` output for corrected prescriptions, rather than testing normalization alone.
- [ ] Test that existing structural warnings survive and corrections retain original source values.

Run `bun run test -- --runInBand src/lib/import/parser.test.ts src/lib/import/importConstraint.test.ts src/lib/workout/cellMap.test.ts src/lib/programs/validation.test.ts`.

### Task 2: Preserve templates and intentional exceptions

Files: new `src/lib/programs/editTypes.ts`, `editMetadata.ts`, and tests; modify parser, [resolution](../../../src/lib/import/resolution.ts), [types](../../../src/lib/programs/types.ts), and [RoutineBuilderClient](../../../src/components/workout/RoutineBuilderClient.tsx).

- [ ] Test distinct recurring workouts with identical titles and repeated exercises within one workout.
- [ ] Test lineage through load-only variants, exercise substitutions, week overrides, and reordered groups.
- [ ] Capture normalized templates and provenance before expansion. Update metadata when catalog resolution supplies concrete exercise identities.
- [ ] Initialize metadata for manually created routines. Preserve occurrence IDs and existing public rendering shapes.
- [ ] Test lazy derivation for older routines, with ambiguous mappings reported rather than guessed.
- [ ] Prove legacy programs still render unchanged and parser-only variant carriers remain absent from stored exercises.
- [ ] Test program duplication, repository round trips, backup export and restore, and exercise-identity transforms. Ensure copied metadata has no links to the original program or logs.

Run focused parser, resolution, metadata, program repository, and backup suites.

### Task 3: Build the shared edit engine

Files: new `src/lib/programs/edits.ts` and tests; extend [programDiff](../../../src/lib/workout/programDiff.ts) and tests.

- [ ] Test single-occurrence and repeated field patches, explicit clears, replacement, regrouping, and routine-day order changes.
- [ ] Test preserving a two-set deload when changing ordinary weeks from four to five sets.
- [ ] Test preserving rep progression while changing only sets, and preserving load changes while changing only reps.
- [ ] Test deliberate selection of exceptions, alternate exercises, missing lineage, duplicate names, and partially completed routines trained out of order.
- [ ] Implement ID-based operations, previews, and explicit exception target selection. Reuse [moveItem](../../../src/lib/ui/reorder.ts) for ordering.
- [ ] Include group types, membership, section changes, exercise order, volume role, units, and notes in AI change detection. A grouping-only edit must produce a reviewable change.
- [ ] Test unchanged input documents, identical preview and application output, repeat application without duplicate overrides, and preservation of other days in week overrides.

Run edit-engine, program-diff, override, and day-resolver suites.

### Task 4: Save edits without losing sessions or history

Files: new `src/lib/programs/applyEdit.ts` and tests; modify [programRepo](../../../src/lib/storage/programRepo.ts), [LocalDataProvider](../../../src/components/app/LocalDataProvider.tsx), [WorkoutDayClient](../../../src/components/workout/WorkoutDayClient.tsx), and affected history readers.

- [ ] Test a changed program or newly finished session invalidating a prior preview.
- [ ] Add the program-and-log transaction needed for completed-prescription snapshots on reused day IDs. Update provider state after successful commit without a loading refresh that remounts the workout.
- [ ] Flush session autosave before applying a patch. Coordinate the mutation with the existing exclusive save queue.
- [ ] Test typed cells surviving a reduced prescription and existing logged sets surviving exercise replacement or regrouping.
- [ ] Test completed and skipped occurrences remaining protected, including repeated passes. Historical views use frozen prescriptions where needed.
- [ ] Inject save failure and verify rollback, visible retry, retained preview, and unchanged recorded workout data.

Run storage, session-persistence, provider integration, workout, and history suites.

### Task 5: Add structured import review and editing

Files: new `src/lib/import/draft.ts`, `serializeDraft.ts`, `src/components/import/ImportReviewEditor.tsx`, `ImportWarnings.tsx`, and tests; modify [ImportClient](../../../src/components/import/ImportClient.tsx) and [ResolutionStep](../../../src/components/import/ResolutionStep.tsx).

- [ ] Test editing a resolved draft and saving the edited program rather than the original parse result.
- [ ] Show template days, selectable week differences, complete expanded preview, and readable diagnostics linked to their targets.
- [ ] Add exercise selection or custom naming, sets and reps editing, group membership and type editing, and accessible day reordering. Use existing picker and reorder primitives.
- [ ] Route all edits through the shared preview engine. At import show "This occurrence" and "Every occurrence of Lower B", with a day-number fallback when the title is empty.
- [ ] Preserve catalog choices across reordering. Reopen resolution for new or changed exercise targets without resetting unchanged choices.
- [ ] Regenerate current warnings after edits. Allow save with superset mismatch warnings and safe corrections.
- [ ] Serialize edited drafts into compact supported JSON. Test parse, edit, serialize, and re-import against the expanded effective program, including exceptions and volume roles.
- [ ] Test back navigation, raw JSON revisions, custom-exercise creation, remembered-alias conflicts, failed saves, and repeat saves producing one program.

Run import component, resolution, draft, and serializer suites, including `ImportClient.remember.test.tsx`.

### Task 6: Use the same scope and preview after import

Files: new `src/components/workout/EditScopeControl.tsx` and `EditImpactPreview.tsx`; modify [ExerciseEditSheet](../../../src/components/workout/ExerciseEditSheet.tsx), [WorkoutDayClient](../../../src/components/workout/WorkoutDayClient.tsx), [ModifyAiModal](../../../src/components/workout/ModifyAiModal.tsx), [DiffPage](../../../src/components/workout/DiffPage.tsx), [DiffReview](../../../src/components/workout/DiffReview.tsx), and [pendingDiff](../../../src/lib/workout/pendingDiff.ts).

- [ ] Use the shared controls in import review, manual edits, and AI review. Offer "This occurrence" and "Apply to remaining occurrences of Lower B" after training starts.
- [ ] Display individual field changes, exception reasons, unbound targets, and resulting validation warnings before commit.
- [ ] Replace the AI week-scope save path with shared edit application. Preserve existing imported week overrides.
- [ ] Carry normalization warnings and lineage through AI parsing and pending-diff storage. Do not discard warnings in `ModifyAiModal`.
- [ ] Read older pending diffs safely. An old `week` value must not silently become recurring scope; require a new scope selection or return to single-occurrence preview.
- [ ] Test grouping-only AI edits, repeated manual replacements, preserved variants, completion protection, stale previews, save retry, and storage failures.
- [ ] Verify selecting a specific exception changes exactly that target, with no name or position-based spillover.

Run manual editor, AI modal, diff-review, pending-diff, and workout integration suites.

### Task 7: Shorten prompts while preserving personas and presets

Files: modify [builder](../../../src/lib/prompts/builder.ts), [PromptBuilderClient](../../../src/components/prompts/PromptBuilderClient.tsx), [PromptPresetDocument](../../../src/lib/programs/types.ts), [promptPresetRepo](../../../src/lib/storage/promptPresetRepo.ts), [ModifyAiModal](../../../src/components/workout/ModifyAiModal.tsx), and relevant tests.

- [ ] Test generation guidance for at most eight weeks, equal superset counts, supported types, compact templates, sparse exceptions, and correct volume roles.
- [ ] Split the required contract and optional coaching block. Keep optional coaching off by default. Remove mandatory audits and fixed programming methods from the default block.
- [ ] Preserve zero, one, and multiple personas, exact user-edited text, profile field toggles, injury text, and synthesis precedence.
- [ ] Make output requirements unconditional. Load legacy presets without their old schema checkbox suppressing the contract. Persist the new optional coaching choice.
- [ ] Test prompts with a conflicting edited persona: output and athlete requirements retain precedence.
- [ ] Keep repair prompts compatible with longer imported routines. Add a twelve-week import and repair regression case.
- [ ] Report before-and-after character counts for the required block and representative zero, one, and multiple-persona prompts. Use a reviewed regression budget of 6,300 characters for the required block, approximately half the measured baseline. Do not meet that budget by removing essential fields or truncating persona text.
- [ ] Test the prompt's JSON example through the actual importer. Evaluate copied prompts in an external chat manually; automated string tests cannot prove model formatting reliability.

Run prompt builder, persona, preset, backup, and AI modification prompt suites.

### Task 8: Verify complete user workflows

Files: extend [program-import](../../../e2e/program-import.spec.ts), [modify-ai](../../../e2e/modify-ai.spec.ts), [workout-logging](../../../e2e/workout-logging.spec.ts), and [session-persistence](../../../e2e/session-persistence.spec.ts). Add focused editing and prompt-builder browser specs where existing suites do not cover the workflow.

- [ ] Import an eight-week fixture with a mismatched superset, a numeric-string set count, rep progression, an alternate exercise, and a deload. Show corrections and mismatches, repair them in the editor, reorder days, save, reload, and inspect actual logging rows.
- [ ] Apply a repeated edit after completing a workout out of order. Verify affected future workouts, protected completed workouts, unchanged unrelated days, and preserved exception values after reload.
- [ ] Exercise manual and AI grouping changes through their real review and save paths. Confirm "Entire week" is gone.
- [ ] Save with a remaining mismatch warning, then manually fix it. No forced balancing or warning-acknowledgment checkbox is required.
- [ ] Import and repair a twelve-week program. No generation-length restriction appears in import or editing.
- [ ] Export and restore programs, logs, lineage metadata, and old and new prompt presets. Reopen the program and edit it after restore.
- [ ] Check narrow-screen layout, keyboard reordering, focus return, warning navigation, and recovery after failed saves.
- [ ] Copy the default and multi-persona prompts into an external chat, import the resulting JSON, and compare actual expanded weeks and prescriptions. Record models used and failures without claiming a quantified reliability improvement from a few samples.

Run the implementation quality gates:

```bash
bun run test -- --runInBand
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- e2e/program-import.spec.ts e2e/modify-ai.spec.ts e2e/workout-logging.spec.ts e2e/session-persistence.spec.ts
```

Add any newly created browser spec paths to the last command. Use the T3 collaborative preview for interactive verification when available.

## Delivery and completion criteria

Ship Tasks 1 and 7 independently when their checks pass. Land lineage, preview, and persistence before exposing repeated scope in any editor. Finish the structured import editor before treating the overall scope as delivered.

The work is complete when users can inspect corrections, manually repair or accept usable imports, edit a template and its weekly exceptions, and apply the same reviewed change consistently across eligible occurrences. Completed data, active entered sets, intentional weekly differences, and unrelated overrides must survive save, reload, duplication, and backup restore.

Do not expand this work into training-quality enforcement, new exercise group types, coach-persona rewrites, calendar scheduling, or model API integration. Density queues remain a separate product discussion.
