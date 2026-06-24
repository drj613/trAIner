# Prompt Builder Improvements — Design

**Date:** 2026-06-19
**Status:** Design approved; pending implementation plan
**Branch:** `feat/prompt-builder-improvements`

## Motivation

The LLM prompt builder (`src/components/prompts/PromptBuilderClient.tsx` +
`src/lib/prompts/builder.ts`) assembles a prompt the user pastes into an external
chat LLM, which coaches conversationally and then emits a routine as JSON on the
`GENERATE IT` trigger. Three research streams (metaprompting, fitness-domain
prompting, structured-output reliability) plus a code audit surfaced concrete
improvements. This design covers three of them.

The single most important finding, verified in code: **the model never sees the
user's injuries.** The Profile UI writes the "Injuries / limitations" field to
`profile.injuries`, but both prompt generators read the legacy `profile.constraints`
field, which the current UI never populates. So programs are designed (and audited
by the separate analysis tool) blind to the most safety-critical input collected.

Secondary finding: `buildProfileBlock` emits only name/training-age/days/goals/
equipment, silently dropping `body`, `history`, `schedule`, and `preferences` —
all of which the Profile page already collects.

## Scope

Four tracks, as chosen by the user:

1. **Context plumbing + injuries fix** — send the profile data already collected;
   fix the injuries→prompt disconnect; add an ad-hoc (temporary) injuries input in
   the builder. **Profile fields only — no log-derived data.**
2. **Generation-prompt upgrades** — stronger emitted-program requirements;
   rationale + self-audit in the chat phase; prompt hygiene.
3. **Builder UX** — profile-completeness nudge, per-field include toggles, and the
   ad-hoc injuries input.
4. **JSON parser hardening + recovery prompt** — make the importer tolerant of the
   common LLM JSON breakers via a focused, heavily-tested sanitizer; type-branch the
   recovery prompt. This functionality is core, so test coverage is a first-class goal.

### Out of scope (explicitly)

- Log-derived strength data / e1RM snapshot (rejected: anchoring risk — a workout
  log implicitly carries program structure the model can parrot, the exact failure
  the user already hit).
- The full `<<CONTINUE>>` truncation-stitching / segmented-emit protocol (we detect
  truncation and prompt a clean re-emit, but do not stitch partial responses).
- `jsonrepair` or any JSON-repair dependency (we hand-roll a focused sanitizer).
- Verbalized Sampling ("propose N distinct designs") variety step.
- Token estimate; prompt presets / versioning.

## Architecture: the field registry

New module `src/lib/prompts/profileFields.ts` is the single source of truth for
which profile fields exist, how they render into the prompt, and which block they
belong to. The per-field toggle UI, the prompt assembler, and the completeness
nudge all derive from it, so they cannot drift apart.

```ts
type FieldGroup = "profile" | "constraints";

type ProfileField = {
  key: string;            // stable id; also the toggle key
  label: string;          // toggle label
  group: FieldGroup;      // which block it renders into
  important: boolean;     // surfaced by the completeness nudge when empty
  hasData: (p: ProfileDocument) => boolean;   // for the nudge
  render: (p: ProfileDocument) => string | null; // chunk, or null when empty
};
```

### Registry (order = output order)

| key | label | group | important (nudge) | renders |
|---|---|---|---|---|
| `basics` | Basics | profile | no | `Name: …`, `Days per week: …` |
| `history` | Training history | profile | yes | `Training age: …`, `Training history: …` |
| `goals` | Goals | profile | yes | `Goals: a, b` |
| `equipment` | Equipment | profile | yes | `Equipment: …` |
| `schedule` | Schedule | profile | yes | `Schedule: …` (specific days / session length) |
| `body` | Body | profile | no | `Body: age …, height …, weight …, bodyfat …` (non-empty only) |
| `preferences` | Exercise preferences | profile | no | `Exercise preferences: …` |
| `injuries` | Injuries | **constraints** | yes | bullet list of `injuries ?? constraints` |

**Refinement vs. the approved sketch:** `Days per week` renders under `basics`
(not `schedule`), because it is a core, always-present value and should not
disappear when the user toggles off the `schedule` field. `schedule` therefore
renders only the specific-days/session-length chips, and the nudge keys on those
chips being empty.

### Assemblers

Two thin functions in `profileFields.ts`:

