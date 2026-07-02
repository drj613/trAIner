import { buildSheetPrompt, SHEET_PROMPT_GRID_ITEMS } from "./sheetPrompt";
import { toDisplayAnalysis } from "./toDisplayAnalysis";
import { analyzeProgram } from "./analyze";
import { balancedProgram, startingStrengthProgram } from "./fixtures";
import { VOLUME_LANDMARKS } from "./thresholds";
import { ALL_MUSCLE_GROUPS } from "./types";

const displayAnalysis = () => toDisplayAnalysis(analyzeProgram(balancedProgram), 0);

describe("buildSheetPrompt", () => {
  it("generates the landmark table from thresholds.ts (engine values, all muscles)", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    const b = VOLUME_LANDMARKS.biceps;
    expect(prompt).toContain(`| Biceps | ${b.mv} | ${b.mev} | ${b.mavLow} | ${b.mavHigh} | ${b.mrv} |`);
    const g = VOLUME_LANDMARKS.glutes;
    expect(prompt).toContain(`| Glutes | ${g.mv} | ${g.mev} | ${g.mavLow} | ${g.mavHigh} | ${g.mrv} |`);
    // one row per canonical muscle group — no more 11-muscle subset
    const rows = prompt.match(/^\| [A-Z]/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(ALL_MUSCLE_GROUPS.length);
  });

  it("does not promise machine ingestion", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).not.toContain("Return JSON");
    expect(prompt).not.toMatch(/for app to consume/i);
    expect(prompt).toContain("What to return");
  });

  it("includes the program title and computed scores", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).toContain("Test Program");
    expect(prompt).toMatch(/Volume: [A-F] \(\d+\/100\)/);
  });

  it("grid items no longer advertise JSON output or profile data", () => {
    const flat = SHEET_PROMPT_GRID_ITEMS.flat().join(" ");
    expect(flat).not.toMatch(/JSON for app to consume/i);
    expect(flat).not.toMatch(/profile/i);
  });

  it("states the routine goal explicitly", () => {
    const program = { ...startingStrengthProgram, goal: "strength" as const };
    const prompt = buildSheetPrompt(toDisplayAnalysis(analyzeProgram(program), 0), "SS");
    expect(prompt).toContain("The user's goal for this routine is **Strength (PL/OL)**");
    expect(prompt).not.toMatch(/appears to target/i);
    expect(prompt).toContain("excluded from the computed grade");
  });

  it("full-scope goals state the goal without the exclusion clause", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).toContain("The user's goal for this routine is **General fitness**");
    expect(prompt).not.toContain("excluded from the computed grade");
  });
});
