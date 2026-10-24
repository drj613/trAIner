# Workout history text export and routine JSON file import

Date: 2026-10-24
Status: Implemented and verified
Grounded at commit: `31dfd5a`

This plan contains the feature contract and implementation steps. The implementing agent does not need the planning conversation or candidate files in `/tmp`.

## Outcome and boundaries

Add **Export for AI** to History. Users can export all routines or one routine, optionally bounded by local calendar dates. Preview, Copy, and Download use the same plain-text string. Preserve recorded observations while removing storage metadata and unperformed prescriptions.

Add **Choose JSON file** to Import. A file fills the existing editable textarea. Validate, exercise resolution, review, and Save continue through the current implementation. Accept the same routine format as paste import.

Both features run locally. Do not add an AI API, database migration, dependency, new routine schema, alternate save path, or change to routine activation. Full workspace backup and restore keep their current behavior. Do not implement CSV import, third-party adapters, drag-and-drop, streaming export, summary metrics, or automatic cross-session duplicate detection.

## Working instructions

1. Read repository instructions and inspect `git status` before editing. Preserve unrelated work.
2. Use Bun and the existing Jest, Testing Library, and Playwright setup.
3. Implement tasks 1 through 6 in order. Write each task's tests first, observe the expected failure, implement, then rerun its tests.
4. A failing test must expose user-visible behavior or recorded-data loss. Do not add source-import scans or tests that merely repeat implementation details.
5. If a named symbol has moved, locate it with `rg`. If behavior contradicts this plan, report the contradiction and evidence before changing the contract.
6. Do not refactor unrelated history, import, identity, or backup code to make the task easier.

No implementation is included in this document. New files below are proposed paths.

## Existing code to read

- `src/lib/programs/types.ts`: `WorkoutLogDocument`, `WorkoutLogEntry`, `WorkoutSetLog`, and `ProgramDocument`.
- `src/lib/workout/historyUtils.ts`: `setHasData`, `entryHasHistoryData`, `readableEntries`, `readableSets`, and `entryPerformedName`.
- `src/lib/workout/historyProjection.ts`: recorded-name resolution and per-entry identity. Repeated entries are distinct history.
- `src/lib/workout/localDate.ts`: `logLocalDate` and `sortableStamp`.
- `src/lib/catalog/identity.ts`: `resolveExerciseIdentity` and `ExerciseIdentityContext`.
- `src/components/workout/HistoryClient.tsx`: log loading, identity context, current filters, and page header.
- `src/components/app/LocalDataProvider.tsx`: `useLocalData` supplies routines. Calling it requires its provider.
- `src/components/import/ImportClient.tsx`: `handleValidate`, `handleSave`, `json`, `savedJson`, `savedProgramId`, and paste-step JSX.
- `src/lib/import/parser.ts` and `src/lib/import/sanitizeJson.ts`: normalization, warnings, and `parseLooseJson`.
- `src/components/app/SettingsClient.tsx`: existing Blob-download and object-URL cleanup pattern.
- `e2e/helpers.ts` and `playwright.config.ts`: imports, database setup, and `/trAIner/` base URL.

Important traps:

- `formatSetLabel` is a display formatter. It omits set numbers, RPE, and set notes, gives `rawCell` precedence, and can imply bodyweight from missing weight. Do not use it to serialize export sets.
- History projection rows omit session notes/status and routine/day IDs. Read the raw logs rather than serializing projection rows or the rendered DOM.
- Stored records can contain malformed values despite TypeScript declarations. Existing readability helpers skip some malformed items. Inspect the original containers too so skipped data gets an explicit warning.
- `performedDate` is the recorded local date. UTC timestamp slicing produces wrong dates near midnight.
- Routine imports currently set `active: true`. Preserve this behavior; do not call exclusive activation as part of file import.
- Save retry identity is scoped to unchanged JSON within the mounted importer. Filename and routine title are not identity.

## Feature contract

### Export selection and loading

