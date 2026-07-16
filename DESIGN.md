---
name: trAIner
description: A private, local-first training logbook that reads like a well-built instrument.
colors:
  bg: "#15171a"
  surface: "#1b1e22"
  surface-2: "#20242a"
  surface-3: "#262b32"
  surface-hover: "#2c323a"
  line: "#2a2f37"
  line-strong: "#353c46"
  ink: "#e7eaee"
  ink-muted: "#b6bcc6"
  ink-faint: "#7a818c"
  ink-ghost: "#555c66"
  accent: "#5cc4d6"
  accent-ink: "#061216"
  good: "#7fc77a"
  warn: "#e6b664"
  bad: "#e07b6a"
  pr: "#c5a3ff"
typography:
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
    fontFeature: "tnum"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "12px"
  lg: "16px"
components:
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    typography: "{typography.label}"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  cell:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 7px"
    typography: "{typography.mono}"
    height: "28px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
---

# Design System: trAIner

## 1. Overview

**Creative North Star: "The Training Logbook"**

trAIner is a private record kept in a well-made instrument. It reads like a logbook a serious lifter would actually trust: exact figures set in monospace, tight rows that pack a full session onto one screen, ink laid on quiet charcoal surfaces. Nothing is decorative for its own sake. The data — sets, reps, weight, volume, the analysis scores — is the interface; chrome recedes so the numbers carry the page. It is calm on purpose, because it gets used mid-workout, phone in one hand, and a loud UI is a liability there.

The system is token-driven and multi-theme by construction. A fresh user lands on **Linen** — a cool neutral light register with a blue accent (`ThemeProvider` default, matched by `index.html`'s `#2f6fdf` theme-color). The signature dark register is **Editor** — a Photopea-tinged neutral charcoal with a cyan accent — which is also the CSS `:root` fallback palette and the one the token values below are quoted from. The same variables drive Terminal (green), Logbook (amber), Midnight (indigo), and Paper (warm light). Every color is a `var(--…)`; a screen built against the tokens is automatically correct in all six. Depth is mostly tonal: surfaces step from `bg` up through `surface-3`, separated by hairline borders, with shadows reserved for things that genuinely float (drawer, overlays). **Because Linen is the default, its contrast is load-bearing — muted `--fg-3`/`--fg-4` ink must clear WCAG AA there, not just in the dark registers.**

What it explicitly rejects: **loud fitness-app hype** (no neon gradients, motivational-poster energy, gamified confetti); the **generic SaaS dashboard** (no rounded card grids, pastel gradient hero-metrics, purple-blue startup template); the **consumer social/feed app** (no avatars, likes, streaks-as-pressure); and the **sterile clinical UI** (charcoal-warm and precise, never cold and joyless).

**Key Characteristics:**
- Information-dense, low-stimulation, monospace where figures matter
- Tonal depth over shadow; hairline 1px borders
- Tight radii (2/4/8px), never soft or pillowy
- Six themes + three density modes from one token set
- Accent is rare and functional — a syntax highlight, not a brand splash

## 2. Colors

A quiet charcoal field with a single cool accent and a small, meaningful status set. Character is set by restraint: most of any screen is neutral ink-on-surface, and color appears only where it carries information.

### Primary
- **Instrument Cyan** (`#5cc4d6`): the one accent. Active nav, primary buttons, focused cells, the `tr`/`ner` in the wordmark, section-strength rails. Used sparingly — it's a highlight, not a fill. Each theme swaps this hue (Terminal green, Logbook amber, Midnight indigo); its *role* is constant.

### Neutral
- **Ink** (`#e7eaee`): primary text and logged figures.
- **Ink Muted** (`#b6bcc6`): secondary text, values that aren't the headline.
- **Ink Faint** (`#7a818c`): labels, captions, `.tx-up` uppercase micro-labels.
- **Ink Ghost** (`#555c66`): empty/placeholder cells, skipped sets, disabled.
- **Base** (`#15171a`) → **Surface** (`#1b1e22`) → **Surface-2** (`#20242a`) → **Surface-3** (`#262b32`): the tonal elevation ladder. Panels sit on Surface; interactive cells sit on Surface-3; the app body is Base.
- **Line** (`#2a2f37`) / **Line Strong** (`#353c46`): hairline dividers and hover-state borders.

### Status
- **Good** (`#7fc77a`): PR-adjacent positives, bodyweight cells, passing analysis.
- **Warn** (`#e6b664`): cautions, metcon section rail, mid-band analysis.
- **Bad** (`#e07b6a`): failures, pain flags, missed sets, destructive actions.
- **PR** (`#c5a3ff`): personal-record cells and hypertrophy rail — a distinct violet so a PR is unmistakable at a glance.

### Named Rules
**The One-Accent Rule.** Exactly one accent hue per theme. If a screen needs a second "color", it comes from the status set (good/warn/bad/pr) and must mean something. Never introduce a decorative second brand color.

**The Status-Is-Semantic Rule.** Good/Warn/Bad/PR are reserved for state. Never use `--bad` red because red "looks nice" on a heading — a red figure means something failed or hurts.

## 3. Typography

**UI / Display Font:** Inter (with -apple-system, Segoe UI, system-ui fallback)
**Figure / Mono Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo fallback)

