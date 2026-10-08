import { buildSchemaBlock, buildRecoveryPrompt, assemblePrompt } from "./builder";

describe("buildSchemaBlock", () => {
  it("matches the unconditional required routine contract", () => {
    expect(buildSchemaBlock()).toContain("Routine JSON contract");
  });
});

describe("buildRecoveryPrompt", () => {
  it("always instructs JSON-only output with straight quotes and no fences", () => {
    const prompt = buildRecoveryPrompt("syntax");
    expect(prompt).toMatch(/only.*JSON|JSON.*only/i);
    expect(prompt).toMatch(/no.*fence/i);
    expect(prompt).toMatch(/straight.*quote/i);
  });

  it("asks for a complete minified response after truncation without imposing a week limit", () => {
    const prompt = buildRecoveryPrompt("truncated");
    expect(prompt.toLowerCase()).toContain("cut off");
    expect(prompt.toLowerCase()).toContain("minified");
    expect(prompt).not.toMatch(/at most 8 weeks|eight weeks/i);
  });

  it("explains required shape for non-object and no-days errors", () => {
    expect(buildRecoveryPrompt("no-days").toLowerCase()).toContain("days");
    expect(buildRecoveryPrompt("not-object").toLowerCase()).toContain("object");
  });

  it("includes supplied error detail", () => {
    expect(buildRecoveryPrompt("syntax", "Unexpected token x")).toContain("Unexpected token x");
  });
});

describe("assemblePrompt", () => {
  it("joins non-empty blocks with a blank line", () => {
    expect(assemblePrompt(["Block A", "", "Block B"])).toBe("Block A\n\nBlock B");
  });
});