Default to all routines and all dates. Provide a routine select and independent optional From and Through date inputs. Bounds are inclusive. Existing movement search, Recent/Stale filters, and an open exercise drawer do not constrain export.

Routine options are the union of stored routines and routine IDs referenced by logs. This permits exporting history after its routine was deleted. Build labels in deterministic ID order. Use `Unavailable routine 1`, `Unavailable routine 2`, and so on for missing routines; append a stable ordinal to duplicate titles. Do not print internal IDs in exported text.

Load logs through the existing History load. Obtain programs through `useLocalData`. Export remains unavailable while either source loads or fails. Replace History's silent log-load failure with a visible error for export; an unsuccessful load must not generate an apparently complete empty export. Do not introduce a second log fetch in the export component.

An invalid calendar date or reversed range is a field error, not an empty result. Validate `YYYY-MM-DD` and actual calendar validity, including leap years. Empty input means no bound. An unknown selected routine ID is also an error; do not fall back to all routines.

Use `logLocalDate`, then validate the result. Unknown dates sort last without bounds. With either bound active, exclude unknown-date logs and show their count in both preview metadata and the text header. Do not invent a date.

### Session and field retention

Sort eligible sessions oldest first by valid local date, then `sortableStamp(performedAt)`, then log ID, then original input position. Sort on a copy. Preserve entry and set array order, including repeated exercises and duplicate set numbers.

Include completed and skipped sessions even without exercise data. Include unfinished sessions only if they have recorded sets, entry/session notes, a skip reason, or unreadable content. Omit empty unfinished placeholders.

Status labels are `completed`, `skipped`, and `in-progress`. If both completion and skip markers exist, print `conflicting-status` and count a warning. Keep skip reason separately. Use the snapshot day title first, then the current matching program day, then `Unavailable day`. Routine titles are current titles because logs do not freeze them.

Keep the recorded exercise name. If absent, use the existing stored-exercise identity resolver with guarded inputs, then `Unnamed exercise`. Never fall back to printing an exercise ID. If the resolver provides a different `currentVersionLabel`, retain it as a separate `version:` annotation; do not replace the recorded name or combine entries.

Preserve independently: set number, weight, unit, reps, RPE, rawCell, set notes, entry notes, log `notes`, `dayNote`, and `skipReason`. A raw cell and numeric fields can coexist. Missing values are not zero. A recorded numeric zero must survive. Missing unit means `lb`; explicit `kg` stays `kg`. Do not convert units or infer bodyweight.

Omit profile details, aliases, catalog metadata, internal IDs, timestamps other than the session date, full prescription snapshots, planned sets, progression rules, volume summaries, PRs, and empty set placeholders.

### Plain-text grammar, version 1

Use UTF-8, `\n` line endings, and one final newline. Quote every user-provided string with `JSON.stringify` so embedded newlines, quotes, and delimiters cannot impersonate a new record. No Markdown table or fenced code block in the downloaded file.

```text
trAIner workout history v1
scope: all routines
dates: all; local, inclusive
sessions: 1; entries: 2; sets: 3; warnings: 0; excluded-undated: 0
sets: #number weight-unit x reps @RPE; ?=unrecorded; quoted text=recorded text

2026-10-21 | routine:"Upper/Lower" | day:"Upper A" | completed
"Bench press": #1 185lbx8 @8; #2 185lbx7 @9 raw:"slow final rep" note:"left shoulder tight"
"Plank": #1 raw:"40s hold"
day-note:"Slept poorly"
```

Rendering rules:

