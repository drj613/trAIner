---
target: today
total_score: 25
p0_count: 1
p1_count: 3
timestamp: 2026-07-15T22-12-52Z
slug: src-components-workout-todayclient-tsx
---
Method: dual-agent (A: design-review · B: detector+browser)
Target: /today → `src/components/workout/TodayClient.tsx` (redirects to `WorkoutDayClient` — the real logging surface)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Autosave "saved" is a 10px `--fg-4` whisper; "Loading…" doubles as the not-found state |
| 2 | Match System / Real World | 3 | Cell DSL (`+`, `!`, `bw`, `skip`, `×`) is invented notation, not lifter-native |
| 3 | User Control and Freedom | 3 | No undo after Finish auto-navigates (800ms); Skip sits beside Finish |
| 4 | Consistency and Standards | 2 | Three button systems (.btn / legacy .button / Tailwind), inline-style sprawl, 20px titles break own Small-Type rule |
| 5 | Error Prevention | 2 | "Skip day" adjacent to "Finish"; can Finish a 0% session with no confirm |
| 6 | Recognition Rather Than Recall | 2 | Format legend hidden at 10px `--fg-4`; prescribed target shown only on set 1 |
| 7 | Flexibility and Efficiency | 3 | Enter-advances-cell, add-set, replace/history/edit strong; density modes bypassed by inline sizes |
| 8 | Aesthetic and Minimalist | 3 | Calm and dense, but Sparkles AI icon + equal-weight row icons add noise |
| 9 | Error Recovery | 2 | Autosave failure is a 10px string, no recovery action; load/not-found conflated |
| 10 | Help and Documentation | 2 | Help buried; onboarding lists steps but never teaches the cell DSL |
| **Total** | | **25/40** | **Acceptable — solid instrument, under-disciplined against its own system** |

## Anti-Patterns Verdict

**LLM assessment:** Mostly earned familiarity. The dense mono-figure logbook reads as a genuine instrument; a Linear/Raycast user would trust the resting screen. Two real tells: (1) the unlabeled **Sparkles "Modify with AI" icon** (WorkoutDayClient:1023) is exactly the generative-AI decoration the anti-refs reject; (2) **three coexisting button vocabularies** plus a Lucide-icons/Unicode-glyphs mix (`▾ ✓ → ‹ ›`) cause a subtle trust pause. Not slop — under-disciplined.

**Deterministic scan** (`detect.mjs`, exit 2, 10 findings across 4 files):
- **4 false positives** — all `var(--r, 6px)` / `var(--bg, #f6f7f9)` fallbacks, not drift.
- **`side-tab` warning** WorkoutDayClient:255 (`borderLeft: 3px solid var(--sec)`) — this is the section-kind rail. Per DESIGN.md it's the **one sanctioned colored edge** (semantic token, applied to section wrappers not content cards, user-toggleable via `data-rails`). Verdict: intentional, on-brand — **not** a violation.
- **`layout-transition` warning** WorkoutDayClient:353 — `transition: width .3s` on the progress-bar fill animates a layout property. Real, minor.
- **Real minor drift:** `#fff` hardcode (TodayClient:113), `.group-tag` 10px font (globals.css:384), scrollbar `border-radius: 3px` (off-scale).

**Visual evidence:** No injected overlay (Assessment B captured real screenshots instead of the detect.js overlay). 6 screenshots across onboarding + logging, desktop + mobile, Editor (dark) + Linen (light). Zero console errors in any state. Confirmed: small touch targets (~28–34px inputs, ~20px icon buttons), cramped bottom action row at 390px, and low-contrast muted mono text — worst in the **default light (Linen) theme**.

## Overall Impression

The resting logbook is genuinely good — mono tabular figures, section rails, calm density. It reads like a tool, not a fitness app, which is the whole point. But the screen fails at the exact moment it's used: **one-handed, mid-set, on a phone.** Every interactive target is under 44px, the primary "Finish" action doesn't lead, and the most satisfying moment (finishing) is thrown away with no summary. Biggest single opportunity: **make the mid-workout surface thumb-first** — targets, action hierarchy, and a closing readout.

