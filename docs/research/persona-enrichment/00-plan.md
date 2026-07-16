# Persona Enrichment via Expert-Source Scans — Plan

**Status:** Proposed (2026-06-19)
**Decisions:** 2026-06-24 — video-first sources resolved to **articles-only, no transcript pipeline** (Open decision #3).
**Origin:** The Catalyst Athletics → Olympic Weightlifting persona scan (workflow `catalyst-learnings-scan`) proved a repeatable pattern: point a fleet of agents at a coach's large free content archive, distill the *transferable methodology*, and use it to deepen one persona's `block` in `src/lib/prompts/personas.ts`.

This plan generalizes that into a recurring program: enrich each of the 13 bundled personas from the best free-content authority (or **mix of authorities**) for that specialty, via repeated refinement passes.

---

## 1. Why personas are the right target

- **Lowest risk, highest leverage.** A persona is just prose (`philosophy` / `methodology` / `programming_principles[]`) in `personas.ts`. Editing it ships instantly, touches no data model, no analysis math, and can't regress logged data.
- **The schema is the ingestion contract.** Each scan's distilled output maps directly onto the three `block` fields. No new structures needed.
- **It compounds.** The same scan output is a *secondary* feed for the bigger, deferred work (goal-conditional analysis landmarks, catalog role/cue enrichment) — see §6.

The 13 personas today: `rp` (Hypertrophy/RP), `rip` (Linear/Rippetoe), `pl` (Powerlifting), `minimal` (Minimalist), `strongfirst` (Kettlebell), `weightlifting` (Olympic — **enriched first, via Catalyst**), `glutes`, `mob` (Mobility), `metcon` (Conditioning), `physiq` (Physique), `calisthenics`, `bands`, `powerbuilding`.

---

## 2. The reusable pattern: "Expert-Source Scan"

Generalized from `catalyst-learnings-scan` (script saved under the session's `workflows/scripts/`). Parameterize per run:

**Inputs**
- `persona` — the target persona id whose `block` we'll deepen.
- `source(s)` — base domain(s) + the index/section URL structure (articles list, blog archive, etc.).
- `sections` — the category taxonomy to fan out over, with per-section sample sizes.

**Stages** (pipeline, per section)
1. **Harvest** — fetch section/index pages, collect article URLs (absolute, deduped).
2. **Read** — read a representative *stride-sample* per section; extract concrete principles, numbers, ratios, decision rules, frameworks, and OLY/specialty-specific caveats. Frame every extraction as: *which part of trAIner could this inform, and how.*
3. **Distill** — per-section synthesis: themes, core transferable principles, frameworks, notable rules (keep the numbers).
4. **Synthesize-to-persona** (done by the main loop in Opus, not the fleet) — fold distillations into a proposed rewrite of the persona's `philosophy` / `methodology` / `programming_principles`, preserving a single coherent coaching voice.

**Models/cost** — fleet runs on Sonnet (extraction is well within it); reserve Opus for the final persona-mapping synthesis. ~80–120 agents per source is a reasonable "large fleet" without reading the whole archive.

**Output artifacts** (per pass, stored in this folder)
- `NN-<persona>-<source>-distill.md` — raw distilled learnings.
- A proposed `block` diff for `personas.ts` (reviewed before merge).
- A line in the persona's **source lineage** note (§7).

---

## 3. Candidate source map

Confidence = how likely the source has a **large, free, *text* archive** scannable the Catalyst way. Video-first authorities are flagged — WebFetch can't read video, so they need a transcript approach or we lean on their written articles only.

| Persona | Primary candidate | Supplementary (mix) | Medium | Confidence | Notes |
|---|---|---|---|---|---|
| `weightlifting` | **Catalyst Athletics** (Greg Everett) | — | text | ✅ done | 641 articles + 624 exercises; pass complete |
| `rip` Linear | **Starting Strength** (Rippetoe) | — | text | High | Large free articles archive + forum; near-direct analog |
| `strongfirst` Kettlebell | **StrongFirst blog** (Pavel) | Dan John (KB) | text | High | Long free blog archive |
| `glutes` | **Bret Contreras blog** | — | text | High | Deep free archive, the "Glute Guy" |
| `minimal` Minimalist | **Dan John** (danjohn.net) | T-Nation archive | text | High | Park/bus-bench, carries — but content spread across sites |
| `pl` Powerlifting | **Stronger By Science** (Nuckols) | Juggernaut (JTS), Westside | text | High | SBS = huge free evidence-based corpus |
| `powerbuilding` | **Stronger By Science** | Juggernaut, Brian Alsruhe | text+video | Med-High | Blend; Alsruhe is video-first |
| `rp` Hypertrophy | **Renaissance Periodization** | Stronger By Science | video+text | Medium | RP increasingly video/app; SBS backstops the science |
| `mob` Mobility | **The Ready State / MobilityWOD** (K. Starrett) | GMB Fitness | text | Medium | Older free blog archive; FRC/Spina mostly paid |
| `metcon` Conditioning | **Joel Jamieson — 8weeksout** | CrossFit.com archive | text | Medium | Energy-system science; CrossFit mix free/paid |
| `calisthenics` | **Steven Low** (Eat Move Improve) + r/bwf wiki | GMB, Al Kavadlo | text | Medium | "Overcoming Gravity" author; rigorous progressions |
| `physiq` Physique | **3DMJ** (Eric Helms) | Jeff Nippard | text+video | Medium | Much depth lives in (paid) books; Nippard video-first |
| `bands` | Dave Schmitz (RBT); Westside (accommodating resistance) | — | fragmented | Low | Weakest single free text authority; may stay thin or fold into `pl`/`powerbuilding` |

**Design note — "mix of experts" per persona.** Several personas are best served by blending 2–3 authorities (e.g., powerlifting from SBS + Juggernaut + Westside conjugate). When blending: extract from each independently, dedupe overlapping principles, then synthesize into **one coherent voice** — not a committee. The persona should still read as a single coach.

---

## 4. Guardrails

- **Anti-anchoring (carry over the existing rule).** We extract *principles, rules, numbers, frameworks* — ideas, not prose. We never copy article text into the persona, and we never feed an existing routine to be mimicked. (Consistent with the project's anti-anchoring stance.)
- **Voice coherence.** Each persona is one coach. Blended sources get reconciled into a single tone; contradictory doctrines are resolved (pick the persona's stated philosophy as tiebreaker) rather than stacked.
- **Legal/ToS.** Read only publicly free pages; extract facts/methodology (not copyrightable expression); attribute source lineage internally (§7), not necessarily in shipped persona text. Respect each site's robots/ToS.
- **Video-first sources — articles-only (decided 2026-06-24).** The Catalyst pattern only works on text archives. We do **not** build a transcript-fetching pipeline (yt-dlp/Gemini/managed APIs) — the maintenance and per-source effort isn't justified for prose enrichment. For video-heavy authorities (RP, Nippard, Alsruhe), restrict the scan to their **free written content** (articles, blogs, free PDFs/guides, podcast show-notes). The loss is small: most of this roster has enough free text, and the science is backstopped by text-first sources (SBS, Juggernaut). **Ad-hoc exception:** if a single video is judged irreplaceable, hand-drop its transcript as a `NN-<persona>-<source>-transcript.md` into the scan folder — the read/distill stage treats it as a normal text source. This is manual and per-video, not an automated harvest.
- **Specialty caveat filtering.** Keep the transferable layer; drop sport-specific minutiae that doesn't generalize (the read prompt already separates `transferable_principles` from `*_specific_caveats`).

---

## 5. Phased rollout

- **Phase 0 — Source vetting (small workflow).** Fan out one agent per persona to confirm, for each candidate: does a large *free text* archive exist? what's the index/section URL structure? ToS posture? video-vs-text mix? Output: a go/no-go + concrete URL structure per source. Cheap; de-risks every later pass.
- **Phase 1 — High-confidence text analogs.** Run the Expert-Source Scan on the ✅/High rows: `rip` (Starting Strength), `strongfirst` (StrongFirst), `glutes` (Bret Contreras), `minimal` (Dan John), `pl` (Stronger By Science).
- **Phase 2 — Blended/multi-expert.** `powerbuilding`, `rp`, `metcon` — run multiple sources, dedupe, synthesize to one voice.
- **Phase 3 — Harder mediums.** `mob`, `calisthenics`, `physiq` (articles-only per the §4 decision; ad-hoc hand-dropped transcript only for an irreplaceable video), and decide `bands` (enrich, or fold its accommodating-resistance ideas into `pl`/`powerbuilding`).
- **Ongoing — Refinement passes.** Re-run any persona against an additional expert when we want more depth. Each pass is additive and reviewed before merge.

Rough order of value: personas users pick most often, and those whose current `block` is thinnest, go first. (Confirm priority with usage intuition before kicking off Phase 1.)

---

## 6. Secondary payoffs (same scan output, bigger surfaces)

The distilled output isn't only persona prose. It also feeds the deferred, goal-aware work:
- **Goal-conditional analysis landmarks** — specialty-correct volume/intensity/frequency targets (e.g., strength vs hypertrophy vs OL) instead of the current universal RP landmarks.
- **Exercise catalog enrichment** — exercise *role* (primary/strength vs accessory), fault→cue libraries, and "which variant fixes which limiter" mappings, which the catalog currently lacks.

These are tracked separately (analysis-engine roadmap) — noted here so each scan is mined for both.

---

## 7. Review & merge workflow

1. Scan produces `NN-<persona>-<source>-distill.md` in this folder.
2. Main loop drafts a proposed `block` rewrite (philosophy/methodology/principles).
3. Human review of the diff against `personas.ts` (editing mode — explicitly separate from research mode).
4. Merge; append a **source lineage** line to a `personas-lineage.md` here recording which experts informed which persona and when (for provenance + so we don't re-scan the same source twice).

---

## 8. Open decisions for the user

1. **Priority order** for Phase 1 (default proposed in §5).
2. **`bands`** — give it its own scan, or fold into powerlifting/powerbuilding?
3. ~~**Video-first sources** (RP, Nippard, Alsruhe) — articles-only, or invest in transcript fetching?~~ **Resolved 2026-06-24: articles-only, no transcript pipeline** (see §4). Ad-hoc hand-dropped transcripts permitted per-video for irreplaceable content.
4. Whether to run **Phase 0 source-vetting** as its own workflow first (recommended) or vet inline at the start of each pass.
