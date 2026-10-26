# UI hillclimb

This is the repeatable UI review loop for trAIner. It uses real browser captures of fixed fictional training data, independent reviews, small UI changes, and recapture. Scores describe reviewer judgments, not an objective measurement of design quality.

The review panel is Claude Sonnet 5.5, GPT-6.1 Sol, and DeepSeek V4.1 Flash. Each review task starts in a fresh context and stays read-only. The model families overlap with the implementation workers, so independence means separate task contexts, not a panel of model families excluded from implementation. Reviewers see prior findings and implementation responses; this may anchor their judgments. Each round starts fresh reviewer tasks with the same brief and screenshot set. Reviewers must actually open the images and report which files they inspected. A model that cannot inspect images must report that limitation and must not invent visual scores.

## Acceptance gate

The initial gate was fixed before baseline review:

- Each reviewer gives the current UI at least 8.5 out of 10 overall.
- No scored category from any reviewer is below 8.
- No unresolved major or critical usability issue remains in the reviewed journeys.
- Lint, type checks, the build, and relevant behavior tests pass.
- The final screenshot set uses the same fixture, themes, screen states, and viewport dimensions as the baseline.

Passing requires the complete panel. Missing reviews, unreadable screenshots, and source-only reviews do not count as visual passes. Record failures and disagreements rather than averaging them away.

## Review dimensions

All dimensions use the same ten-point scale. A 5 has clear recurring problems, a 7 is usable with several visible weaknesses, an 8 is strong with minor issues, a 9 is consistently clear and polished, and a 10 has no meaningful issue visible in the supplied evidence. Reviewers should use decimals when helpful and explain deductions with screen-specific evidence.

| Dimension | What to inspect |
| --- | --- |
| Typography | Readable sizes, line height, text hierarchy, labels, and tabular numbers. |
| Hierarchy | The current task, screen title, primary action, and secondary information have clear priority. |
| Spacing and density | Grouping, alignment, whitespace, tap spacing, and useful information within the viewport. |
| Color and contrast | Legible foregrounds, distinct interactive states, restrained semantic colors, and parity across themes. |
| Iconography | Consistent symbols, understandable meaning, and text or accessible names for ambiguous actions. |
| Consistency and polish | Shared controls, surfaces, borders, alignment, and feedback feel like the same application. |
| Clarity and usability | The user understands where they are, what to do next, and how to recover from the shown error or empty state. |

Overall is a separate holistic judgment. The reviewer must explain if it differs substantially from the category mean. Screenshots alone cannot prove keyboard behavior, screen-reader behavior, persistence, or real contrast ratios. Use the live browser and tests to verify those claims.

## Run a round

1. Capture the fixed screen states with the documented user-flow capture command. Keep the first captures unchanged as the baseline.
2. Freeze the candidate screenshots before dispatching reviews. Save a manifest with revision, file paths, hashes, fixture, viewport, and theme.
3. Dispatch three fresh read-only child tasks through T3 `delegate_task`. Use provider `claudeAgent`, model `claude-sonnet-5-5`; provider `codex`, model `gpt-6.1-sol`; and provider `opencode`, model `opencode-go/deepseek-v4.1-flash`.
4. Give every reviewer [the same brief](reviewer-brief.md), the same screenshot manifest, the original intent, and any prior findings with the implementation response and unresolved objections. Keep other reviewers' current-round outputs private until all have finished.
5. Save each raw response under `rounds/`. Confirm that the model and provider returned by T3 match the requested selection. An unavailable model is a recorded blocker, not permission to silently substitute.
6. Reproduce reported problems in the browser. Record whether each finding is accepted, deferred, or dismissed, with a reason. Prefer issues multiple reviewers found independently, but investigate concrete single-reviewer issues too.
7. Fix accepted issues. Add a failing behavior test first when a change affects behavior. For visual-only changes, use the actual screenshots, layout measurements, and existing regression tests.
8. Run checks, recapture with the same fixture, and repeat independent review. Never change the rubric, crop away problem areas, or remove failing screens to obtain higher scores.
9. Apply the acceptance gate to the complete final panel. Report the actual scores and any unmet condition. Refresh the screenshot-backed user flows from the final UI.

The [decision log](decisions.tsv) records choices and evidence. Round reports retain raw scores and the implementation response. Baseline captures remain separate from current documentation screenshots.

## Check a recorded round

A normalized round JSON contains the review screenshot IDs, verification results, and all three reviewers' scores, inspected screenshot IDs, direct-image capability, and unresolved major issues. Raw reviewer responses remain alongside it.

```bash
bun scripts/ui-hillclimb/check-round.ts docs/ui-hillclimb/rounds/00-baseline.json
```

The command exits unsuccessfully if any part of the fixed gate is missing or fails. The gate has regression tests in `scripts/ui-hillclimb/gate.test.ts`. It checks report completeness and scores; it does not replace inspecting the images, reproducing findings, or verifying the reported test results.

The fixed review selection includes every mobile light state: onboarding, navigation drawer, four import states, profile, prompts, routines, routine overview and map, builder, workout, exercise history, summary, history and export, library, and workspace. Dark mobile captures add workout, routine overview, library, and workspace. Desktop captures add workout, routines, history, and prompts. This selection was fixed before baseline scoring. Broader capture sets remain available for investigation.

## Results

| Round | Sonnet 5.5 | Sol | DeepSeek 4.1 Flash | Gate |
| --- | --- | --- | --- | --- |
| [Baseline](rounds/00-baseline/assessment.md) |6.2|6.6|6.7|Failed|
| [1](rounds/01-candidate/assessment.md) |7.0|8.0|8.1|Failed|
| [2](rounds/02-candidate/assessment.md) |7.8|8.5|8.4|Failed|
| [3](rounds/03-candidate/assessment.md) |8.3|8.7|8.6|Failed|
| [4](rounds/04-candidate/assessment.md) |8.5|8.9|8.7|Passed|

All categories in round 4 are at least 8 and no reviewer reports a major issue. The [normalized report](rounds/04-candidate.json) passes the unchanged gate. Minor findings remain in the raw reviews; a passing score is not a claim of perfect UI.

The visual panel covers 27 of 57 captures: all 19 mobile light states, four dark mobile states and four desktop states. The capture tests and hash/dimension checks cover all 57. The preserved baseline includes all 57 original images, with `.frozen` guards in review directories.

The [verification summary](verification/README.md), [Taste audit](taste/verification.md), [decision-trail audit](trail-audit.md) and [audit response](trail-audit-response.md) state the checks and their limits. The audit was performed by Sonnet 5.5against the transcript, not by the root implementer. Native Codex image views are not fully itemized in T3 activity; that audit cannot independently confirm every root image inspection.