```ts
buildProfileFieldsBlock(profile, enabled: Set<string>): string
buildConstraintsFieldsBlock(profile, enabled: Set<string>): string
```

Each filters the registry by group + `enabled.has(key)` + non-null `render`,
prepends the block header, and joins. Returns `""` when no fields render.

- Profile header: `## Profile`
- Constraints header: `## Injuries & constraints`, followed by a hard-constraint
  directive line when items exist (see Track 1).

## Track 1 — context plumbing + injuries fix

- **Bug fix in the registry:** `injuries.get`/`render` read
  `profile.injuries ?? profile.constraints` (legacy profiles keep working).
- **New fields flow in:** `body`, `history`, `schedule`, `preferences`.
- **Hard-constraint framing:** when injuries/constraints exist, the constraints
  block leads with: *"Treat these as hard constraints — never program a movement
  that aggravates them; substitute a pain-free alternative that preserves the
  training stimulus and note the swap."*
- **Adjacent same-bug fix:** `formatProfile` in `src/lib/analysis/llmPrompt.ts:80`
  has the identical injuries bug. One-line fix (`injuries ?? constraints`) so the
  "analyze my routine" tool stops dropping injuries too. The rest of that prompt
  is out of scope.
- **Ad-hoc injuries:** the constraints block merges profile injuries with an
  ephemeral, builder-local injuries list (see Track 3). Chronic injuries live in the
  profile; temporary ones (e.g. "tweaked lower back this week") are typed in the
  builder and not persisted.
- **Remove** the old `buildProfileBlock` / `buildConstraintsBlock` from
  `builder.ts` (replaced by the registry assemblers). The constraints assembler
  accepts an optional extra-injuries list to merge in.

## Track 2 — generation-prompt upgrades

All changes live in `buildSchemaBlock` (`builder.ts`), plus the synthesis block in
`PromptBuilderClient.tsx`. `buildSchemaBlock` is reordered so it ends with the
emit contract; since the schema block is already the last section in the assembled
prompt, this places the contract at the very end (counters "lost in the middle").

New `buildSchemaBlock` order:

1. **Output mode** (rephrased affirmatively) — adds, before `GENERATE IT`, that the
   model must in prose (a) state key programming decisions (per-muscle weekly
   volume, intensity scheme, progression rule, deload plan) and (b) run a
   self-audit (volume in range, push/pull balance, warmups present,
   equipment/injury compliance) and fix issues. Reasoning stays in the
   conversation; the JSON carries only the program.
2. Schema definition (unchanged field names + skeleton).
3. **Program requirements** (new) — require a numeric progression rule,
   periodization with a planned deload (via `weeks` + `overrides`), a balanced
   week across movement patterns, and a warmup in every session.
4. Volume constraints + multi-week instructions (existing).
5. **Output contract (LAST)** — emit rules restated affirmatively, minimal negatives.

**Synthesis block** (`PromptBuilderClient.tsx`): strengthen so that where two
coaches genuinely conflict, the model resolves each conflict with an explicit rule
rather than averaging/splitting the difference.

Draft wording for all of the above is in the Appendix.

## Track 3 (UI) — toggles + nudge

In `PromptBuilderClient.tsx`:

- **Per-field toggles:** replace the `{ profile, constraints, schema }` boolean map.
  New state: `Record<fieldKey, boolean>` (every registry key, default `true`) plus
  the existing `schema` toggle. The "Prompt blocks" section renders toggles from
  the registry, lightly grouped under *Profile fields* / *Constraints* / *Output
  schema*.
- **Assembly:** build `enabled = Set(keys where toggle is on)`, then
  `buildProfileFieldsBlock(profile, enabled)`, `buildConstraintsFieldsBlock(profile,
  enabled)`, and the schema block, assembled in the existing order
  `[synthesis, ...personas, profile, constraints, schema]`.
- **Completeness nudge:** above the toggles, an inline hint listing any `important`
  field that is enabled-but-empty, e.g. *"Not yet in your prompt: Injuries,
  Schedule — add them in Profile →"* linking to `/profile`. Reuses the existing
  warning-banner styling. Hidden when nothing is missing.
- **Ad-hoc injuries input:** an ephemeral free-text chips input (mirroring the
  persona ephemeral edits), shown near the constraints toggle. Its entries are merged
  with `profile.injuries ?? profile.constraints` when the `injuries` field is enabled,
  feeding the constraints block. The nudge treats injuries as present when *either*
  profile injuries or ad-hoc entries exist. State is component-local and resets on reload.