## What's Working

1. **Mono/tabular figure discipline is real** — prescriptions, `done/total`, cells all use `var(--font-mono)` tabular-nums. The DESIGN signature is honored and it makes the log feel like an instrument.
2. **Section/group rail encoding** (`--sec` left rail, GroupRail SUPERSET/CIRCUIT bracket) is the sanctioned colored-edge system used correctly — type-encoding, not decoration. Detector flagged it; it's intentional.
3. **Read-only historical sessions are careful** — `viewing` mode, "Viewing completed session from {date}" banner, and the guard that autosave never writes in non-active mode show real correctness care.

## Priority Issues

**[P0] Touch targets fail the core mid-set use case.**
- *What:* SetCell renders `height:30, width:70` (SetCell.tsx:68); compact mode 22px; row icons (history/edit/replace) ~19–20px; add-set 28×28; rest-timer + chevrons ~19px; bottom-bar buttons ~28px. Screenshots confirm at 390px.
- *Why:* PRODUCT's primary context is "in the gym, mid-set, phone in one hand." Every control is a fat-finger hazard where precision is lowest.
- *Fix:* raise interactive hit-area to ≥44px (pad the input, keep the visual cell tight via inner box); expand icon-button hit targets; add a min-touch-size token.
- *Suggested command:* `/impeccable adapt` → `/impeccable harden`

