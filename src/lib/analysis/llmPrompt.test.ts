import { buildLlmAnalysisPrompt } from "./llmPrompt";
import { balancedProgram } from "./fixtures";
import type { ProfileDocument, ProgramDocument } from "@/lib/programs/types";

const testProfile: ProfileDocument = {
  id: "local-profile",
  name: "Test User",
  goals: ["Build strength"],
  equipment: ["barbell", "dumbbells"],
  constraints: [],
  trainingAge: "intermediate",
  defaultDaysPerWeek: 3,
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildLlmAnalysisPrompt", () => {
  it("includes the program title", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("Balanced Upper/Lower");
  });

  it("includes volume landmarks reference table", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("Volume Landmarks");
    expect(prompt).toContain("Chest");
  });

  it("includes user profile when provided", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("intermediate");
    expect(prompt).toContain("Build strength");
  });

  it("works without a profile", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram);
    expect(prompt).toContain("Balanced Upper/Lower");
    expect(prompt).toContain("No profile available");
  });

  it("includes analysis instructions", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("Program Fingerprint");
    expect(prompt).toContain("Volume Analysis");
    expect(prompt).toContain("Balance Assessment");
  });

  it("includes injuries (not just legacy constraints) in the analysis prompt", () => {
    const injuryProfile: ProfileDocument = {
      id: "local-profile",
      name: "Alex",
      goals: [],
      equipment: [],
      constraints: [],
      injuries: ["bad shoulder"],
      preferences: [],
      trainingAge: "",
      defaultDaysPerWeek: 4,
      updatedAt: "2026-01-01",
    };
    const program = {
      id: "p1",
      title: "Test",
      source: "manual",
      active: true,
      days: [],
      overrides: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    } as ProgramDocument;
    expect(buildLlmAnalysisPrompt(program, injuryProfile)).toContain("bad shoulder");
  });
});
