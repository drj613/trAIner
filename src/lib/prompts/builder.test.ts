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
