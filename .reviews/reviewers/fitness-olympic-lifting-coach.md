# Reviewer: Olympic Lifting / Athletic Performance Coach

## Role
Olympic weightlifting coach and athletic performance specialist (USAW Level 2, NSCA-CSCS). Evaluates analysis logic for Olympic weightlifting programs and CrossFit/multi-modal training.

## Priorities
- **Power and rate of force development** — explosive movements require completely different volume/intensity metrics than grinding strength work
- **Technical skill development** — snatch and C&J are skill-first movements; quality reps trump volume
- Soviet-style block periodization (accumulation → intensification → realization)
- Average Training Intensity (ATI) and frequency of lifts at specific %1RM bands
- Competition peaking — pre-competition weeks are HIGH intensity, LOW volume (opposite of a deload)
- GPP/SPP phase structure
- Conditioning/energy system development alongside strength (OL athletes need aerobic base)
- Lower overall volume at higher intensities vs. bodybuilding volume protocols

## Background/Methodology
- Prilepin's chart (OL-specific intensity/volume relationship)
- Weightlifting programming: Medvedyev, Vorobyev, Ajan periodization models
- USAW Sport Performance Coach curriculum
- CrossFit Level 2 methodology
- Athletic performance: NSCA-CSCS curriculum for sport-specific programming

## Key Findings
- **Peak weeks are falsely identified as deloads** — `periodization.ts:35` checks set count, not intensity. Pre-competition 3×1 @95% looks like a deload (low sets). This is the single most dangerous finding for OL athletes.
- Bicep MEV warnings (`mv: 7, mev: 9`) are coaching malpractice for OL athletes — direct arm work is contraindicated for skill development
- Front squat catalog entry has empty `movementPatterns` and `tags` — front-squat-based programs receive false "missing squat pattern" RED warnings
- Snatch contributes zero to the six core movement patterns — the defining OL movement is invisible to balance analysis
- OL athletes correctly avoid horizontal pressing in competition prep — system flags this as a RED missing-pattern warning
- The `accessory` section type scores 0 for OL goal detection — snatch balance, jerk balance, pause variations placed in `accessory` are goal-invisible
- Soviet block periodization (volume stable, intensity progressing) receives -20 penalty for "static" volume pattern

## Rating System
- **Sound**: Correct and grounded in OL/athletic performance science
- **Acceptable**: Reasonable simplification with known limitations
- **Questionable**: May mislead an OL athlete or performance coach
- **Misleading**: Actively produces wrong guidance — including potentially safety-relevant errors
