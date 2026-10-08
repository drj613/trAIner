import { buildRequiredContract, buildCoachingBlock, buildPersonaSynthesis } from "./builder";

describe("routine generation contract", () => {
  it("keeps the required output contract compact and complete", () => {
    const prompt = buildRequiredContract();
    expect(prompt.length).toBeLessThanOrEqual(6300);
    expect(prompt).toContain("return one JSON object");
    expect(prompt).toContain("same effective set count");
    expect(prompt).toContain("Within each superset");
    expect(prompt).not.toContain("same number of exercises in each superset");
    expect(prompt).toContain("load");
    expect(prompt).toContain("unit");
    expect(prompt).toContain("tempo");
    expect(prompt).toContain("notes");
    expect(prompt).toContain("no more than 8 weeks");
    expect(prompt).toContain("weeks");
    expect(prompt).toContain("warmup, explosive, strength, power, hypertrophy, accessory, metcon, cardio, conditioning, rehab, mobility, cooldown, training");
    expect(prompt).toContain('"countsTowardVolume"');
    expect(prompt).toContain("variants");
    expect(prompt).toContain("overrides");
    expect(prompt).toContain("primary");
  });

  it("keeps optional coaching separate from the required contract", () => {
    const coaching = buildCoachingBlock();
    expect(coaching).toContain("conversational coaching");
    expect(coaching).toContain("self-audit");
    expect(coaching).toContain("deload");
    expect(coaching).toContain("productive work");
    expect(coaching.length).toBeGreaterThan(1500);
  });
});

describe("routine contract example", () => {
  it("parses its JSON example through the routine importer", async () => {
    const { parseProgramJson } = await import("@/lib/import/parser");
    const contract = buildRequiredContract();
    const example = contract.match(/\n\n(\{[^\n]+\})\n\nThe example is illustrative/);
    expect(example).not.toBeNull();
    expect(() => parseProgramJson(example![1])).not.toThrow();
  });
});

describe("persona synthesis", () => {
  const rp = { name: "RP", text: "RP's original coaching language." };
  const second = { name: "Second Coach", text: "Second coach's original coaching language." };

  it("returns no persona prose when no personas are selected", () => {
    expect(buildPersonaSynthesis([])).toBe("");
  });

  it("preserves one persona's text and advisory precedence without a synthesis section", () => {
    const prompt = buildPersonaSynthesis([rp]);
    expect(prompt).toContain("## Coach: RP\nRP's original coaching language.");
    expect(prompt).toContain("Coach personas are advisory methodologies.");
    expect(prompt).not.toContain("Multi-Coach Synthesis");
  });

  it("synthesizes multiple personas while retaining each original block", () => {
    const prompt = buildPersonaSynthesis([rp, second]);
    expect(prompt).toContain("## Multi-Coach Synthesis");
    expect(prompt).toContain("## Coach: RP\nRP's original coaching language.");
    expect(prompt).toContain("## Coach: Second Coach\nSecond coach's original coaching language.");
    expect(prompt).toContain("Coach personas are advisory methodologies.");
  });
});
