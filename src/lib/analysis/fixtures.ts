/**
 * Shared test fixtures for analysis module tests.
 * Three programs covering: balanced upper/lower split, imbalanced bro split,
 * and a 4-week progressive block with deload.
 */
import type {
  ProgramDocument,
  ProgramDay,
  ProgramExercise,
  ProgramGroup,
  ProgramSection,
} from "@/lib/programs/types";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function ex(
  id: string,
  name: string,
  sets: number,
  reps: string,
  primary: string[],
  secondary: string[] = [],
  incidental: string[] = [],
  modifiers: string[] = [],
): ProgramExercise {
  return {
    id,
    name,
    sets,
    reps,
    tags: { primary, secondary, incidental, modifiers },
  };
}

function group(id: string, ...exercises: ProgramExercise[]): ProgramGroup {
  return { id, type: "single", exercises };
}

function section(
  id: string,
  type: ProgramSection["type"],
  name: string,
  ...groups: ProgramGroup[]
): ProgramSection {
  return { id, type, name, groups };
}

function day(
  id: string,
  dayNumber: number,
  title: string,
  weekNumber: number,
  ...sections: ProgramSection[]
): ProgramDay {
  return { id, dayNumber, weekNumber, title, sections };
}

function program(
  id: string,
  title: string,
  days: ProgramDay[],
): ProgramDocument {
  return {
    id,
    title,
    source: "manual",
    active: true,
    days,
    overrides: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// balancedProgram — 3-day upper/lower split with push/pull balance
// ---------------------------------------------------------------------------

export const balancedProgram: ProgramDocument = program(
  "balanced-1",
  "Balanced Upper/Lower",
  [
    // Day 1 — Upper A
    day(
      "day-1",
      1,
      "Upper A",
      1,
      section(
        "s1-strength",
        "strength",
        "Strength",
        group(
          "g1",
          ex("e1", "Bench Press", 4, "5-8", ["chest", "front delts"], ["triceps"]),
        ),
        group(
          "g2",
          ex("e2", "Barbell Row", 4, "5-8", ["upper back", "lats"], ["biceps"]),
        ),
        group(
          "g3",
          ex("e3", "Overhead Press", 3, "8-10", ["front delts", "shoulders"], ["triceps"]),
        ),
      ),
      section(
        "s1-accessory",
        "accessory",
        "Accessory",
        group("g4", ex("e4", "Barbell Curl", 3, "10-12", ["biceps"], ["forearms"])),
        group("g5", ex("e5", "Tricep Pushdown", 3, "10-12", ["triceps"])),
        group("g6", ex("e6", "Lateral Raise", 3, "12-15", ["shoulders"])),
        group("g7", ex("e7", "Face Pull", 3, "15-20", ["rear delts"], ["rotator cuff"])),
      ),
    ),

    // Day 2 — Lower
    day(
      "day-2",
      2,
      "Lower",
      1,
      section(
        "s2-strength",
        "strength",
        "Strength",
        group(
          "g8",
          ex("e8", "Back Squat", 4, "5-8", ["quads", "glutes"], ["hamstrings"]),
        ),
        group(
          "g9",
          ex("e9", "Romanian Deadlift", 3, "8-10", ["hamstrings", "glutes"], ["lower back"]),
        ),
      ),
      section(
        "s2-accessory",
        "accessory",
        "Accessory",
        group(
          "g10",
          ex("e10", "Leg Curl", 3, "10-12", ["hamstrings"]),
        ),
        group(
          "g11",
          ex("e11", "Calf Raise", 4, "12-15", ["calves"]),
        ),
        group(
          "g12",
          ex("e12", "Leg Extension", 3, "10-12", ["quads"]),
        ),
      ),
    ),

    // Day 3 — Upper B
    day(
      "day-3",
      3,
      "Upper B",
      1,
      section(
        "s3-strength",
        "strength",
        "Strength",
        group(
          "g13",
          ex("e13", "Incline DB Press", 4, "8-10", ["chest", "front delts"], ["triceps"]),
        ),
        group(
          "g14",
          ex("e14", "Pull-Up", 4, "5-8", ["lats", "upper back"], ["biceps"]),
        ),
        group(
          "g15",
          ex("e15", "DB Row", 3, "8-10", ["upper back", "lats"], ["biceps"]),
        ),
      ),
      section(
        "s3-accessory",
        "accessory",
        "Accessory",
        group("g16", ex("e16", "Hammer Curl", 3, "10-12", ["biceps"], ["forearms"])),
        group("g17", ex("e17", "Overhead Tri Extension", 3, "10-12", ["triceps"])),
        group("g18", ex("e18", "Reverse Fly", 3, "12-15", ["rear delts"])),
      ),
    ),
  ],
);

// ---------------------------------------------------------------------------
// imbalancedProgram — chest-dominated bro split, no lower body
// ---------------------------------------------------------------------------

export const imbalancedProgram: ProgramDocument = program(
  "imbalanced-1",
  "Chest Bro Special",
  [
    // Day 1 — Chest Day (11 exercises, all chest/front delts/triceps)
    day(
      "day-1",
      1,
      "Chest Day",
      1,
      section(
        "s1-hypertrophy",
        "hypertrophy",
        "Chest Volume",
        group("g1", ex("e1", "Bench Press", 5, "8-12", ["chest", "front delts"], ["triceps"])),
        group("g2", ex("e2", "Incline Bench Press", 4, "8-12", ["chest", "front delts"], ["triceps"])),
        group("g3", ex("e3", "Decline Bench Press", 4, "8-12", ["chest"], ["triceps"])),
        group("g4", ex("e4", "DB Flyes", 4, "12-15", ["chest"])),
        group("g5", ex("e5", "Cable Crossover", 4, "12-15", ["chest"])),
        group("g6", ex("e6", "Pec Deck", 3, "12-15", ["chest"])),
        group("g7", ex("e7", "Push-Up", 3, "15-20", ["chest", "front delts"], ["triceps"])),
        group("g8", ex("e8", "Dip", 3, "8-12", ["chest", "triceps"], ["front delts"])),
        group("g9", ex("e9", "Landmine Press", 3, "10-12", ["chest", "front delts"], ["triceps"])),
        group("g10", ex("e10", "Machine Chest Press", 3, "10-12", ["chest"], ["triceps"])),
        group("g11", ex("e11", "Close-Grip Bench Press", 3, "8-10", ["triceps"], ["chest"])),
      ),
    ),

    // Day 2 — Shoulders and Arms (no back, no legs)
    day(
      "day-2",
      2,
      "Shoulders and Arms",
      1,
      section(
        "s2-hypertrophy",
        "hypertrophy",
        "Shoulders and Arms",
        group("g12", ex("e12", "Overhead Press", 4, "8-10", ["front delts", "shoulders"], ["triceps"])),
        group("g13", ex("e13", "Lateral Raise", 4, "12-15", ["shoulders"])),
        group("g14", ex("e14", "Front Raise", 3, "12-15", ["front delts"])),
        group("g15", ex("e15", "Barbell Curl", 3, "10-12", ["biceps"])),
        group("g16", ex("e16", "Skull Crusher", 3, "10-12", ["triceps"])),
      ),
    ),
  ],
);

// ---------------------------------------------------------------------------
// multiWeekProgram — 4-week progressive overload + deload block
// ---------------------------------------------------------------------------

export const multiWeekProgram: ProgramDocument = program(
  "multiweek-1",
  "4-Week Block",
  [
    // Week 1 — 3 sets, moderate intensity
    day(
      "day-w1",
      1,
      "Upper",
      1,
      section(
        "s-w1",
        "strength",
        "Strength",
        group("g-w1-1", ex("e-w1-bench", "Bench Press", 3, "8-10", ["chest", "front delts"], ["triceps"])),
        group("g-w1-2", ex("e-w1-row", "Barbell Row", 3, "8-10", ["upper back", "lats"], ["biceps"])),
      ),
    ),

    // Week 2 — 4 sets, same intensity
    day(
      "day-w2",
      1,
      "Upper",
      2,
      section(
        "s-w2",
        "strength",
        "Strength",
        group("g-w2-1", ex("e-w2-bench", "Bench Press", 4, "8-10", ["chest", "front delts"], ["triceps"])),
        group("g-w2-2", ex("e-w2-row", "Barbell Row", 4, "8-10", ["upper back", "lats"], ["biceps"])),
      ),
    ),

    // Week 3 — 5 sets, higher intensity (lower reps)
    day(
      "day-w3",
      1,
      "Upper",
      3,
      section(
        "s-w3",
        "strength",
        "Strength",
        group("g-w3-1", ex("e-w3-bench", "Bench Press", 5, "6-8", ["chest", "front delts"], ["triceps"])),
        group("g-w3-2", ex("e-w3-row", "Barbell Row", 5, "6-8", ["upper back", "lats"], ["biceps"])),
      ),
    ),

    // Week 4 — Deload: 2 sets, easy reps
    day(
      "day-w4",
      1,
      "Deload",
      4,
      section(
        "s-w4",
        "strength",
        "Deload",
        group("g-w4-1", ex("e-w4-bench", "Bench Press", 2, "10-12", ["chest", "front delts"], ["triceps"])),
        group("g-w4-2", ex("e-w4-row", "Barbell Row", 2, "10-12", ["upper back", "lats"], ["biceps"])),
      ),
    ),
  ],
);
