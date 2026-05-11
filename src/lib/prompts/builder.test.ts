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

const routineWithDays: ProgramDocument = {
  id: "p2",
  title: "Full Body 3x",
  source: "manual",
  active: true,
  days: [
    {
      id: "d1",
      dayNumber: 1,
      title: "Day A",
      sections: [
        {
          id: "s1",
          type: "strength",
          name: "Main Lifts",
          groups: [
            {
              id: "g1",
              type: "single",
              exercises: [
                {
                  id: "e1",
                  name: "Squat",
                  sets: 3,
                  reps: "5",
                  load: "80% 1RM",
                  tags: { primary: ["quads"], secondary: [], incidental: [], modifiers: [] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  overrides: [],
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

describe("buildRoutineBlock", () => {
  it("returns empty string when program is undefined", () => {
    expect(buildRoutineBlock(undefined)).toBe("");
  });
  it("includes program title when provided", () => {
    const prog = { id: "p1", title: "PPL Program" } as unknown as ProgramDocument;
    expect(buildRoutineBlock(prog)).toContain("PPL Program");
  });
  it("includes exercise names in the output (C5)", () => {
    const block = buildRoutineBlock(routineWithDays);
    expect(block).toContain("Squat");
  });
  it("includes section name in the output (C5)", () => {
    const block = buildRoutineBlock(routineWithDays);
    expect(block).toContain("Main Lifts");
  });
  it("includes sets and reps in the output (C5)", () => {
    const block = buildRoutineBlock(routineWithDays);
    expect(block).toContain("3 sets");
    expect(block).toContain("× 5");
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
});

describe("assemblePrompt", () => {
  it("joins non-empty blocks with double newline", () => {
    const result = assemblePrompt(["Block A", "", "Block B"]);
    expect(result).toBe("Block A\n\nBlock B");
  });
});
