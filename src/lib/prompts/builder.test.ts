import { buildProfileBlock, buildConstraintsBlock, buildSchemaBlock, buildRecoveryPrompt, assemblePrompt } from "./builder";
import type { ProfileDocument } from "@/lib/programs/types";

const profile: ProfileDocument = {
  id: "local-profile",
  name: "Test User",
  goals: ["Build strength", "Lose fat"],
  equipment: ["Full gym", "Home bands"],
  constraints: ["Avoid full wrist pronation", "Max 75 min sessions"],
  trainingAge: "5 years",
  defaultDaysPerWeek: 4,
  updatedAt: "2024-01-01",
};

describe("buildProfileBlock", () => {
  it("contains the user name", () => {
    expect(buildProfileBlock(profile)).toContain("Test User");
  });
  it("lists all goals", () => {
    const block = buildProfileBlock(profile);
    expect(block).toContain("Build strength");
    expect(block).toContain("Lose fat");
  });
  it("lists all equipment", () => {
    const block = buildProfileBlock(profile);
    expect(block).toContain("Full gym");
    expect(block).toContain("Home bands");
  });
  it("does not include constraints (handled by buildConstraintsBlock)", () => {
    const block = buildProfileBlock(profile);
    expect(block).not.toContain("Injuries & Constraints");
    expect(block).not.toContain("Avoid full wrist pronation");
  });
});

describe("buildConstraintsBlock", () => {
  it("lists constraints when present", () => {
    const block = buildConstraintsBlock(profile);
    expect(block).toContain("Avoid full wrist pronation");
    expect(block).toContain("Max 75 min sessions");
  });
  it("returns empty string when constraints is empty", () => {
    expect(buildConstraintsBlock({ ...profile, constraints: [] })).toBe("");
  });
});

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
  it("defaults to conversational mode (does not demand immediate JSON output)", () => {
    const block = buildSchemaBlock();
    expect(block).toMatch(/conversational mode/i);
  });
  it("gates JSON emission on the GENERATE IT trigger", () => {
    expect(buildSchemaBlock()).toContain("GENERATE IT");
  });
  it("forbids partial/preview JSON during conversation", () => {
    expect(buildSchemaBlock()).toMatch(/do not emit.*json|not.*even partially|not as a preview/i);
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
