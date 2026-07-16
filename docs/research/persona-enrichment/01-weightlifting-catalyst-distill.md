# 01 — `weightlifting` persona × Catalyst Athletics (Greg Everett) — Distilled Learnings

> Distill artifact for the Expert-Source Scan program — see [`00-plan.md`](./00-plan.md) §2 (Distill) and §7 (Review & merge). This is **research-mode** output. The proposed `personas.ts` `block` rewrite is **deferred to editing mode** per plan §7 step 3.

## Provenance
- **Source:** [catalystathletics.com](https://www.catalystathletics.com/) — Greg Everett / Catalyst Athletics (Olympic weightlifting). 641 free articles, 624 exercise demos, 79 programs.
- **Method:** workflow `catalyst-learnings-scan`, run `wf_a2e93896-a3c`, 2026-06-19. ~110 agents, ~2.2M tokens. Harvested 11 article sections → stride-sampled ~86 articles → per-section distill, plus exercise-library + program-structure characterization. Sonnet fleet; Opus synthesis.
- **Raw source:** [`_raw-scans/01-weightlifting-catalyst/`](./_raw-scans/01-weightlifting-catalyst/) — `raw-scan-transcripts.tar.gz` (110 agent transcripts) + `scan-workflow.js`. ⚠️ The clean result JSON was lost to `/tmp` garbage-collection before it could be saved; the agent transcripts in the tarball are the surviving source of record.

## ⚠️ Verification caveat (read before shipping any of this)
The data passed through a `WebFetch (small model) → extract → distill` chain across 110 agents. Confidence splits cleanly:
- **High confidence — qualitative rules, frameworks, decision logic.** Limiter-first selection, quality-as-volume-ceiling, simplify-when-stuck, tiered fatigue, position-first. These are robust core Everett doctrine that survives paraphrase.
- **NOT vouched-for — the specific numbers** (percentages, rep counts, rehab protocols, statistical claims like bombout rates). **Verify each against the source article before it enters persona text or — especially — any analysis-engine logic.**

---

The current `weightlifting` block nails the *destination* (technique, positions, comp-lift centrality) but is thin on the *decision rules and numbers* that make Everett distinctive. Everything below is deduped against the existing block.

## 1. Persona gap-fill — concrete Everett rules not yet in the persona

### Philosophy refinements
- **Only reps at sufficient intensity build positive adaptation — quality is a *ceiling* on volume, not a complement.** If ~95% of a block's volume is performed fatigue-degraded, the block is counterproductive regardless of total volume/intensity. (Program Design — "Programming's Effect on Technique")
- **Complexity is a failure mode, not sophistication.** When stuck, *remove* exercises and clean up structure — "when in doubt, simplify." (Program Design — "Simplify"; OLY General — "Don't Sweat the Small Stuff")
- **Healthy programming lives in a narrow valid band; both underload and overload are diagnostic errors.** Zero misses across a sustained period is an *underload* signal, not virtue. (Program Design — "Minimize Missed Lifts")
- **Percentages are derived empirically from the individual, not read off a table.** Define what the lift should look/feel like at working weight, find the baseline with the athlete, progress linearly, then back-calculate the percentages. Population tables are a day-one prior to discard. (Program Design — "Simplify", 5-step empirical derivation)

### Methodology additions
- **Pull accessories load *heavier than* the comp lift, banded by macrocycle phase: 100–150% of the related lift max in base (≈5 reps), dropping to 90–100% and 2–3 reps near competition.** Logged sample data ≈ clean pulls 125% of clean, snatch pulls 112% of snatch. (Program Design — "Pulling Matters", Sample Week)
- **Volume and intensity move *together*, never independently.** Pair each day as hard (≈80 counted reps, higher intensity) or easy (40–60 counted reps); only reps ≥70% 1RM on primary lifts count toward those totals — light technique/accessory work counts as zero. (Program Design — "Simplify")
- **Controlled lowering is free eccentric volume; dropping the bar throws it away.** Multi-rep sets default to a controlled descent (eccentric carries real, higher fatigue cost); maximal singles are the exception where dropping is appropriate. (OLY Training — "Jerk Lowering")
- **Speed work and strength work occupy separate load zones, sequenced speed-first: 50–70% = speed zone, 80%+ = strength zone — never conflated in the same range.** All concentric reps at maximal intended speed unless a tempo prescription overrides. (OLY Training — "Speed")
- **Default session loading arc is pyramid-to-peak-then-back-off:** ramp from ≈40–50% in 5–10 unit increments, 1–3 heavy top sets, then back-offs at 84–88% of the session peak — not flat working sets. (Program Design — Sample Week)

### New programming principles
- **Set the miss budget and repeat-attempt cap *before* the session, never reactively.** Open-ended "one more try" trains permissiveness and degrades focus. (Program Design — "Minimize Missed Lifts")
- **Diagnose the limiter before prescribing: compare the OLY lift against the basic strength lift.** If the lift is already a high fraction of squat/deadlift, strength is the limiter and more strength helps; a *large* gap means technique/mobility and added strength returns near-zero. (Technique — "Fix The Lift by Finding The Limiter"; 250kg DL / 60kg snatch = strength definitively not the problem)
- **Non-specific or wrong-position accessory work stays "overwhelmingly in the minority" — well under ~20–25% of a movement's volume.** Strength built in one posture doesn't transfer to another; wrong-position work actively programs faults. (Technique — "Get Strong Where You Need to be Strong")
- **One technique correction per session/block.** Cue first; if the cue produces no measurable change, abandon it and switch to a constraint-based drill — don't repeat the cue louder. Constraints that make the wrong movement mechanically costly beat verbal cues for new patterns. (Program Design / Technique — "Technique Correction")
- **A weight you can't hold at lockout/receiving for 3 seconds was never "easy."** Use forceful 3-second position holds as a stability diagnostic baked into receiving movements. (OLY Training — "Routine/Patience")
- **Don't redesign before the program has had time to work: ≥4–8 weeks minimum before a plateau justifies a redesign.** Premature program-hopping resets adaptation and is itself a cause of stagnation. (OLY Training — "Progress"; OLY General — "Hot Streaks")
- **Plateaus clustering just below round-number or previously-failed weights are belief-constrained, not volume-deficient** — prescribe a mental/load-framing strategy, not more volume. (OLY Training — "Psychology")

## 2. Proposed enriched `<principle>` drafts (persona voice)

Discussion candidates — terse/imperative to match the existing block. `[OLY]` = strongly Olympic-specific; `[T]` = broadly transferable. **Not yet a block diff — that's editing mode (plan §7).**

```
- Only reps at 70% of best or above count as training. Light technique work is rehearsal, not volume — do not let a session of empty bar fool you into thinking you trained.  [OLY-leaning, T-adaptable]
- Pull heavier than you lift. Snatch and clean pulls live at 100-150% of the related max in the base phase, dropping to 90-100% near competition. A pull that never exceeds the comp lift builds nothing in reserve.  [OLY]
- Volume and intensity travel together. A hard day is heavy and ~80 counted reps; an easy day is lighter and 40-60. High volume at low intensity every day is the mark of someone who is busy, not training.  [T]
- Lower the bar under control whenever the set is more than a single. The descent is free strength; dropping it is volume left on the platform.  [OLY]
- Speed lives at 50-70%, strength at 80% and above. Train them in that order in the session and never in the same loading range — mix them and you blunt both.  [T]
- Decide your miss budget before the bar is loaded. Set the maximum misses and repeats for the session in advance; "one more try" decided in the moment is how a workout becomes a grind.  [OLY-leaning, T]
- Find the limiter before adding work. If the lift is already a high fraction of the squat, get stronger; if there is a large gap, no amount of squatting fixes it — the problem is technique or position.  [T]
- Correct one thing at a time. Cue once; if the cue changes nothing, stop cueing and build a drill that makes the fault impossible. Stacking corrections overwhelms the athlete and muddies the signal.  [T]
- Keep non-specific accessory work in the minority — well under a quarter of a movement's volume. Strength built in the wrong position does not transfer to the right one, and may train a fault.  [OLY-leaning, T]
- A weight you cannot hold for three seconds overhead was not light — it was caught and dropped before it could expose you. Use the hold as a test, not a formality.  [OLY]
- When the lift is stuck, simplify before you complicate. Strip back to the primary lifts and the squat, cut the accessory clutter, and run it clean — added variables are usually the disease, not the cure.  [T]
- Give the program time. A plateau before 4-8 weeks is not a verdict on the program; a plateau just under a round number is usually belief, not capacity. Address the head before changing the plan.  [T]
```

## 3. Secondary opportunities beyond the persona (plan §6 feed)

Tagged by trAIner subsystem. These feed the deferred goal-aware work, **not** this persona pass — tracked here so the scan is mined once for both.

- **[exercise-data-model] Add an exercise `role` field — the single biggest gap.** Catalyst distinguishes `competition_lift | lift_variation | strength_assistance | technique_primer | prehab_rehab | conditioning`. The current catalog has anatomy but no role. → Lets the builder constrain selection (warm-up → primers, main → comp/variation, supplemental → assistance) and lets analysis flag role gaps.
- **[exercise-data-model] Add fault/cue library + variation graph.** Catalyst's `common_errors` + `execution_cues` + cross-linked `variations` are exactly the corrective-cue and substitution data the catalog lacks. → Match a logged fault tag to the exercise's fault library and surface the cue; use the variation graph for equipment/injury substitution.
- **[exercise-data-model] Add `complexity_tier`, `force_velocity_zone`, `chain_affiliation`, `position` (torso angle, knee-dominance).** → Enables complexity-descending session ordering, speed/strength zone coverage audits, anterior/posterior chain-balance checks, position-congruent accessory selection.
- **[analysis-engine] Two-sided miss-rate diagnostic.** Healthy ≈ small positive fraction (<~10%, likely <5%); 0% across sessions = underload, large fraction = overload. → Parse failed/short sets; flag both extremes.
- **[analysis-engine] Limiter classification as a first-class output.** Strength-to-skill ratios → `limiter = strength | technique | mobility | unknown`. → The hard constraint the goal-aware builder reads to *suppress* "add weight" when strength isn't the limiter.
- **[analysis-engine] Three-tier fatigue weighting** (primary = heavy, supplemental/pulls = moderate, accessory = near-zero), with an amplifier for controlled-eccentric work. → Replaces set-count-only counting.
- **[analysis-engine] Injury-risk asymmetry scorer.** Wrist/tendon/elbow recover slowly; a volume spike there warrants a stronger warning than the same spike in a muscle belly. → Per-exercise injury-risk weight feeding volume-spike severity.
- **[progression] Miss-rate as a progression gate.** N consecutive over-threshold sessions → suppress load progression / deload; M zero-miss sessions → accelerate.
- **[progression] Deload-before-first-heavy-week as a universal rule** — insert a lighter week before any block ramping to 5RM-or-heavier work.
- **[recovery-fatigue] Shared finite recovery budget** — appending conditioning *requires* trimming volume elsewhere, never additive; conditioning minimized in peak week.
- **[recovery-fatigue] Sleep-gating above subjective metrics** — a low-sleep session's misses shouldn't count toward fatigue/plateau signals; ~50/50 physical-mental readiness heuristic. (Requires sleep/mood/stress as first-class log fields.)
- **[psychology/adherence] Three-question post-session journal** (pride / improve / next-goal; answers must name a weight/movement/rep). → "next-goal" becomes a hard constraint for the next routine; goal-hit rate becomes an analysis metric.
- **[psychology/adherence] Trajectory-only display, never rank/percentile;** keep generated coaching language calm (alarming deficit language suppresses performance). → Hard UX/output constraint.
- **[prompt-builder-general] Cap corrections at 3/rep (one per phase) and analysis output at 1 primary + 2–3 secondary findings** ("first and worst" ranking + progressive disclosure). Plus a **positive-action cue polarity check** (directives, never restrictions).

## 4. The gold — concrete quantitative rules (⚠️ verify before use)

- **≥70% 1RM** = floor for a rep to count as productive volume on primary lifts.
- **~95%** = if that fraction of a block's volume is below-average technique due to fatigue → deload.
- **~80 counted reps** = hard-day target; **40–60** = easy-day target.
- **Pull load bands: 100–150% base / 90–100% peak**; logged ~clean pull 125%, snatch pull 112% of related max.
- **Pyramid arc:** ramp ~40–50% → 1–3 top sets → back-offs at 84–88% of session peak.
- **Healthy miss rate <~10% (likely <5%); 0% = underload.**
- **Speed zone 50–70% / strength zone 80%+, speed first.**
- **3-second hold** = overhead/receiving stability test threshold.
- **4–8 weeks** = minimum program age before a plateau justifies redesign.
- **~15 min/week** = maintenance ceiling for a non-prioritized accessory quality; 4-week 5-3-1-deload micro-block for a barbell accessory.
- **Limiter ratio gate:** OLY lift high % of squat/DL → strength limiter; large gap → technique/mobility.
- **Non-specific accessory <~20–25%** of a movement pattern's volume.
- **Jerk-drive isolation drill: 4×3–4** submaximal at session end; foot-angle start ≈ 20–30° toe-out.
- **Opener / week-1 load = PR − 5kg, or ~85–90% of recent max; never within 1–2% of PR.**
- **A-event cap: 2–3/year, 12–24-week peaking cycle; B/C tune-ups = 0–1 week back-off; technique-limited athletes target 6-for-6.**
- **~10–15% miss/regression tolerance; ~11% elite bombout rate** = empirical prior.
- **Bodyweight deviation >5% over 4 weeks** (no cut/bulk goal) = performance-risk flag; ≈1.65–1.70 lb/inch for male strength athletes.
- **Hot-streak ceiling ~10 lb/month (~4.5 kg) per lift** = upper bound, never a projection baseline.
- **Gear/technique-change cooldown ~2–4 weeks** suppressing plateau flags; pre-peak variance window 2–4 weeks before a goal event.
- **Meditation 10–15 min/day; visualization morning + pre-sleep; ≤3 cues/rep; 1 correction/session; 1–2 findings surfaced.**
- **Injury:** patellar-tendonitis re-entry 50–60% × 8–10 × 3–5 sets; rep ladder 8–10 → 6 → 5 (~2 wks each); ACL 9–12 months; ice 10-min bouts acute / contrast 10-heat-10-ice sub-acute.
- **Mobility:** gaps >2–3 days drive regression; six overhead categories ≥1×/week; conditioning rotation 20–60 sec/station.
- **Nutrition:** hydration first; one treat/week; batch-cook 2-day cadence; comp-day hydration = 2× perceived need.

---

## Cross-cutting notes
1. The highest-leverage **data-model** change the scan keeps pointing at is an exercise **`role` field + per-exercise fault/cue library** — it unblocks corrective cueing, role-aware selection, and role-gap analysis at once (plan §6).
2. The scan strongly **reinforces the existing anti-anchoring rule** and adds a named rationale (workload over-generalization from an elite-calibrated baseline; hot-streak over-projection) — keep front-of-mind so persona enrichment doesn't drift into feeding structural templates.

## Next steps (plan §7)
- [x] **1. Distill** — this doc.
- [ ] **2. Propose `block` rewrite** for `weightlifting` in `src/lib/prompts/personas.ts` — **editing mode** (deferred).
- [ ] **3. Human review** of the diff.
- [ ] **4. Merge + append** a `weightlifting → Catalyst (2026-06-19)` line to `personas-lineage.md`.
