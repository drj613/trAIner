---
name: Technical Workspace System
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
typography:
  heading-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-compact:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  data-tabular:
    fontFamily: ui-monospace, SFMono-Regular, Roboto Mono, monospace
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 16px
  code-label:
    fontFamily: ui-monospace, SFMono-Regular, Roboto Mono, monospace
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 12px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  layout-margin: 12px
  cell-padding-x: 8px
  cell-padding-y: 4px
---

## Brand & Style

This design system is engineered for utility, precision, and high-density data management. It adopts a **Technical Minimalism** aesthetic, intentionally distancing itself from the soft, vibrant trends of the wellness industry. The UI is treated as a professional workbench or IDE rather than a lifestyle app.

The atmosphere is serious and "local-first," emphasizing speed and low latency through visual cues like thin borders, monospaced data points, and a lack of decorative fluff. It targets power users who view fitness as a series of data points to be optimized, requiring a UI that stays out of the way while providing maximum information density.

## Colors

The palette is strictly functional, utilizing a deep charcoal and black foundation to minimize eye strain during high-intensity use. 

- **Base Layers:** Use `#0a0a0a` for the primary application background and `#1a1a1a` for raised workspace panels or cards.
- **Borders:** A consistent `#333333` is used for all structural divisions, maintaining a rigid grid-like feel.
- **Accents:** Color is used exclusively for status and intent. Blue (`#3b82f6`) denotes primary actions and active states; Emerald (`#10b981`) signifies completed sets or successful syncs; Amber (`#f59e0b`) highlights plateaus, warnings, or pending local changes.

## Typography

This system employs a dual-font strategy to separate UI navigation from raw data.

1.  **Interface Text:** **Inter** is used for all labels, navigation, and instructions. It is set at smaller scales (13px-14px) with tight tracking to support high information density.
2.  **Quantitative Data:** All numeric values—including weights, reps, timers, and JSON logs—must use a **Tabular Monospace** font. This ensures that columns of numbers align perfectly in spreadsheet-style views, allowing users to scan performance deltas at a glance.

## Layout & Spacing

The layout follows a **Fluid Spreadsheet** philosophy. The workspace should expand to the full width of the viewport, utilizing a "card/grid hybrid" where individual workout modules act as containers.

- **Grid:** Use a 12-column system for large screens, but prioritize "Density over Air."
- **Rhythm:** A strict 4px baseline grid.
- **Padding:** Minimal. Vertical padding in rows is capped at 4-6px to maximize the number of visible rows on a mobile PWA screen.
- **Borders:** Every element is contained by a 1px border. Do not use shadows to separate containers; use border-level distinctions and subtle tonal shifts.

## Elevation & Depth

This system is essentially flat, avoiding shadows or blurred glass effects. Depth is communicated through **Tonal Layering** and **Line Work**:

- **Level 0 (Background):** `#0a0a0a` — The canvas.
- **Level 1 (Panels):** `#1a1a1a` — The workspace cards or modules.
- **Level 2 (Active/Hover):** `#252525` — Highlighting a selected row or focused input.
- **Indicators:** Active states are reinforced with 2px solid accents (Blue) on the left edge of a row or card, rather than a drop shadow.

## Shapes

To maintain the "tool-like" atmosphere, the system uses **Square or Near-Square** corners. 

- **Primary Radius:** 2px for buttons and input fields to provide a slight hint of "interactability."
- **Container Radius:** 0px for main panels and workout cards to create a seamless, integrated grid appearance.
- **Iconography:** Use 1.5px or 2px stroke weights with mitered (sharp) joins to match the architectural feel of the UI.

## Components

### Buttons & Inputs
- **Inputs:** Transparent background with a bottom border or 1px all-around border (`#333`). On focus, the border changes to Blue (`#3b82f6`). Text is always Monospace for numeric values.
- **Buttons:** Small (24px-28px height). Ghost-style by default with 1px borders. Primary buttons use a solid Blue fill with white text.

### Data Grid (The Core Component)
- **Rows:** 32px height. Spreadsheet-style interaction where clicking a cell enables immediate inline editing.
- **Headers:** Small-caps, monospaced, muted gray text. 1px bottom border separating headers from data.

### Progress Indicators
- **Status Chips:** Rectangular (0-2px radius). No background fill; use colored text and a matching 1px border (e.g., Emerald for "Completed").
- **Activity Heatmap:** Square blocks with color intensity mapped to volume, similar to a GitHub contribution graph.

### Technical Elements
- **JSON Inspector:** A collapsible panel for power users to view raw workout metadata.
- **Timer:** Large, monospace, high-contrast (White/Emerald) display with no decorative rings—just the raw digits.