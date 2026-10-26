# Capture directories and review rounds

Temporary capture attempts count builds, while review rounds count panels. The commands in manifests are the commands actually executed and have not been relabeled retroactively.

| Capture output under `/tmp/trainer-ui-hillclimb/` | Review evidence |
| --- | --- |
| `baseline` | Round 0 baseline, preserved all 57 PNGs. |
| `round-01` | Round 1 candidate. |
| `round-02` | Shell preflight, not scored. |
| `round-03` | Round 2 candidate. |
| `round-04` | Rejected Library-overflow preflight, not scored. |
| `round-05` | Round 3 candidate. |
| `round-06` | Round 4 preflight before shorter Snapshot copy, not scored. |
| `round-07` | Round 4 candidate, source revision `f98f41c`. |

The tracked `rounds/*/manifest.json` paths resolve inside the repository and retain hashes, source revision and actual command. The tracked user-flow screenshots are refreshed from round 4. Temporary capture paths are provenance, not a dependency for viewing the diagrams or reading retained review evidence.
