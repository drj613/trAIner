# Baseline assessment

The frozen 27-image review set scored 6.2 overall from Sonnet 5.5, 6.6 from Sol, and 6.7 from DeepSeek Flash. All three confirmed direct image inspection and listed every image. The baseline fails the fixed gate.

## Implementation decisions

| Finding | Decision | Evidence and response |
| --- | --- | --- |
| Copy prompt is below long coach text | Accept | All three reviewers identified it. Keep one copy action near the top and available during scrolling; collapse coach reference prose initially. |
| Onboarding links look inert | Accept | Sonnet and DeepSeek identified it. Add explicit current-step actions and a manual builder alternative. Preserve completed state. |
| Faint secondary text | Accept | Sonnet and Sol identified it. Browser measurements confirmed failing token contrast in several themes. Strengthen text tones and test every theme. |
| Inconsistent headers and storage filenames | Accept | All three identified it. Use one visible page-heading pattern and keep storage details out of principal navigation. |
| Dense analysis competes with workout selection | Accept | All three identified cramped metrics. Default to an expandable summary and prioritize the workout action. Preserve analysis logic. |
| Ambiguous workout tools | Accept | All three identified tiny unit/history/edit/replace controls. Add visible text labels and readable prescriptions while preserving logging behavior. |
| Raw file input and unclear disabled controls | Accept | All three identified styling weaknesses. Style the native file chooser, keep semantics, and visibly distinguish disabled actions. |
| Dark Workspace selects Linen | Accept, reproduced | Direct navigation reads settings state before the parent theme effect applies the saved theme. Read the persisted preference when initializing the selected control. A browser test failed before the fix. |
| Restore looks like an ordinary action | Accept | Keep the existing explicit confirmation and distinguish the destructive row. Use plain words for storage protection. |
| Charts lack useful dates and units | Accept | Sonnet and Sol identified missing context. Add sparse date/range labels from real stored data, not invented chart values. |
| Builder can save an empty day | Investigate | A rest day may intentionally contain no exercises. Do not disable valid routines merely to improve a score. Validate actual builder rules before changing behavior. |
| Accessible names missing on workout icons | Clarify | Existing controls already have accessible names. Visible labels still improve discoverability; screenshot evidence cannot establish missing accessible names. |
| Desktop evidence count | Correct report detail | The manifest includes four desktop captures, not three as stated in one limitation. All four IDs were inspected by that reviewer. |

The original full unit run passed 131 suites and failed four cases in Library before any UI edits. An isolated retry passed 17 of 19 Library cases but still timed out in two nested-version cases. These are retained as baseline evidence, not attributed to the visual changes. The first production capture passed all three viewport/theme runs.

Taste Skill was added at the user's request after the baseline. Its app-screen direction influences implementation; it does not change the seven scoring dimensions, the selected screenshots, or the acceptance thresholds.
