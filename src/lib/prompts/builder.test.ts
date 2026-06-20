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
