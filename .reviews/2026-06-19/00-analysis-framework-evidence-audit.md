# Routine Analysis — Framework Evidence Audit

Date: 2026-06-19
Scope: `src/lib/analysis/` (the deterministic engine) + its UI surface and the LLM hand-off.
Method: full read of the engine + UI wiring; digest of `docs/research/program-analysis-research/`
and the 2026-05-05 persona reviews; **six research agents** verifying each methodology against
current (2016–2025) S&C evidence (RP/Israetel, Schoenfeld, Helms/MASS, NSCA, ACSM, Pelland 2024/25).

**Purpose of this doc:** so we don't re-discover the same things. It records (a) the gap between what
was *designed/decided* and what actually *shipped*, (b) evidence verdicts (with citations) on each
framework, and (c) confirmed bugs. Read this before touching the analysis engine.

> **One-line summary:** The deterministic engine is structurally valid **only for general/hypertrophy
> training** but presents a **goal-agnostic A–F grade**. It scores set *counts* against
> hypertrophy-calibrated landmarks and never reads load / %1RM / RIR / rep range / frequency — even
> though `exercise.load` and `exercise.reps` exist on every exercise. A detailed remediation roadmap
> was **"decided 2026-05-06" and then essentially not built** (see the delta table below).

---

> **UPDATE — 2026-06-19 (merge `15c677e`):** The **correctness, honesty & intensity-foundation** subset of
> this audit's findings is now **shipped on master**. Fixed: grade labeled general/hypertrophy-calibrated;
> landmark monotonicity guard; single neutral "untrained" state for zero-set muscles; weekly volume by
> *median* (typical) week not peak; `parseLoad` (%1RM/RPE/RIR/rep-max); **intensity-aware periodization**
> (peak ≠ deload, rising ≠ static) — so the engine is no longer fully intensity-blind; dropped single-week
> penalty; informational (neutral) movement-pattern coverage; dead code removed (`llmPrompt.ts`,
> `isCompound`, `TRAINING_AGE_MULTIPLIER`); de-double-counted periodization scoring; trained-only volume
> note. **Still open** (deliberately deferred to their own brainstorm + plan): the goal-aware engine
> (per-goal landmarks/grade, training-style fingerprint, re-wired `trainingAgeMultiplier`), frequency
> dimension, volume-counting convention, landmark *recalibration* (only the guard shipped, not new values),
> prompt-builder reconciliation, full periodization↔score dedup. Plan +
> per-finding mapping: `docs/superpowers/plans/2026-06-19-analysis-engine-correctness.md`. Sections below
> describe the **pre-fix** state — cross-reference the plan for current status.