## Track 4 — JSON parser hardening + recovery prompt

New module `src/lib/import/sanitizeJson.ts` — a focused, dependency-free sanitizer,
applied at every surface that parses pasted LLM JSON.

### `sanitizeJson(raw: string): string`

Pipeline, each step independently tested:

1. `stripFences` — remove ```` ```json … ``` ```` wrappers (existing regex).
2. `sliceBraces` — slice from the first `{` to the last `}`. **Fixes a current bug:**
   `stripJsonWrapper` only slices when `first > 0`, so JSON at index 0 followed by
   trailing prose ("…}  Let me know if…") is left un-sliced and fails to parse. The
   new version slices whenever both braces exist.
3. `normalizeQuotes` — replace typographic quotes (U+201C/D → `"`, U+2018/19 → `'`).
   A global replace is safe for this schema (no legitimate curly quotes in routine
   data); frontier models substitute these and resist instructions not to, so we
   normalize unconditionally rather than trust the prompt.
4. `stripComments` — remove `//` and `/* */` comments, **string-aware** (one
   left-to-right pass tracking in-string state + escapes) so `//` inside a notes
   string or URL is preserved.
5. `removeTrailingCommas` — string-aware removal of `,` before `}`/`]`.

### `parseLooseJson(raw): { ok: true; value: unknown } | { ok: false; reason }`

Runs `sanitizeJson` then `JSON.parse`. On failure, classifies `reason`:
`"empty"` | `"truncated"` (unbalanced braces/brackets via a string-aware scan) |
`"syntax"`. Single entry point for both paste surfaces.

### Wiring

- `parseProgramJson` (`src/lib/import/parser.ts`) uses `parseLooseJson` instead of
  `stripJsonWrapper` + raw `JSON.parse`, and folds its existing `"not-object"` /
  `"no-days"` checks into the same reason space.
- `ModifyAiModal.tsx:80` (the second paste surface, currently a bare
  `JSON.parse(json.trim())`) routes through `parseLooseJson` too.

### Recovery prompt (type-branched)

`buildRecoveryPrompt(reason, detail?)` replaces the generic version. Branches:

- `truncated` — "Your JSON appears cut off. Re-emit the COMPLETE program as one
  minified JSON object…"
- `syntax` — generic re-emit + "straight ASCII quotes, no fences, no trailing
  commas/comments, first char `{`, last `}`".
- `not-object` / `no-days` — restate the required top-level shape (a `days` array).

`ImportClient` passes the classified `reason` through.

## Testing

Following the project's test-first approach for bugs (reproduce, then fix):

- **`profileFields.test.ts`** (new):
  - **Injuries bug reproduction:** profile with `injuries: ["bad knee"]`,
    `constraints: []` → constraints block contains "bad knee". (Fails before fix.)
  - Each field renders when it has data and is omitted when empty.
  - Assemblers respect the `enabled` set and the field's group.
  - Legacy fallback: profile with only `constraints` populated still renders.
- **`builder.test.ts`:** drop tests for the removed functions; add `buildSchemaBlock`
  assertions for the new program requirements (progression / deload / warmup
  language) and that the emit contract appears last.
- **`PromptBuilderClient.test.tsx`:** nudge appears for an enabled+empty important
  field and links to `/profile`; toggling a field off removes its text from the
  generated prompt.
- **`llmPrompt`:** small assertion that injuries reach `formatProfile` output.
- **`sanitizeJson.test.ts`** (new — the priority suite, since this is core):
  - Each transform in isolation: fences (with/without the `json` tag), trailing prose
    after `}`, leading preamble, single + double typographic quotes, line + block
    comments, trailing commas in objects and arrays.
  - **String-safety:** `//`, `/* */`, commas-before-brace, and curly quotes that appear
    *inside* string values are preserved, not mangled (including escaped quotes).
  - Combinations (fences + smart quotes + trailing comma together).
  - Valid JSON passes through byte-stable.
  - Truncation: cut-off/unbalanced input classified `"truncated"`; empty → `"empty"`.
  - A corpus of realistic "LLM mistake" routine blobs parses to the right object.
- **`parser.test.ts`:** parseProgramJson succeeds on sanitizer-repaired input; the
  trailing-prose-at-index-0 bug now imports; reason classification is correct.
