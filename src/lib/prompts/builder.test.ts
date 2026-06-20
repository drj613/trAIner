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
});

describe("buildRecoveryPrompt", () => {
  it("instructs the model to re-emit JSON only", () => {
    expect(buildRecoveryPrompt()).toMatch(/only.*JSON|JSON.*only/i);
  });
  it("forbids markdown code fences", () => {
    expect(buildRecoveryPrompt()).toMatch(/no.*fence|```/i);
  });
  it("includes the supplied error message when provided", () => {
    expect(buildRecoveryPrompt("Unexpected token x at position 4")).toContain(
      "Unexpected token x at position 4"
    );
  });
});

describe("assemblePrompt", () => {
  it("joins non-empty blocks with double newline", () => {
    const result = assemblePrompt(["Block A", "", "Block B"]);
    expect(result).toBe("Block A\n\nBlock B");
  });
});
