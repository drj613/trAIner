import { buildSheetPrompt, SHEET_PROMPT_GRID_ITEMS } from "./sheetPrompt";
import { toDisplayAnalysis } from "./toDisplayAnalysis";
import { analyzeProgram } from "./analyze";
import { balancedProgram, startingStrengthProgram } from "./fixtures";
import { VOLUME_LANDMARKS } from "./thresholds";
import { ALL_MUSCLE_GROUPS } from "./types";
import type { ProgramDocument } from "@/lib/programs/types";

const displayAnalysis = () => toDisplayAnalysis(analyzeProgram(balancedProgram), 0);

// Single day: 5 non-working (warmup) sets + 18 working (strength) sets = 23 total.
const workingVolumeProgram: ProgramDocument = {
  id: "wv-1",
  title: "Working Volume Test",
  source: "manual",
  active: true,
  days: [
    {
      id: "day-1",
      dayNumber: 1,
      title: "Day 1",
      sections: [
        {
          id: "s-warmup",
          type: "warmup",
          name: "Warmup",
          groups: [
            {
              id: "g-warmup",
              type: "single",
              exercises: [
                {
                  id: "e-warmup-1",
                  name: "Band Pull-Aparts",
                  sets: 5,
                  reps: "15",
                  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                },
              ],
            },
          ],
        },
        {
          id: "s-strength",
          type: "strength",
          name: "Strength",
          groups: [
            {
              id: "g-strength",
              type: "single",
              exercises: [
                {
                  id: "e-1",
                  name: "Back Squat",
                  sets: 5,
                  reps: "5",
                  tags: { primary: ["quads"], secondary: ["glutes"], incidental: [], modifiers: [] },
                },
                {
                  id: "e-2",
                  name: "Bench Press",
                  sets: 5,
                  reps: "5",
                  tags: { primary: ["chest"], secondary: ["triceps"], incidental: [], modifiers: [] },
                },
                {
                  id: "e-3",
                  name: "Barbell Row",
                  sets: 4,
                  reps: "8",
                  tags: { primary: ["lats"], secondary: [], incidental: [], modifiers: [] },
                },
                {
                  id: "e-4",
                  name: "Overhead Press",
                  sets: 4,
                  reps: "6",
                  tags: { primary: ["front delts"], secondary: [], incidental: [], modifiers: [] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  overrides: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

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

  it("tags reference-only dimensions in the computed scores", () => {
    const program = { ...startingStrengthProgram, goal: "strength" as const };
    const prompt = buildSheetPrompt(toDisplayAnalysis(analyzeProgram(program), 0), "SS");
    const volumeLine = prompt.split("\n").find((l) => l.startsWith("- Volume:"))!;
    const structureLine = prompt.split("\n").find((l) => l.startsWith("- Structure:"))!;
    expect(volumeLine).toContain("[reference only");
    expect(structureLine).not.toContain("[reference only");
  });

  it("surfaces engine mismatch notes so the LLM can question the goal", () => {
    // strength goal + no heavy work → mismatch note exists
    const program = { ...startingStrengthProgram, goal: "strength" as const };
    const prompt = buildSheetPrompt(toDisplayAnalysis(analyzeProgram(program), 0), "SS");
    expect(prompt).toContain("## Engine notes");
    expect(prompt).toMatch(/no heavy work/i);
    expect(prompt).toContain("doesn't fit this goal, say so");
  });

  it("omits the engine-notes section when there are none", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).not.toContain("## Engine notes");
  });
});

describe("buildSheetPrompt — progression scoped list", () => {
  it("includes the progression applies/rule entries when supplied", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program", [
      { applies: "Primary compounds", rule: "Add 2.5-5% load when top set hits RPE8 for all reps." },
      { applies: "Hypertrophy accessories", rule: "Double progression: add reps, then +5-10% load and reset." },
    ]);
    expect(prompt).toContain("Primary compounds");
    expect(prompt).toContain("Add 2.5-5% load when top set hits RPE8 for all reps.");
    expect(prompt).toContain("Hypertrophy accessories");
    expect(prompt).toContain("Double progression: add reps, then +5-10% load and reset.");
  });

  it("omits the progression section cleanly when absent", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).not.toContain("Intended progression");
  });

  it("omits the progression section cleanly when the list is empty", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program", []);
    expect(prompt).not.toContain("Intended progression");
  });
});

describe("buildSheetPrompt — working-volume semantics (Phase 11.8)", () => {
  it("renders total prescribed sets, working sets, and the preferred working-set range", () => {
    const prompt = buildSheetPrompt(
      toDisplayAnalysis(analyzeProgram(workingVolumeProgram), 0),
      "WV Test",
    );
    expect(prompt).toContain("Total prescribed sets: 23");
    expect(prompt).toContain("Working sets: 18");
    expect(prompt).toContain("Preferred working-set range: 10-25");
  });

  it("explains countsTowardVolume and its exclusion from analysis dimensions", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).toContain("countsTowardVolume");
    expect(prompt).toContain(
      "Exclude exercises with `countsTowardVolume: false` from working-set, weekly muscle-volume, direct-muscle-set, movement-balance, and periodization calculations",
    );
  });

  it("explains within-tier dedup, full-body max behavior, cross-tier additivity, and advisory ranges", () => {
    const prompt = buildSheetPrompt(displayAnalysis(), "Test Program");
    expect(prompt).toMatch(/counted once/i);
    expect(prompt).toMatch(/full body/i);
    expect(prompt).toMatch(/additive/i);
    expect(prompt).toMatch(/advisory/i);
  });
});