- **`builder.test.ts` (recovery):** `buildRecoveryPrompt` returns branch-appropriate
  text for each `reason`.

## Files touched

- `src/lib/prompts/profileFields.ts` — **new** (registry + assemblers + nudge helper).
- `src/lib/prompts/profileFields.test.ts` — **new**.
- `src/lib/prompts/builder.ts` — remove `buildProfileBlock`/`buildConstraintsBlock`;
  expand/reorder `buildSchemaBlock`.
- `src/lib/prompts/builder.test.ts` — update.
- `src/components/prompts/PromptBuilderClient.tsx` — toggles, nudge, registry-based
  assembly, synthesis-block wording.
- `src/components/prompts/PromptBuilderClient.test.tsx` — update.
- `src/lib/analysis/llmPrompt.ts` — one-line injuries fix.
- `src/lib/import/sanitizeJson.ts` — **new** (sanitizer + `parseLooseJson`).
- `src/lib/import/sanitizeJson.test.ts` — **new** (priority test suite).
- `src/lib/import/parser.ts` — use `parseLooseJson`; classify failure reasons.
- `src/lib/import/parser.test.ts` — extend.
- `src/components/workout/ModifyAiModal.tsx` — route paste through `parseLooseJson`.
- `src/components/import/ImportClient.tsx` — pass classified reason to recovery prompt.
- `src/lib/prompts/builder.ts` — also: `buildRecoveryPrompt` becomes type-branched.

## Appendix — draft prompt wording

### Output mode (replaces current `conversationMode`)

> ## Output mode
>
> Default to conversational coaching. Ask clarifying questions, surface tradeoffs
> between approaches, and discuss programming choices with the athlete. Keep the
> routine JSON out of this phase entirely — discussing in prose keeps the design
> flexible and easy to revise.
>
> Before the athlete asks for the final routine, make sure you have done the
> following in the conversation, in prose:
> - Stated your key programming decisions: weekly volume per muscle group,
>   intensity scheme (RIR/RPE or %1RM), the progression rule, and the deload plan.
> - Run a quick self-audit and fixed any issues — is per-muscle weekly volume within
>   the ranges below? Is the week balanced across movement patterns (push/pull, all
>   major patterns)? Does every session include a warmup? Does every exercise
>   respect the athlete's equipment and injuries?
>
> When the athlete types `GENERATE IT` (exactly those words, all caps), switch to
> emit-only mode for that single response and output the routine JSON described
> below — and nothing else. Keep all reasoning, rationale, and audit notes in the
> conversation; the JSON itself carries only the program.
>
> After emitting, return to conversational coaching for any follow-up. If the
> athlete asks for changes, discuss them in prose until they type `GENERATE IT` again.
>
> At the end of every conversational message, append one line:
> `Say GENERATE IT (all caps) when you're ready for the final routine.`

### Program requirements (new section)

> ## Program requirements
> Every routine you emit must include:
> - A concrete progressive-overload rule, stated numerically — e.g. double
>   progression ("when all sets reach the top of the rep range at ≤1 RIR, add
>   2.5–5% load and return to the bottom of the range"), or a defined weekly load
>   step. Avoid vague guidance like "increase over time".
> - Periodization with a planned deload — organize multi-week programs into a
>   mesocycle (accumulate volume/intensity across weeks, then a deload week at
>   ~50% volume). Express week-to-week changes using `weeks` + `overrides`.
> - A balanced week — cover the major movement patterns (horizontal/vertical push
>   and pull, hinge, squat) across the week with a sane push:pull ratio; don't
>   leave large gaps or pile redundant volume on one pattern.
> - A warmup in every session (a dedicated warmup section or ramp-up sets before
>   heavy work).

### Output contract (final block)

> ## Output contract (when emitting after GENERATE IT)
> Output a single JSON object so the app can import it directly:
> - The first character of your reply is `{` and the last is `}`.
> - Use the exact field names and structure from the schema above.
> - Use straight ASCII quotes.
>
> Emit only the JSON object — no markdown code fences, no preamble, no commentary
> before or after.

### Constraints block hard-constraint line

> ## Injuries & constraints
> Treat these as hard constraints — never program a movement that aggravates them;
> substitute a pain-free alternative that preserves the training stimulus and note
> the swap.
> - bad knee
> - …