> **UPDATE — 2026-07-01:** Five residual findings from the 2026-07-01 review are fixed on master:
> fingerprint reports days/week (was total days across weeks); peak-week detection weighs sets not
> exercises, and an explicit sub-85% %1RM vetoes the low-rep "heavy" fallback; "full body" muscle
> expansion credits each muscle at half the tier weight; the LLM sheet prompt is generated from
> `thresholds.ts` (single source of truth — the divergent inline table and the unkept "JSON for app
> to consume"/profile promises are gone, builder extracted to `src/lib/analysis/sheetPrompt.ts`);
> red session warnings display as "bad" (and surface the red message, not the first warning) and
> `mavLow` now drives a "Productive — lower end" label (severity unchanged).
> Plan: `docs/superpowers/plans/2026-07-01-analysis-residual-fixes.md`.

---

## 1. Architecture (as shipped)

Two tiers — a sound product split (`06-prior-art.md`: "diagnostic, not prescriptive"):

- **Tier 1 — deterministic engine.** `analyzeProgram` (`analyze.ts:27`), wired into the UI at
  `ProgramDetailClient.tsx:314`. Pipeline: `getRenderableDays` → `countWeeklyVolume` per week, then
  **max across weeks** (`analyze.ts:31`) → four scorers (volume/session/balance/periodization) →
  weighted overall (`score.ts`) → `toDisplayAnalysis`. UI: `RoutineAnalysisCard` (`:382`) shows an
  **A–F ScoreBadge**, four dimension chips, a Coverage tab, per-muscle MEV/MAV/MRV bars, ratios, findings.
- **Tier 2 — LLM hand-off.** `LlmAnalysisSheet` (`:449`) builds a reference-data prompt for the user to
  paste into an external chatbot. The JSON it asks for back is **never re-ingested**.

**Three divergent volume tables exist** (a maintenance hazard):
1. `thresholds.ts` `VOLUME_LANDMARKS` — the engine's actual table.
2. `llmPrompt.ts` `VOLUME_REFERENCE` — **dead code** (see §2).
3. `LlmAnalysisSheet.tsx` inline `buildPrompt()` (`:16`) — the user-facing prompt table.

They disagree, and the engine's own table is the *least* evidence-aligned: the sheet uses Glutes MV 0 /
Biceps MEV 6–8 (closer to RP); the engine uses Glutes MV 4 / Biceps MEV 9. On one screen the instant
card can flag "biceps below MEV (need 9)" while the prompt beside it says MEV 6–8.

---

## 2. Designed/decided vs shipped — the delta

The 2026-05-06 decisions (`.reviews/2026-05-05/00-analysis-approach-findings.md`) and the design docs
(`docs/research/program-analysis-research/`) specified a multi-goal-aware engine. **Most of it was
never wired.** Verified against current code (last analysis commit: 2026-05-12):

| Capability | Designed? | Shipped? | Evidence in code |
|---|---|---|---|
| Training-age-adjusted landmarks | Yes — `05` gives `adjusted = base × multiplier` | **No** | `TRAINING_AGE_MULTIPLIER` (`thresholds.ts:58`) defined, **referenced nowhere** |
| Read `exercise.load` (intensity) | Yes — decided 2026-05-06, fuzzy parser | **No** | `load` field (`types.ts:88`) **never read** in `src/lib/analysis`; no `parseLoad` exists |
| Rep-range / intensity distribution | Yes — `04-goal-signatures` | **No** | `parseRepRange`/`repMidpoint` (`muscles.ts:74,84`) called by no live dimension |
| Goal "fingerprint" / style detection | Yes — drives compound:iso band + `goal_coherence` | **Stub** | `toDisplayAnalysis.ts:127` emits `"${n}-day program"`; `fingerprint.secondary` always null |
| `goal_coherence` scoring dimension (0.15) | Yes — `05` | **Removed** | `goals.ts` deleted; weights are 4-dim (`thresholds.ts:49`). Engine got *more* goal-blind |
| Goal-conditional volume landmarks | Yes — strength lifts on strength thresholds | **No** | single `VOLUME_LANDMARKS`, no goal branch |
| Frequency dimension (per-muscle days/wk) | Yes — `00-overview` lists it as a core dim | **No** | `countWeeklyVolume` folds all days into one total; no frequency module |
| Compound:isolation ratio (goal-aware) | Yes — `03` + `05` | **No** | `isCompound` (`muscles.ts:89`) defined, called by no live dimension |
| Neutral movement-pattern display | Decided 2026-05-06 | **No** | `balance.ts:155-167` still pushes red/yellow warnings |
| Drop single-week `−30` penalty | Decided (Tier-1) | **No** | still present at `score.ts:56` |
| `buildLlmAnalysisPrompt` (rich prompt) | Built | **Dead** | not imported anywhere; `LlmAnalysisSheet` has its own inline `buildPrompt()` |

**Already fixed since 2026-05-05 (don't re-report these):**
- Catalog data: 0 empty `movementPatterns` across 3,063 entries (front-squat/pause-squat resolved).
- Hinge → `legs` classification (`muscles.ts:109`); push:pull no longer skewed for posterior-chain programs.
- `serratus anterior → upper_back` (was the anatomically wrong `rotator_cuff`).
- Volume score now **excludes** untrained muscles (`score.ts:22` `effectiveSets > 0` filter) — skipping
  optional muscles no longer drags the score.
- Coverage tab shows untrained muscles neutrally as "Not trained."

---

## 3. Evidence verdicts per framework

Verdict scale: **SOUND** / **DEFENSIBLE** (simplification with known limits) / **QUESTIONABLE** /
**FLAWED / MISLEADING**. Citations are representative, not exhaustive (full list in §6).

### Volume — landmarks (`thresholds.ts:3-23`)
- **QUESTIONABLE values.** A hand-edited RP ~2017–19 derivative that combines the *least* defensible
  parts of two eras: MEVs pulled *below* classic RP (chest/quads/calves/back MEV 5–7 vs RP ~8–10) while
  keeping old, now-questioned high MRVs (side delts/glutes/back 30). [Pelland 2024/25; Baz-Valle 2022]
- Biceps MEV 9 / MAVlo 14 **too high**; rear-delt MEV 2 **too low**; glutes/front-delt floors ignore
  indirect loading (RP sets these to 0 *because* compounds cover them).
- The general heuristic ("~10 sets/wk min, ~10–20 productive, diminishing returns past ~20, count direct
  fully + indirect partially") is **better supported** than a rigid 19-row table. The table is fine as
  scaffolding, not validated per-muscle truth.

### Volume — counting (`volume.ts`)
- 2-tier counting (primary 1.0 / secondary 0.5) is **SOUND** — best-supported convention. [Schoenfeld 2019; Pelland 2024/25]
- **0.25 "incidental" tier is an app invention** — no authority uses three tiers.
- **Double-count bug:** RP landmarks assume *direct-only* counting (RP already discounts indirect work).
  Layering fractional indirect credit on top of RP landmarks **over-reports** volume vs the table being
  compared against. Counting convention ≠ landmark convention.
- **`max-across-weeks` aggregation (`analyze.ts:31`) is FLAWED** — RP's model is a ramp (MEV→MRV→deload);
  the peak week is least representative. Max biases every program toward the MRV ceiling. Use average/typical week.
- **"A set is a set" is the core limitation.** Effective-reps / proximity-to-failure and a ~30%-1RM load
  floor gate whether a set stimulates at all. [Refalo 2023; Lasevicius 2018] The engine has no intensity input.

### Session structure (`session.ts`) — strongest dimension
- **Per-muscle per-session cap ~8: SOUND.** Acute MPS plateaus ~6–10 sets/muscle/session; matches
  Israetel "junk volume" & Remmert/Zourdos 2025 (~11 per-session optimum). **Leave it.**
- **Duration `sets×3+10` (`:31`): DEFENSIBLE default, breaks at extremes** (under-estimates 3–5 min-rest
  strength work 30–50%; over-estimates supersets). The >90 min red flag is fine as a fatigue/adherence
  proxy but **not** as physiology — the "training >60–90 min is catabolic" idea is a debunked myth.
- **Per-session cap counts primary muscles only (`:23`)** → undercounts synergist fatigue.
- Total-sets / exercise-count bands reasonable but **goal-blind** (Sheiko/Smolov days trip red legitimately).

### Balance ratios + patterns (`balance.ts`) — weakest evidence base
- **Core flaw:** 4 of 5 ratios borrow authority from strength/injury **torque** literature but compute
  **set counts**. Sets ≠ strength. Valid only as volume-balance nudges, not injury metrics.
- **Push:Pull pull-favored target (warn >1.0): QUESTIONABLE** — a heuristic with no RCT support,
  contradicted by data (elite throwers run push-dominant and healthy; no strength var predicted shoulder
  injury prospectively [PMC12286157]). The real construct is IR:ER torque. Downgrading at 1.2 is not defensible.
- **Quad:Ham set ratio (1.0–1.67): MISLEADING** — valid construct is H:Q *strength* ratio (itself a weak
  predictor [PMID 29187349]); a *sets* ratio doesn't proxy it. Band arguably backwards (tolerates quad dominance).
- **Upper:Lower & Chest:Back: DEFENSIBLE** volume heuristics — but soften "back protects the shoulder"
  (posture↔shoulder-pain link is weak [S1356689X16306877]).
- **Six patterns: DEFENSIBLE but mis-grained.** Legitimate weekly model (a PPL split satisfies it), but
  drops carry/lunge/rotation, and the **hard all-six weekly gate over-flags** peaking/specialization. Code
  still warns despite the decided neutral-display.
- **Higher-value antagonist checks missing:** anterior:posterior core (McGill), adductor:abductor (>20%
  weakness → 17× groin-injury risk [PMC7400295]), ER:IR cuff.

### Periodization (`periodization.ts`)
- **Set-count trajectory only: MISLEADING for non-hypertrophy.** A linear strength block (sets flat, load
  ↑) is labeled "static / no progression." DUP invisible. Block/conjugate undetectable.
- **Deload = last week ≤70% of peak sets:** blind to intensity/RIR deloads, and **inverts peak weeks**
  (OL peak of heavy singles labeled "deload detected" — highest-risk finding). 70% also lenient (real cuts 30–50%).
- "+1 set/wk" and "deload every 4–6 wk" are **SOUND for hypertrophy** (the RP model) but wrong as universal rules.
- Single-week `−30` penalty (`score.ts:56`) penalizes the most common real-world usage.

### Scoring / grading (`score.ts`)
- Warning→points mapping is transparent but **arbitrary / never goal-validated**.
- **A single goal-agnostic A–F letter is not defensible** — "quality" is goal-relative (the same 5×3 @ 90%
  is an A strength block and an F hypertrophy block). Gate on goal or decompose into sub-scores.

---

## 4. Confirmed bugs / data issues

| # | Issue | Location | Severity |
|---|---|---|---|
| 1 | Hamstrings `mavLow:2 < mev:3` — monotonicity violation | `thresholds.ts:15` | Data bug (UI only; `mavLow` is dead in scoring) |
| 2 | Untrained-muscle severity incoherent: 0 sets → red (chest), yellow (forearms), or **green** (core/neck/rotator_cuff, mv=mev=0) | `volume.ts:53-62` | Misleading display |
| 3 | Same untrained muscle shown 3 ways: red bar (Volume), red "Below maintenance" (Findings), neutral (Coverage) | `volume.ts` + `toDisplayAnalysis.ts` + `RoutineAnalysisCard.tsx` | UX inconsistency |
| 4 | Fractional counting layered on direct-only RP landmarks → over-reports volume | `volume.ts` vs `thresholds.ts` | Methodology |
| 5 | `max-across-weeks` inflates volume toward MRV | `analyze.ts:31` | Methodology |
| 6 | Peak week misclassified as deload | `periodization.ts:35` | Misleading (strength/OL) |
| 7 | Movement-pattern warnings still fire despite decided neutral display | `balance.ts:155-167` | Decided-but-unshipped |
| 8 | `mavLow` stored/displayed but never gates scoring | `volume.ts`, `types.ts` | Dead field |
| 9 | Dead code: `llmPrompt.ts`, `isCompound`, `parseRepRange`/`repMidpoint`, `TRAINING_AGE_MULTIPLIER` | various | Cleanup |

---

## 5. What is genuinely sound (keep)

- 2-tier set counting; `DEFAULT_SETS=3` fallback.
- Per-session ~8 sets/muscle cap (best-grounded threshold in the system).
- Two-tier product framing (instant deterministic check + LLM for nuance) — matches what the
  deterministic tool is evidence-valid *for*: a general-fitness structural nudge.

---

## 6. Sources (from verification agents)

- Schoenfeld, Grgic, Haun, Helms (2019) *Calculating Set-Volume* — PMC6681288
- Pelland/Norton et al. (2024/25) dose-response meta-regression — PMID 41343037 / Sports Medicine
- Schoenfeld/Ogborn/Krieger frequency metas — 2016 PMID 27102172; 2019 PMID 30558493 (frequency not an
  independent hypertrophy driver when volume is equated)
- Refalo et al. (2023) proximity-to-failure — PMC9935748; Lasevicius 2018 (load floor ~30% 1RM)
- Remmert/Zourdos (2025) per-session volume (~11 set optimum)
- Schoenfeld/Ogborn/Krieger (2017) weekly volume dose-response — PMID 27433992; Baz-Valle 2022 (12–20 sets)
- H:Q predictive value: review S2095254622000175; meta PMID 29187349
- Push-dominance in healthy throwers — PMC11359276; CrossFit shoulder cohort — PMC12286157
- Adductor:abductor groin-injury risk — PMC7400295; thoracic posture↔shoulder pain — S1356689X16306877
- RP/Israetel volume landmarks — rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth
- NSCA / ACSM 2026 program-design & rest-interval guidance

> Full per-agent reports (with all URLs) were generated 2026-06-19 during the audit conversation.
> The verdicts above are the cross-validated synthesis.
