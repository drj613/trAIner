import { buildSchemaBlock, buildRecoveryPrompt, assemblePrompt } from "./builder";

describe("buildSchemaBlock", () => {
  it("mentions JSON in the output", () => {
    expect(buildSchemaBlock()).toContain("JSON");
  });
  it("includes weeks field for multi-week programs", () => {
    expect(buildSchemaBlock()).toContain('"weeks"');
  });
  it("includes overrides array for week-specific modifications", () => {
    expect(buildSchemaBlock()).toContain('"overrides"');
  });
  it("instructs the LLM to use days as a base template", () => {
    expect(buildSchemaBlock()).toMatch(/base.*week|base.*template|repeating/i);
  });
  it("instructs the LLM to omit weeks and overrides for single-week programs", () => {
    expect(buildSchemaBlock()).toMatch(/omit.*week|single.week|single-week/i);
  });
  it("defaults to conversational coaching", () => {
    expect(buildSchemaBlock().toLowerCase()).toContain("conversational coaching");
  });
  it("keeps reasoning in chat and out of the JSON", () => {
    expect(buildSchemaBlock()).toMatch(/keep the routine JSON out of this phase|keep all reasoning/i);
  });
  it("requires a pre-emit self-audit of volume, balance, warmups, and injuries", () => {
    const b = buildSchemaBlock().toLowerCase();
    expect(b).toContain("self-audit");
    expect(b).toContain("warmup");
    expect(b).toMatch(/injur|equipment/);
  });
  it("gates JSON emission on the GENERATE IT trigger", () => {
    expect(buildSchemaBlock()).toContain("GENERATE IT");
  });
  it("requires a numeric progression scheme and a deload", () => {
    const b = buildSchemaBlock().toLowerCase();
    expect(b).toContain("progression");
    expect(b).toContain("deload");
    expect(b).toMatch(/double progression|load step|%/);
  });
  it("requires a warmup every session and balanced patterns", () => {
    const b = buildSchemaBlock().toLowerCase();
    expect(b).toContain("warmup");
    expect(b).toMatch(/movement pattern|push.*pull/);
  });
  it("ends with the output contract (first char {, last char })", () => {
    const b = buildSchemaBlock();
    const contractIndex = b.indexOf("Output contract");
    expect(contractIndex).toBeGreaterThan(-1);
    // contract is the final section
    expect(b.indexOf("Program requirements")).toBeLessThan(contractIndex);
    expect(b.trimEnd().endsWith("before or after.")).toBe(true);
  });
});