- If either weight or reps is present, print both sides of `x`; absent sides use `?`. Examples: `?x8`, `185lbx?`, `0kgx5`. The unknown-weight marker has no unit suffix.
- Append `@8` when RPE is present. An RPE-only set is `#2 @8`.
- Append `raw:<quoted>` and `note:<quoted>` independently. A notes-only set survives.
- Set number is the recorded positive integer. Missing/invalid number becomes `#?` with a warning; do not renumber from array position.
- Entry notes use an indented `entry-note:<quoted>` line immediately after the entry. Session notes use `session-note:`, `day-note:`, and `skip-reason:` separately.
- Missing/blank optional text is absent. Nonempty text is preserved without trimming its content.
- For malformed numeric values, emit a field marker such as `!unreadable-weight`; never coerce an object, numeric string, NaN, or Infinity into a measurement. Continue rendering other readable fields.
- Malformed unit emits `!unreadable-unit`, with `?unit` after a readable weight. Never silently call it pounds.
- Malformed present text emits a field marker. Non-array entries/sets and non-object array items emit a container/item marker. `unreadableEntries` also produces a marker.
- Count one warning per emitted marker, plus each undated exclusion or status conflict. Include markers without dumping arbitrary malformed payloads. Absent/null optional values are not corruption; required malformed containers are.
- A malformed top-level log emits an `!unreadable-session` line for all-routines/all-dates export. Under filtering, exclude it with a warning because scope/date cannot be established.
- Use `date-unknown` for an included undated session. Header scope is `all routines` or the quoted routine label. Header dates use `from..through`, with `*` for an open bound.

The summary counts rendered sessions, entries, and data-bearing sets. Warning-only content is exportable even when the session count is zero. Truly empty output shows `No workouts in this range` and disables Copy/Download. If filtering excludes unreadable records, show that notice even with zero matches.

### File selection

Accept one file with picker hints `.json,application/json`. MIME and extension are hints, not a second validation schema. Maximum size is exactly `5 * 1024 * 1024` bytes; reject larger files before reading. Exactly the limit is accepted.

Read `file.text()`, remove one leading UTF-8 BOM character, and retain all remaining text unchanged. Use `parseLooseJson` only to classify a recognizable workspace backup: an object with both `programs` and `logs` arrays. Reject that file with `This is a workspace backup. Restore it in Settings.` and a router link to `/settings`. Do not call restore automatically.

All other content, including empty or malformed JSON, fills the textarea and is handled by existing Validate. A successful read clears obsolete parse/file errors and returns to the normal paste-input state. It does not validate or save automatically. Preserve `savedProgramId` and `savedJson` so unchanged-content retry protection still works.

Cancel, oversized file, backup detection, and read failure leave current JSON and saved/review state intact. Show file errors separately from parser errors. Disable Validate and textarea edits during a read. A request counter ensures an older read cannot replace a newer selection; invalidate pending reads on unmount. Reset the file input value after capturing the File so choosing the same file again fires change.

Show a successful load notice with the filename as React text. No `innerHTML`.

## Task 1: Build and test the pure export module

Create:

- `src/lib/workout/historyExport.ts`
- `src/lib/workout/historyExport.test.ts`

Use this public contract; import existing domain types rather than duplicating them:

```ts
export type HistoryExportSelection = {
	routine: { kind: "all" } | { kind: "one"; programId: string };
	from?: string;
	through?: string;
};
export type HistoryExportInput = {
	logs: readonly WorkoutLogDocument[];
	programs: readonly ProgramDocument[];
	context: ExerciseIdentityContext;
	selection: HistoryExportSelection;
};
export type HistoryExportResult =
	| { ok: false; field: "from" | "through" | "routine"; message: string }
	| {
		ok: true;
		text: string;
		fileName: string;
		summary: {
			sessions: number;
			entries: number;
			sets: number;
			warnings: number;
			excludedUndated: number;
		};
		canExport: boolean;
	};
export function buildHistoryExport(input: HistoryExportInput): HistoryExportResult;
export function historyRoutineOptions(
	logs: readonly WorkoutLogDocument[],
	programs: readonly ProgramDocument[],
): { value: string; label: string }[];
```

`historyRoutineOptions` returns individual routines only; the UI adds All routines. Use the same helper internally for exported routine labels. Keep all other helpers private. No storage, React, browser delivery, or network imports in this module. Validate runtime records with guards; do not change domain types to `any`.