**[P1] Muted text fails WCAG AA — and the default theme is the light one.**
- *What:* `--fg-4` (#a4abb4 linen / #a8a187 paper) carries the onboarding `→`, "+ add note", and the 9–10px format guide; `--fg-3` carries meta/prescription/timer. `--fg-4` on light bg ≈1.9:1, `--fg-3` ≈3.4:1 — both below 4.5:1. `ThemeProvider.tsx:6` defaults to **linen (light)**, so fresh users land exactly where contrast is worst (confirmed in screenshots).
- *Why:* PRODUCT commits to "readable contrast across every theme." 9–10px legend text at ~1.9:1 is effectively invisible.
- *Fix:* darken `--fg-3`/`--fg-4` in linen/paper; never use `--fg-4` for text below ~12px; raise the sub-12px legend sizes.
- *Suggested command:* `/impeccable colorize` (contrast pass) / `/impeccable audit`

**[P1] The bottom action bar buries the primary and courts a destructive mis-tap.**
- *What:* "Finish workout" only gets accent styling at `pct === 100` (WorkoutDayClient:465) — the rest of the time it's a plain `.btn` equal to "Day note" and "Skip day", which sits immediately to its left. At 390px the strip is cramped at ~28px targets (screenshot).
- *Why:* The one action that commits the session should always lead; "Skip day" discards the session and is one thumb-slip from Finish, irreversible after the 800ms auto-navigate.
- *Fix:* make Finish accent whenever the session is active; demote Skip/Day-note to ghost; separate Skip (header overflow or clear spacing), never immediately left of primary.
- *Suggested command:* `/impeccable layout` → `/impeccable harden`

**[P1] Finishing discards the session — peak-end violated, trust signal faint.**
- *What:* On Finish, a fleeting "Saved" then auto-navigate to the next day after 800ms (WorkoutDayClient:723) with **no summary** — no volume total, no PRs-hit recap. Mid-set autosave failure surfaces only as a 10px `--fg-4`→`--bad` string.
- *Why:* For a local-first tool whose entire promise is a *trustworthy* log, the closing moment a lifter most wants is thrown away, and the save-confirmation is the faintest thing on screen.
- *Fix:* add a session-complete readout (volume, sets done, PRs) before/instead of the auto-jump; make the save state a real, legible status with a retry on failure.
- *Suggested command:* `/impeccable shape` (session summary) / `/impeccable harden`

**[P2] The cell DSL is powerful but undiscoverable, and teaches an untypeable glyph.**
- *What:* Logging depends on a typed micro-syntax (`70×8`, `+70×8`, `bw×15`, `70×8!`, `skip`, `pain`) documented only in a `<details>` at `fontSize:10, --fg-4`, collapsed by default (WorkoutDayClient:1028). Placeholder shows `×`, which a phone keyboard can't type (parser accepts `x`, UI teaches `×`).
- *Why:* Recognition-over-recall failure on the primary interaction.
- *Fix:* surface a persistent one-line legend on first sessions; teach `x` not `×`; consider tap-chips (PR / miss / skip) as alternatives to typing.
- *Suggested command:* `/impeccable onboard` / `/impeccable clarify`

**[P2] Design-system fidelity: inline styles bypass the density/theme system.**
- *What:* Pervasive inline magic font sizes (9,10,11,12,13,14,20) instead of `--fs`/`--fs-sm`, so density modes barely reach this screen; `var(--r, 6px)` fallbacks contradict the real 4px `--r`; hardcoded `#fff`; BodyweightWidget uses legacy `.button`/`.input`; WorkoutView is an all-Tailwind paradigm with a `text-2xl` h1.
- *Why:* The "works across all six themes and three density modes" promise is only partially true on the surface that needs density most.
- *Fix:* extract row/section/bottom-bar into token-driven classes; kill the `6px` fallbacks and hardcoded hex; unify on one button/input system.
- *Suggested command:* `/impeccable distill` / `/impeccable optimize`

## Persona Red Flags

**Casey (distracted mobile, one-handed mid-set — CRITICAL):** 30px/70px cells are thumb-hostile; the history/edit/replace icon trio (~19px, top-right of every row) is a mis-tap farm; the bottom strip crams count + Day note + Skip day + Finish at ~28px with Skip immediately left of Finish; placeholder teaches `70×8` with a `×` Casey can't type; RestTimer needs a deliberate tap on a ~19px play button, no per-set auto-start.

**Sam (accessibility):** `--fg-4` 9–10px text fails AA badly in the default light theme; `.cell.miss` communicates via red color alone (breaks DESIGN's own "never hue alone" rule); `<summary listStyle:none>` strips the disclosure triangle from the format guide and notes; **no `prefers-reduced-motion`** anywhere (progress-bar width, drawer slide, fade/slideup) despite PRODUCT promising reduced-motion respect.

**Serious self-coached lifter (project persona):** sees the prescribed target only on set 1 (placeholder gated to `i===0`), so must recall it across a 5×5; finishes and is whisked away in 800ms with no volume/PR readout; the autosave confirmation they most want is the faintest element on screen.

## Minor Observations

- Onboarding steps 2 and 3 are hardcoded `done: false` (TodayClient:82–83) — they never check off even after the user completes them.
- WorkoutDayClient:946 "Loading…" is shown both while loading and when the program/day isn't found — a bad URL shows an eternal "Loading…".
- Welcome banner (TodayClient:49) uses full `--accent` border + `--accent-soft` fill + accent link — borderline accent overuse for a passive info banner.
- The onboarding checkmark badge is a fully-round green circle with `#fff` tick — the most "generic SaaS checklist" element in the app.
- **DESIGN.md vs code mismatch:** DESIGN.md calls Editor (dark) the default register, but `ThemeProvider.tsx:6` and `index.html`'s `#2f6fdf` theme-color both make **linen (light)** the real default. DESIGN.md should be corrected.

## Questions to Consider

1. If the entire product promise is a *trustworthy* local log, why is the save-confirmation the smallest, faintest element on screen — and why does finishing a session discard the summary a lifter would want to see?
2. The cell DSL is the app's most opinionated, power-user-respecting idea — but it's taught only in 10px hidden gray text. Signature feature, or insider secret?
3. Six themes and three density modes are the DESIGN.md headline, yet the mid-workout screen hardcodes its sizes inline — so the density system barely touches the surface that needs it most. Is the token system real, or aspirational?
