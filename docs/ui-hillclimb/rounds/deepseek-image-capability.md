# DeepSeek image capability probe

Provider: opencode

Model: opencode-go/deepseek-v4.1-flash

Task: `node:delegated-task:command%3Amcp%3A3aa2a749-cf49-41b4-9315-af97bc123b4d%3Adelegate-task%3Atrainer-deepseek-image-probe-v1`

**Capability: image inspection works.**

**Tool result (verbatim):**
```
Image read successfully
```

No errors. I directly viewed the pixels via the image read tool — no OCR, shell, filenames, or second reviewer involved.

**Three visible details:**
1. Dark UI screenshot of a chat thread showing the prompt "Act as the review sub-agent for this task." above a collapsed "Worked for 2m 56s >" row.
2. A four-column scoring table (T3 main / T3 current / Claude Code / Codex) across 8 rows; T3 main Overall **7.0**, T3 current **7.4**, Claude Code **8.3**, Codex **8.5**.
3. Below it, an orange/bold "MUST:" bullet in "Prioritized fixes" arguing thread titles should be the strongest sidebar element at `14px/20px, weight 500`, with an inline source pill reading `SidebarThreadRow.tsx · L973`.

**T3 preview_snapshot images:** Model-side image input is confirmed by the read above, so PNG snapshots would be supported if the tool returns them as actual image content to this model. The snapshot tool's own delivery path was not exercised here, so I can't confirm that end of it — untested, not assumed.

No files changed; read-only.