Filename is deterministic: `trAIner-history-all-all.txt`, `trAIner-history-routine-all.txt`, or replace the final `all` with `<from-or-start>_<through-or-end>`. No generated timestamp or user-provided filename segment is needed.

Implement in this order: options/labels, date validation, selection/order, guarded field rendering, session assembly, header/counts. Reuse date and identity helpers. Do not modify existing display formatters. Track warnings while inspecting raw records; readability helpers alone cannot account for skipped malformed items.

Tests first, with exact expected fragments and at least one whole-output fixture:

1. All vs selected routine, deleted routine, duplicate titles, unknown selection.
2. Inclusive endpoints and one-sided bounds; invalid date, non-leap February 29, and reversed range return field errors.
3. Recorded local date differs from UTC date; `performedDate` wins. Legacy fallback follows `logLocalDate`.
4. Unknown dates sort last unbounded and produce exclusion notices bounded. Inputs remain unchanged.
5. Repeated entries and sparse set numbers such as 1 and 3 survive in input order.
6. Same set contains rawCell, numeric fields, RPE, and notes; every field survives.
7. lb default, explicit kg, weight zero, reps zero, missing weight, RPE-only, and note-only sets. `{ setNumber: 1 }` disappears.
8. All three session-note fields, snapshot title precedence, empty finished/skipped sessions, empty unfinished omission, and conflicting status.
9. Malformed containers/items/fields and `unreadableEntries` produce markers/counts without throwing or leaking raw objects. Place malformed values in fixtures with narrowly scoped `unknown` casts.
10. Text with newlines/quotes/separators is escaped. No profile, internal IDs, or prescription-only values appear.
11. Corrected version label does not erase the performed name. A missing name never exposes the slot ID.
12. Empty data disables export; warning-only output remains available.

Run: `bun run test --runInBand src/lib/workout/historyExport.test.ts`

Done when these tests pass and the result is deterministic for identical inputs.

## Task 2: Add the History export panel

Create `src/components/workout/HistoryExportPanel.tsx` and its `.test.tsx`. Modify `HistoryClient.tsx` and `HistoryClient.test.tsx`.

Use an inline collapsible panel opened by **Export for AI**, not a modal. Props are loaded logs, programs, and identity context. History owns loading/error gating; the panel owns selection and delivery state. Obtain programs with `useLocalData` in HistoryClient. Update existing History test setup with the provider or a focused provider mock, preserving its real identity provider coverage.

Panel controls: routine select, From, Through, a readonly selectable textarea labeled `Export preview`, summary counts/notices, Copy, Download .txt, and Close. Show field errors with `role="alert"`. Do not clear the preview for clipboard failure. Announce `Copied` through a polite status region only after clipboard success.

Memoize the formatter result from current inputs. Both actions consume that result's exact `text`; neither action regenerates data. Download a Blob with `text/plain;charset=utf-8`, use result.fileName, and revoke the object URL after initiating the download, including failure cleanup. Keep this small effect local; a generic transfer framework is unnecessary.

Test loading and load failure separately from empty history, all/one/date controls, invalid ranges, independent movement search, preview/clipboard/Blob equality, disabled empty actions, warning-only export, clipboard rejection with preview retained, and URL cleanup. Existing history behavior tests must still pass.

Run: `bun run test --runInBand src/components/workout/HistoryClient.test.tsx src/components/workout/HistoryExportPanel.test.tsx`

Done when the actual History entry point opens the working panel and errors cannot masquerade as complete exports.

## Task 3: Add the file reader

Create:

- `src/lib/import/fileSource.ts`
- `src/lib/import/fileSource.test.ts`

Export `MAX_ROUTINE_FILE_BYTES` and `readImportFile(file: File)`. Result union:

```ts
type ImportFileResult =
	| { kind: "text"; text: string; fileName: string }
	| { kind: "error"; reason: "too-large" | "backup" | "read"; message: string };
```

