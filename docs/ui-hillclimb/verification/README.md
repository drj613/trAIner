# Verification evidence

The final candidate’s runtime is recorded in the round 4 manifest. Documentation-only and assertion-copy commits after capture do not alter its UI.

| Check | Evidence | Result |
| --- | --- | --- |
| Whole unit suite | [r04-all-unit.log](r04-all-unit.log) | 133 suites, 1,839 tests passed. |
| Final Snapshot copy | [r04-settings-copy-unit.log](r04-settings-copy-unit.log) | 16 tests passed. |
| Production journeys | [final-clean-production.log](final-clean-production.log), [run metadata](final-clean-run.json) | All 77 selected scenarios pass in one clean build/run on committed code `a3366dd`. Earlier wording-assertion failures and reruns remain recorded. |
| Lint | [final-lint.log](final-lint.log) |Passed. |
| App and test types | [final-types.log](final-types.log) |Passed. |
| Capture types | [final-capture-types.log](final-capture-types.log) |Passed; clean compiler output is empty. |
| Production build and capture | [r04-capture-final.log](r04-capture-final.log) |Build and all 3 capture tests passed; 57 PNG hashes/dimensions and every state’s viewport overflow checked. |
| Taste app scan | [r04-taste-source-final.json](r04-taste-source-final.json) | 0 FAIL, 20 WARN, individually explained in [Taste verification](../taste/verification.md). |
| Workspace browser audit | [r04-taste-inspect-final.json](r04-taste-inspect-final.json) | 0 FAIL, 0 WARN at 1440 / 768 / 390px. All 6 listed images inspected. |

The screenshots use isolated fictional data. Production E2E owns a separate preview server on 4188; capture owns 4173. Neither reuses the development server. The full browser command is `bun run test:e2e:production`; this run selected the 14 changed or related journey files, covering 77 scenarios. The complete repository E2E suite has additional unrelated cases and is not claimed here as fully executed.

Historical failure logs are retained so the sequence remains reviewable. In particular, the baseline Library timeouts were measured as accessible-name query cost in jsdom and fixed in tests without increasing timeouts or changing catalog behavior. The profile goal wording and analysis score assertions were also updated to their actual visible labels. These corrections do not turn historical failed runs into passes.

The final clean production run passed all 77 scenarios with no failures or skips. `catalog:check` also passed. The focused bodyweight edge test verifies that digit-leading free text is preserved until and after commit. The repository’s `bd sync` command is unavailable (`bd: command not found`); follow-up work is tracked in GitHub issue 12 instead.
