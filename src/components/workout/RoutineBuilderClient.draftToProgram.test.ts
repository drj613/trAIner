import { draftToProgram } from "./RoutineBuilderClient";
import type { SectionType } from "@/lib/programs/types";

function draftWithSection(kind: SectionType) {
  return {
    name: "Test Routine",
    description: "",
    days: [
      {
        id: "day1",
        name: "Day 1",
        subtitle: "",
        rest: false,
        sections: [
          {
            id: "section1",
            kind,
            groups: [
              {
                id: "group1",
                exercises: [
                  {
                    id: "ex1",
                    catalogId: "cat1",
                    name: "Test Exercise",
                    sets: 3,
                    reps: "10",
                    muscles: [],
                    equipment: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("draftToProgram manual-builder volume defaults", () => {
  const expected: { kind: SectionType; countsTowardVolume: boolean }[] = [
    { kind: "warmup", countsTowardVolume: false },
    { kind: "mobility", countsTowardVolume: false },
    { kind: "cardio", countsTowardVolume: false },
    { kind: "rehab", countsTowardVolume: false },
    { kind: "strength", countsTowardVolume: true },
    { kind: "hypertrophy", countsTowardVolume: true },
    { kind: "metcon", countsTowardVolume: true },
    { kind: "conditioning", countsTowardVolume: true },
    { kind: "training", countsTowardVolume: true },
  ];

  for (const { kind, countsTowardVolume } of expected) {
    it(`assigns countsTowardVolume:${countsTowardVolume} for a ${kind} section`, () => {
      const program = draftToProgram(draftWithSection(kind));
      expect(program.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(countsTowardVolume);
    });
  }
});