Follow the file-selection contract above. Catch read errors with a fixed user-facing message; do not expose arbitrary exception internals. Do not call `parseProgramJson` in this helper. The `text` result intentionally includes invalid JSON, which the existing Validate action owns.

Test limit boundaries without allocating huge strings by mocking `file.text`; assert too-large files are never read. Also test cancel at the UI layer, read rejection, BOM stripping, exact text retention, malformed/empty JSON pass-through, backup detection, and a valid routine that is not misclassified.

Run: `bun run test --runInBand src/lib/import/fileSource.test.ts`

Done when file acceptance leaves routine validation to the existing parser.

## Task 4: Connect file input to ImportClient

Modify `src/components/import/ImportClient.tsx`. Create `src/components/import/ImportClient.file.test.tsx` with the real parser; existing `ImportClient.test.tsx` mocks it and cannot prove equivalence.

Add labeled input `Choose JSON file`, read/loading status, and a separate file error on the paste step. Capture the File before resetting the input value. Use a `useRef` request counter and unmount invalidation. Disable text editing and Validate while reading; allow a newer file selection to supersede the old one. Only the current request may change loading, errors, or JSON.

On successful read, update JSON and clear stale parse/file messages. Do not reset `savedJson` or `savedProgramId`, run Validate, or write any repository. Keep `handleValidate` and `handleSave` as the only existing routine processing path. Make any shared parser-error UI wording source-neutral where necessary; do not change parser acceptance rules.

Tests first:

1. File loads into textarea; no save or alias write occurs until existing Save.
2. Same contents pasted vs selected produce equivalent review and saved prescription. Compare meaningful fields while ignoring freshly generated IDs/timestamps. Do not mock the parser or resolver for this test.
3. Exercise resolution and review edits still apply before Save.
4. Cancel, too-large, backup, and read failure preserve previous JSON; backup shows Settings link and never restores.
5. A slow first read cannot overwrite a faster second read; unmounted completion causes no state updates.
6. Re-selecting the same file fires; filename changes do not define routine identity.
7. Existing unchanged-text retry protection survives; an independent new import of the same title gets fresh IDs. Do not promise global deduplication or that changed JSON reuses the earlier ID.
Use controllable deferred Promises for read-race tests. Mock `File.text` locally if jsdom lacks it. Reuse alias/user-exercise repository mocks from nearby tests rather than adding network behavior.

Run: `bun run test --runInBand src/components/import src/lib/import`

Done when both input sources reach the same reviewed, persisted routine behavior.

## Task 5: Prove the user flows in the browser

Create `e2e/history-export.spec.ts` and `e2e/routine-file-import.spec.ts`. Use existing helpers and the Playwright webServer; do not add sleeps for synchronization. Wait on visible UI or persisted data conditions.

Export test: import a routine, log at least one numeric and one raw-text set, finish the workout, open History, select Export for AI, and assert preview content. Download the file and compare its UTF-8 content to the preview. Verify a nonmatching date range disables delivery. Test mixed units and richer malformed data in Jest fixtures rather than building an elaborate UI setup.

Import test: select an actual JSON file through `setInputFiles`, Validate, resolve exercise versions if requested, review, Save, and reload the saved routine. Verify title and prescription. A second case selects a backup and verifies guidance and no overwritten routine/history.

Test Copy in Chromium with clipboard permissions if supported; the Jest test remains the deterministic exact-string check. Exercise the real download independently of clipboard support.

Run:

```bash
bun run test:e2e e2e/history-export.spec.ts e2e/routine-file-import.spec.ts e2e/program-import.spec.ts e2e/history-rawcell.spec.ts
```

Done when a real browser completes both features and downloaded text matches the preview byte-for-byte.

## Task 6: Final checks and delivery

Run once after the focused suites pass:

```bash
bun run typecheck
bun run lint
bun run test --runInBand
bun run build
git diff --check
```