**Character:** A clean humanist sans for reading and a true monospace for numbers. The pairing is deliberate contrast, not two similar sans: prose is Inter, but anything you'd compare column-to-column — reps, weight, volume, dates — is monospace with tabular figures so digits line up. Inter runs with `ss01`, `cv01`, `cv11` stylistic sets for a slightly more mechanical read.

### Hierarchy
- **Title** (Inter 700, 14–15px, line-height 1, letter-spacing -0.01em): the wordmark and top-level screen titles. Small by design — this is a tool, not a poster.
- **Body** (Inter 400, 13.5px, line-height ~1.5): default reading text. Density mode shifts this (12.5px dense → 14px comfy).
- **Label** (Inter 500, 11.5px, letter-spacing 0.08em, often uppercase via `.tx-up`): micro-labels, column heads, section tags. Color is Ink Faint.
- **Mono** (JetBrains Mono, 13.5px, tabular-nums): every logged figure, set cell, group glyph, and metric. This is the system's signature.

### Named Rules
**The Tabular-Figures Rule.** Every number a user might scan or compare is set in mono with `font-variant-numeric: tabular-nums`. Reps, weights, volumes, dates, percentages. Prose numbers in a sentence can stay in Inter; column and cell numbers never do.

**The Small-Type Rule.** Base UI text is ~13.5px and titles top out around 15px. Resist the urge to enlarge — density is the point, and the density modes (comfy/default/dense) are the sanctioned way to adjust, not ad-hoc font bumps.

## 4. Elevation

Flat by default, with subtle shadow reserved for true overlays. Depth is carried by the tonal ladder (`bg` → `surface` → `surface-2` → `surface-3`) plus hairline borders — a panel is "raised" because it's a lighter step and has a `1px` line, not because it has a drop shadow. This keeps resting screens calm and dense. Shadows appear only on elements that genuinely float above the page and need separating from it: the mobile nav drawer, dialogs, popovers.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 32px rgba(0,0,0,0.4)`): drawers, dialogs, and menus that sit above a backdrop. Paired with a `rgba(0,0,0,0.45)` scrim.
- **Popover** (`box-shadow: 0 4px 16px rgba(0,0,0,0.3)`): small floating menus and tooltips anchored to a control.

### Named Rules
**The Flat-At-Rest Rule.** In-flow surfaces (panels, cards, rows, cells) get zero shadow. If you're reaching for a `box-shadow` on a resting element to make it "pop", use the next tonal surface step and a hairline border instead.

**The Float-Earns-Shadow Rule.** A shadow is permission to leave the document flow. Only overlays that escape the layout (drawer, dialog, popover) may cast one.

## 5. Components

Precise and restrained across the board: small hit-areas that are exact, hairline borders, and minimal, fast state changes (100–120ms). Controls feel tool-like, not tactile-bouncy.

