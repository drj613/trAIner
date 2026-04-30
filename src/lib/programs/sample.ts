import type { ProfileDocument, ProgramDocument } from "./types";

export const defaultProfile: ProfileDocument = {
  id: "local-profile",
  name: "Local Athlete",
  goals: ["Build strength", "Stay consistent"],
  equipment: ["barbell", "dumbbells", "cables", "pull-up bar"],
  constraints: ["Prefer phone-friendly sessions"],
  trainingAge: "intermediate",
  defaultDaysPerWeek: 4,
  updatedAt: "2026-04-24T00:00:00.000Z",
  body: { age: "—", height: "—", weight: "—", bodyfat: "—" },
  history: ["intermediate lifter"],
  injuries: [],
  schedule: ["4 days/week", "60–75 min sessions"],
  preferences: ["prefer free weights over machines"],
};

export const demoProgram: ProgramDocument = {
  id: "demo-program",
  title: "Local First Demo",
  description: "A small bundled program so the shell has useful offline content before import.",
  source: "manual",
  active: true,
  days: [
    {
      id: "demo-day-1",
      dayNumber: 1,
      weekNumber: 1,
      title: "Upper Pull And Press",
      sections: [
        {
          id: "demo-section-warmup",
          type: "warmup",
          name: "Warm-Up Circuit",
          groups: [
            {
              id: "demo-group-warmup",
              type: "circuit",
              notes: "Move steadily and keep shoulders warm.",
              exercises: [
                {
                  id: "demo-ex-face-pull",
                  name: "Banded Face Pulls",
                  canonicalExerciseId: "banded-face-pull",
                  sets: 1,
                  reps: "20",
                  tags: {
                    primary: ["rear delts"],
                    secondary: ["rotator cuff"],
                    incidental: [],
                    modifiers: ["warmup", "prehab"]
                  }
                }
              ]
            }
          ]
        },
        {
          id: "demo-section-strength",
          type: "strength",
          name: "Strength",
          groups: [
            {
              id: "demo-group-strength",
              type: "single",
              exercises: [
                {
                  id: "demo-ex-pullup",
                  name: "Pull-Up",
                  canonicalExerciseId: "pull-up",
                  sets: 4,
                  reps: "5-8",
                  rest: "2:00",
                  tags: {
                    primary: ["lats"],
                    secondary: ["biceps"],
                    incidental: [],
                    modifiers: ["vertical pull"]
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  overrides: [],
  profileSnapshot: defaultProfile,
  createdAt: "2026-04-24T00:00:00.000Z",
  updatedAt: "2026-04-24T00:00:00.000Z"
};
