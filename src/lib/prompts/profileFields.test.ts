import {
  buildProfileFieldsBlock,
  buildConstraintsFieldsBlock,
  missingImportantFields,
  PROFILE_FIELDS,
} from "./profileFields";
import type { ProfileDocument } from "@/lib/programs/types";

const base: ProfileDocument = {
  id: "local-profile",
  name: "Alex",
  goals: ["Hypertrophy"],
  equipment: ["Full gym"],
  constraints: [],
  injuries: [],
  preferences: [],
  trainingAge: "5 years",
  defaultDaysPerWeek: 4,
  updatedAt: "2026-01-01",
};

const allOn = () => new Set(PROFILE_FIELDS.map((f) => f.key));

describe("buildProfileFieldsBlock", () => {
  it("renders enabled, non-empty profile fields under a Profile header", () => {
    const block = buildProfileFieldsBlock(base, allOn());
    expect(block).toContain("## Profile");
    expect(block).toContain("Name: Alex");
    expect(block).toContain("Training age: 5 years");
    expect(block).toContain("Days per week: 4");
    expect(block).toContain("Goals: Hypertrophy");
    expect(block).toContain("Equipment: Full gym");
  });

  it("includes the previously-dropped fields when present", () => {
    const p: ProfileDocument = {
      ...base,
      body: { age: "30", height: "180cm", weight: "82kg" },
      history: ["Ran Starting Strength"],
      schedule: ["Mon/Wed/Fri", "45 min cap"],
      preferences: ["No barbell back squat"],
    };
    const block = buildProfileFieldsBlock(p, allOn());
    expect(block).toContain("Body: age 30, height 180cm, weight 82kg");
    expect(block).toContain("Training history: Ran Starting Strength");
    expect(block).toContain("Schedule: Mon/Wed/Fri, 45 min cap");
    expect(block).toContain("Exercises I like (include where sensible): No barbell back squat");
  });

  it("omits fields whose toggle is off", () => {
    const enabled = new Set([...allOn()].filter((k) => k !== "goals"));
    const block = buildProfileFieldsBlock(base, enabled);
    expect(block).not.toContain("Goals:");
  });

  it("returns empty string when no profile fields render", () => {
    expect(buildProfileFieldsBlock(base, new Set())).toBe("");
  });
});

describe("buildConstraintsFieldsBlock (injuries bug)", () => {
  it("renders injuries from profile.injuries", () => {
    const p = { ...base, injuries: ["bad knee"] };
    const block = buildConstraintsFieldsBlock(p, allOn());
    expect(block).toContain("## Injuries & constraints");
    expect(block).toContain("- bad knee");
    expect(block.toLowerCase()).toContain("precaution flag");
  });

  it("falls back to legacy constraints when injuries is empty", () => {
    const p = { ...base, injuries: [], constraints: ["avoid overhead"] };
    const block = buildConstraintsFieldsBlock(p, allOn());
    expect(block).toContain("- avoid overhead");
  });

  it("merges ad-hoc injuries with profile injuries", () => {
    const p = { ...base, injuries: ["bad knee"] };
    const block = buildConstraintsFieldsBlock(p, allOn(), ["tweaked lower back"]);
    expect(block).toContain("- bad knee");
    expect(block).toContain("- tweaked lower back");
  });

  it("returns empty string when no injuries anywhere", () => {
    expect(buildConstraintsFieldsBlock(base, allOn(), [])).toBe("");
  });

  it("treats injuries as precaution flags to steer around, not hard exclusions", () => {
    const p = { ...base, injuries: ["bad knee"] };
    const block = buildConstraintsFieldsBlock(p, allOn());
    expect(block).toContain("Treat listed injuries as precaution flags.");
    expect(block).toContain("Ask about known aggravating movements when needed.");
    expect(block).toContain(
      "Do not knowingly program a reported aggravating movement; provide a pain-free substitution that preserves the intended pattern or stimulus, and note the swap.",
    );
    expect(block.toLowerCase()).not.toContain("hard constraints — never program");
  });
});

describe("missingImportantFields", () => {
  it("lists enabled important fields that have no data", () => {
    const missing = missingImportantFields(base, allOn(), []).map((f) => f.key);
    expect(missing).toContain("injuries");
    expect(missing).toContain("schedule");
    expect(missing).not.toContain("goals"); // goals has data
    expect(missing).not.toContain("body"); // body is not important
  });

  it("treats injuries as present when ad-hoc injuries exist", () => {
    const missing = missingImportantFields(base, allOn(), ["sore wrist"]).map((f) => f.key);
    expect(missing).not.toContain("injuries");
  });

  it("ignores fields whose toggle is off", () => {
    const enabled = new Set([...allOn()].filter((k) => k !== "injuries"));
    const missing = missingImportantFields(base, enabled, []).map((f) => f.key);
    expect(missing).not.toContain("injuries");
  });
});