### Buttons
- **Shape:** tight `4px` radius (`--r`). Never pill, never large-radius.
- **Secondary (default `.btn`):** Surface-2 fill, Ink text, `1px` Line border, label type (11.5px/500), `6px 10px` padding. The workhorse.
- **Primary (`.btn.primary`):** Accent fill, Accent-Ink text, Accent border. Hover brightens `filter: brightness(1.05)`. One primary per context.
- **Ghost (`.btn.ghost`):** transparent, borderless until hover (then Surface-2 + Line). Icon buttons in the toolbar use this.
- **Danger (`.btn.danger`):** transparent with Bad text + Bad border. Destructive only.
- **Hover / Focus:** border shifts Line → Line Strong, background steps to `surface-hover`; transition `background/border-color 0.12s`.

### Set Cells (signature component)
- **Style:** the heart of logging. Monospace, tabular figures, Surface-3 fill, `2px` radius, `min-width 56px`, `28px` tall, `cursor: text`.
- **States, each color-coded:** `empty` (Ink Ghost, dashed border), `pr` (PR violet fill+border tint), `pain`/`miss` (Bad), `skip` (Ink Ghost, strikethrough), `bw` (Good), `editing`/`focus` (Accent border, Surface-2 fill).
- **Compact mode:** shrinks to `44px` wide, `22px` tall, 12px — a whole session on one phone screen.

### Inputs / Fields
- **Style:** Surface-2 fill, `1px` Line border, `8px` radius (`--r-lg`), `10px 12px` padding, full-width.
- **Focus:** border shifts to Accent. No glow, no ring — a color change is the whole affordance.

### Navigation
- **Toolbar:** 46px sticky top bar, Surface background, bottom hairline, ghost menu button + centered wordmark. `z-index: 40`.
- **Drawer:** 256px left panel over a scrim, slides in (`slideright 0.16s cubic-bezier(.2,.7,.3,1)`), `z-index: 60`. Active item = Accent-Soft background + Accent text + 600 weight; inactive = plain Ink. Lucide icons at 15px.

### Section Rails
- Color-coded left accents per training block via `--sec`: warmup (blue), explosive (coral), strength (accent), metcon (amber), hypertrophy (violet), rehab (green). These are the one sanctioned use of a colored edge — they encode block *type*, they are not decoration.

## 6. Do's and Don'ts

### Do:
- **Do** set every comparable figure in JetBrains Mono with `tabular-nums`. Reps, weight, volume, dates.
- **Do** build depth from the tonal ladder (`bg`→`surface`→`surface-2`→`surface-3`) and `1px` borders, not shadows.
- **Do** keep the accent rare — active nav, primary action, focus, section-strength. One accent per theme.
- **Do** reserve Good/Warn/Bad/PR for genuine state, and make sure state never relies on hue alone (icon, position, or label backs it up).
- **Do** author against the CSS variables so every screen works across all six themes and three density modes.
- **Do** keep radii tight (2/4/8px) and type small (≈13.5px body, ≤15px titles).

### Don't:
- **Don't** ship loud fitness-app hype: no neon gradients, no motivational-poster energy, no gamified confetti or streak celebrations.
- **Don't** build a generic SaaS dashboard: no rounded card grids, no pastel gradient hero-metric tiles, no purple-blue startup-template look.
- **Don't** borrow consumer social/feed patterns: no avatars, no likes, no streak-shaming, no engagement bait.
- **Don't** go sterile-clinical: cold, gray, joyless form-portal energy is as wrong as loud.
- **Don't** put a `box-shadow` on a resting in-flow surface — use the next tonal step instead. Shadow is only for overlays that leave the flow.
- **Don't** use `border-left`/`border-right` colored stripes as accents; the section-rail `--sec` system is the only sanctioned colored edge and it encodes meaning.
- **Don't** use gradient text (`background-clip: text`) or glassmorphism.
- **Don't** hardcode hex values in components — reference the tokens, or you break theming.
