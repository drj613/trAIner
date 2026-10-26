// Fictional documentation data. No exported personal data or browser profile.
export const FIXED_TIME = "2026-10-26T15:00:00-04:00";
export const routine = {
  program_name: "Everyday Strength",
  description: "Three focused sessions each week. Build strength with steady, repeatable progress.",
  weeks: 4,
  days: [
    {
      day: 1, title: "Lower body",
      sections: [
        { type: "warmup", name: "Warm up", groups: [{ type: "single", exercises: [
          { name: "Bodyweight Squat", sets: 1, reps: "10", load: "bodyweight", notes: "Easy pace, comfortable depth." },
        ] }] },
        { type: "strength", name: "Main lift", groups: [{ type: "single", exercises: [
          { name: "Squat", sets: 3, reps: "5", load: "135 lb", rest: "2:00", notes: "Leave two reps in reserve." },
        ] }] },
        { type: "accessory", name: "Accessory", groups: [{ type: "single", exercises: [
          { name: "Dumbbell Romanian Deadlift", sets: 2, reps: "10", load: "35 lb", rest: "90s" },
        ] }] },
      ],
    },
    {
      day: 2, title: "Upper body",
      sections: [
        { type: "warmup", name: "Warm up", groups: [{ type: "single", exercises: [{ name: "Band Pull-Apart", sets: 1, reps: "15", load: "light band" }] }] },
        { type: "strength", name: "Main lift", groups: [{ type: "single", exercises: [{ name: "Barbell Bench Press", sets: 3, reps: "8", load: "95 lb", rest: "2:00" }] }] },
        { type: "accessory", name: "Accessory", groups: [{ type: "single", exercises: [{ name: "Dumbbell Row", sets: 2, reps: "10", load: "35 lb", rest: "90s" }] }] },
      ],
    },
    {
      day: 3, title: "Full body",
      sections: [
        { type: "warmup", name: "Warm up", groups: [{ type: "single", exercises: [{ name: "Glute Bridge", sets: 1, reps: "12", load: "bodyweight" }] }] },
        { type: "strength", name: "Main lift", groups: [{ type: "single", exercises: [{ name: "Barbell Deadlift", sets: 3, reps: "5", load: "165 lb", rest: "2:00" }] }] },
        { type: "accessory", name: "Accessory", groups: [{ type: "single", exercises: [{ name: "Dumbbell Shoulder Press", sets: 2, reps: "10", load: "25 lb", rest: "90s" }] }] },
      ],
    },
  ],
};

export const profile = {
  id: "local-profile" as const,
  name: "Alex Morgan",
  goals: ["Build consistent strength", "Improve everyday energy", "Train three days each week"],
  primaryGoal: "strength" as const,
  equipment: ["Barbell and rack", "Dumbbells", "Resistance bands"],
  constraints: ["Keep sessions under 50 minutes"],
  trainingAge: "2 years, intermediate",
  defaultDaysPerWeek: 3,
  body: { age: "32", height: "5 ft 9 in", weight: "168 lb" },
  history: ["Two years of recreational lifting", "Returning after a busy summer"],
  schedule: ["Monday, Wednesday, Friday", "45–50 minutes per session"],
  preferences: ["Simple compound lifts", "Leave two reps in reserve"],
  injuries: ["No current injuries"],
  updatedAt: "2026-10-26T19:00:00.000Z",
};