Measure compactness using a deterministic fixture with multiple sessions and repeated exercises. Compare the text to JSON containing the same selected raw history, not an entire workspace backup. Record UTF-8 byte counts. If a development tokenizer is available, also record its package/version, encoding, and token counts for both strings. Do not add a runtime tokenizer or estimate tokens from character counts. Without token measurements, report byte savings only and leave token reduction explicitly unverified.

Inspect the diff for unintended changes to backup restore, activation, history metrics, parser acceptance, and persistence. Re-run relevant checks only after a change or failure warrants it. Fix regressions; report unrelated baseline failures with their commands and evidence rather than suppressing them.

Follow repository delivery instructions for commit, sync, and push. Do not include `/tmp` design candidates. If required tooling is unavailable, record the exact blocker instead of claiming it ran.

Final handoff must list the implemented behavior, tests and browser flows actually run, compactness measurements or the explicit measurement limitation, commit/PR URL as applicable, and any unresolved failures.

## Design decision record

The two candidate designs converged on a pure formatter and the existing import flow. The first candidate is the base because it preserves raw and numeric fields independently, keeps set numbers, and reports invalid ranges explicitly. The second contributes compact output, summary counts, and backup-file guidance. The final comparison agreed with that choice.

Rejected designs: exporting rendered history labels loses data; a repository-backed transfer service adds another loading path; raw-text precedence hides numeric observations; treating reversed dates as zero matches hides an input error. These choices are settled for this implementation.

## Implementation verification

The example download and asset were removed after the initial implementation at the user's request. The verification entries below describe the original implementation and remain as historical records.

Luna agents implemented the formatter, History panel, file import, and browser tests. DeepSeek V4.1 Flash agents reviewed the chunks through `opencode-go/deepseek-v4.1-flash`. Follow-up changes include stable labels for deleted routines, omission of blank set placeholders, separate entry-note lines, accurate copied-text status, and warnings for malformed completion timestamps. Blank completion timestamps are absent. A nonblank timestamp must be parseable before it can establish completed or skipped status. Filtered exclusion warnings are exportable even when no sessions remain. Unreadable routine IDs use an explicit Unknown routine label and warning rather than sharing a deleted routine label. Final DeepSeek reviews found no unresolved defects.

The following checks passed on 2026-10-24:

- Full Jest suite: 131 suites, 1,803 tests. Run with Bun 1.3.12 on PATH because catalog CLI tests spawn `bun`.
- TypeScript checks for production and tests, repository ESLint, production Vite build, and `git diff --check`.
- Combined Chromium acceptance/regression run: 14 tests across the new export/import specs, `program-import.spec.ts`, and `history-rawcell.spec.ts`.
- Final Chromium run of the two new specs: 4 tests, including exact preview/clipboard/download equality, routine reload, backup rejection, and example download/import.
- Collaborative browser: uploaded, validated, and saved the example; checked the History export panel at a 390px viewport with no horizontal overflow.

The export size measurement uses 24 completed sessions dated October 1 through 24, 2026. Each has Bench press, Seated row, and Plank entries with three sets each. Weighted sets use `80 + sessionIndex` kg, `8 - setIndex` reps, and RPE `7 + setIndex / 2`. Plank sets contain `40s hold`. Every fourth session has the day note `Slept poorly`. The input includes stored log, routine, day, and exercise-slot IDs and timestamps. The comparison serializes the same selected raw logs, without an unrelated workspace backup.

Using tiktoken 0.14.0 with `cl100k_base`, the exported text measured 6,203 UTF-8 bytes and 3,051 tokens. Minified JSON measured 19,822 bytes and 7,292 tokens. Pretty-printed JSON measured 41,795 bytes and 12,380 tokens. The text therefore used 58.2% fewer tokens than minified JSON for this fixture. Token savings depend on the data and tokenizer. The tokenizer was installed only in a temporary development environment; the app has no tokenizer dependency.
