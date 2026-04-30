import { buildProfileBlock, buildRoutineBlock, buildConstraintsBlock, buildSchemaBlock, assemblePrompt } from "./builder";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";

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

describe("buildRoutineBlock", () => {
  it("returns empty string when program is undefined", () => {
    expect(buildRoutineBlock(undefined)).toBe("");
  });
  it("includes program title when provided", () => {
    const prog = { id: "p1", title: "PPL Program" } as unknown as ProgramDocument;
    expect(buildRoutineBlock(prog)).toContain("PPL Program");
  });
});

describe("buildSchemaBlock", () => {
  it("mentions JSON in the output", () => {
    expect(buildSchemaBlock()).toContain("JSON");
  });
});

describe("assemblePrompt", () => {
  it("joins non-empty blocks with double newline", () => {
    const result = assemblePrompt(["Block A", "", "Block B"]);
    expect(result).toBe("Block A\n\nBlock B");
  });
});