describe("buildSchemaBlock — progression scoped list (Phase progression)", () => {
  const b = () => buildSchemaBlock();

  it("includes a top-level progression example with two scoped entries", () => {
    const block = b();
    const idx = block.indexOf('"progression"');
    expect(idx).toBeGreaterThan(-1);
    const slice = block.slice(idx, idx + 700);
    expect(slice).toContain('"applies"');
    expect(slice).toContain('"rule"');
    // two distinct movement classes in the example
    expect((slice.match(/"applies"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("mentions progression in the top-level field-name contract", () => {
    expect(b()).toMatch(/Top level:.*`progression`/);
  });

  it("states progression as a scoped list, one entry per movement class", () => {
    const block = b();
    expect(block).toContain("scoped list");
    expect(block).toContain("one entry per movement class");
    expect(block).toContain("do not apply one progression model to every exercise");
  });

  it("points the progression rule at the top-level `progression` field, with applies/rule keys", () => {
    const block = b();
    expect(block).toMatch(/top-level `progression` field/);
    expect(block).toContain("`applies`");
    expect(block).toContain("`rule`");
  });

  it("keeps the numeric-progression requirement (double progression / weekly load step)", () => {
    const block = b().toLowerCase();
    expect(block).toMatch(/double progression|load step|%/);
  });

  it("still allows exercise-specific tweaks in notes, without burying the main rule there", () => {
    const block = b();
    expect(block).toContain("Exercise-specific tweaks may still go in that exercise's `notes`");
    expect(block).toContain("do not bury the rule in exercise notes");
  });

  it("removes the old blanket single-rule progression phrasing", () => {
    const block = b();
    expect(block).not.toContain(
      'A concrete progressive-overload rule, stated numerically — e.g. double progression ("when all sets reach the top of the rep range at ≤1 RIR, add 2.5–5% load and return to the bottom of the range"), or a defined weekly load step. Avoid vague guidance like "increase over time".',
    );
  });
});

describe("buildRecoveryPrompt", () => {
  it("always instructs JSON-only, no fences, straight quotes", () => {
    const p = buildRecoveryPrompt("syntax");
    expect(p).toMatch(/only.*JSON|JSON.*only/i);
    expect(p).toMatch(/no.*fence/i);
    expect(p).toMatch(/straight.*quote/i);
  });
  it("gives a truncation-specific lead and asks for minified output", () => {
    const p = buildRecoveryPrompt("truncated");
    expect(p.toLowerCase()).toContain("cut off");
    expect(p.toLowerCase()).toContain("minified");
  });
  it("explains the required shape for not-object / no-days", () => {
    expect(buildRecoveryPrompt("no-days").toLowerCase()).toContain("days");
    expect(buildRecoveryPrompt("not-object").toLowerCase()).toContain("object");
  });
  it("includes the supplied detail when provided", () => {
    expect(buildRecoveryPrompt("syntax", "Unexpected token x")).toContain("Unexpected token x");
  });
});

describe("assemblePrompt", () => {
  it("joins non-empty blocks with double newline", () => {
    const result = assemblePrompt(["Block A", "", "Block B"]);
    expect(result).toBe("Block A\n\nBlock B");
  });
});

describe("buildSchemaBlock — countsTowardVolume + working-volume semantics (Phase 11)", () => {
  const b = () => buildSchemaBlock();

  it("includes countsTowardVolume in the exercise schema", () => {
    expect(b()).toContain("countsTowardVolume");
  });

  it("requires countsTowardVolume on every exercise", () => {
    expect(b()).toMatch(/every exercise object must include a boolean `countsTowardVolume`/i);
  });

  it("explains what true means", () => {
    expect(b()).toContain(
      "Set `countsTowardVolume` to `true` when the prescribed sets are intended to contribute to working strength, hypertrophy, muscular conditioning, or explosive training volume.",
    );
  });

  it("explains what false means", () => {
    expect(b()).toContain(
      "Set it to `false` for ordinary warmups, activation drills, mobility work, cooldowns, rehabilitation or prehabilitation work, and low-fatigue practice that is not intended as productive muscular working volume.",
    );
  });

  it("keeps muscle tags accurate when countsTowardVolume is false", () => {
    expect(b()).toContain(
      "Muscle tags still describe anatomical involvement when `countsTowardVolume` is false. The boolean controls analysis, not anatomy.",
    );
  });

  it('uses "working sets" language for the 10-25 range', () => {
    expect(b()).toContain(
      "Working sets per session: generally 10-25. Only exercises with `countsTowardVolume: true` count toward this range.",
    );
  });

  it("distinguishes total programmed work from working volume", () => {
    expect(b()).toContain(
      "Listed exercises or protocols per session: generally 4-8. All warmup, mobility, skill, conditioning, and cooldown exercises count toward this number.",
    );
    expect(b()).toContain("Estimated session duration: 30-75 minutes, including all programmed work.");
  });

  it("treats weekly volume ranges as advisory defaults", () => {
    expect(b()).toContain(
      "The weekly volume ranges are default programming guardrails, not mandatory targets for every muscle.",
    );
  });

  it("allows deliberate athlete specialization above a preferred range", () => {
    expect(b()).toContain(
      "When the athlete explicitly requests specialization above a preferred range, preserve the decision when the recovery and session tradeoffs remain plausible. Acknowledge the tradeoff during conversation rather than automatically reducing the requested volume.",
    );
    expect(b()).toContain(
      "Hard limits are strong caution thresholds, not automatic reasons to reject an explicit athlete request.",
    );
  });

  it("requires numeric sets to match top-set/back-off prose with worked examples", () => {
    expect(b()).toContain('One top set plus three back-off sets uses `"sets": 4`.');
    expect(b()).toContain('One top set plus two back-off sets uses `"sets": 3`.');
  });

  it("prohibits reason-only overrides and empty override day arrays", () => {
    expect(b()).toContain(
      "An override with omitted `days` or an empty `days` array does not alter the routine and must not be emitted.",
    );
    expect(b()).toContain(
      "The `reason` field is descriptive only. It does not alter sets, repetitions, loads, exercises, or effort targets.",
    );
    expect(b()).toContain("Every override must contain one or more complete replacement day objects.");
  });

  it("contains a real structurally complete replacement-day override example", () => {
    const block = b();
    const overridesIdx = block.indexOf('"overrides"');
    expect(overridesIdx).toBeGreaterThan(-1);
    const overridesBlock = block.slice(overridesIdx, overridesIdx + 1500);
    expect(overridesBlock).toContain('"sections"');
    expect(overridesBlock).toContain('"groups"');
    expect(overridesBlock).toContain('"exercises"');
  });

  it("does not describe override days as optional when an override exists", () => {
    expect(b()).not.toMatch(/OPTIONAL.*same structure as base days/i);
    expect(b()).not.toMatch(/Omit if all weeks are identical/i);
  });
});

describe("buildSchemaBlock — Phase A prompt refinements", () => {
  const b = () => buildSchemaBlock();

  it("unifies deload volume on approximately 50% of normal working-set volume", () => {
    const block = b();
    expect(block).toContain("Deload — use approximately 50% of normal working-set volume");
    expect(block).toContain("deload — reduced volume vs the base week (approximately 50% of normal)");
    expect(block).toContain(
      "then a deload week at approximately 50% of normal working-set volume",
    );
  });

  it("has no conflicting ~40%/~50% deload phrasing left", () => {
    const block = b();
    expect(block).not.toContain("~40%");
    expect(block).not.toContain("~50%");
    expect(block).not.toContain("reduce volume by ~40%");
    expect(block).not.toMatch(/deload week at ~50% volume/);
  });

  it("scopes mandatory periodization/deload to multi-week programs and allows explicit single-week requests", () => {
    const block = b();
    expect(block).toContain(
      "For multi-week programs, include periodization with a planned deload",
    );
    expect(block).toContain(
      "Single-week routines are permitted only when the athlete explicitly requests a single standalone week.",
    );
    // Multi-week section's omission line stays as-is and is now non-conflicting.
    expect(block).toContain("Omit `weeks` and `overrides` for single-week programs.");
  });

  it("frames session/volume bands as default planning guardrails, not evidence-based targets", () => {
    const block = b();
    expect(block).toContain("Design sessions using these default planning guardrails:");
    expect(block).not.toContain("evidence-based targets");
  });

  it("gates export readiness on stated decisions and self-audit rather than a pre-ask deadline", () => {
    const block = b();
    expect(block).toContain(
      "Do not declare the program ready for export until you have stated the required programming decisions and completed the self-audit — in prose, in the conversation:",
    );
    expect(block).not.toContain("Before the athlete asks for the final routine");
  });

  it("clarifies unlogged ramp-up sets belong in notes, not the numeric sets value, and warmups use countsTowardVolume: false", () => {
    const block = b();
    expect(block).toContain(
      "Unlogged ramp-up sets may be described in the heavy exercise's `notes` and must not be included in its numeric `sets` value.",
    );
    expect(block).toContain("Listed warmup exercises must use `countsTowardVolume: false`.");
  });
});

describe("buildSchemaBlock — variants (Stage 6)", () => {
  it("includes a variants example with weeks [2, 4]", () => {
    const block = buildSchemaBlock();
    expect(block).toContain('"variants"');
    expect(block).toMatch(/"weeks"[\s\S]*?2[\s\S]*?4/);
  });

  it("guidance explains variants vs overrides", () => {
    const block = buildSchemaBlock();
    expect(block).toContain("Use `variants`");
    expect(block).toContain("Reserve `overrides`");
  });

  it("hierarchy note lists variants as an optional exercise field", () => {
    const block = buildSchemaBlock();
    expect(block).toMatch(/Each exercise:[\s\S]*?`variants`/);
  });
});

describe("buildRecoveryPrompt — variants (Stage 6)", () => {
  it("preserves variants instruction", () => {
    expect(buildRecoveryPrompt("syntax")).toContain("Preserve any `variants` arrays");
  });
});
