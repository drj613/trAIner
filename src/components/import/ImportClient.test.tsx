import { render, screen } from "@testing-library/react";
import { ImportClient } from "./ImportClient";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: jest.fn() }),
}));

jest.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: { list: jest.fn().mockResolvedValue([]), save: jest.fn() },
}));

jest.mock("@/lib/storage/userExerciseRepo", () => ({
  userExerciseRepo: { list: jest.fn().mockResolvedValue([]), save: jest.fn() },
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
}));

// Mock the parser to return a test program
jest.mock("@/lib/import/parser", () => ({
  parseProgramJson: jest.fn(() => ({
    program: {
      id: "test-prog",
      title: "Test Program",
      days: [
        {
          day: 1,
          title: "Day 1",
          sections: [
            {
              name: "Main",
              type: "strength",
              groups: [
                {
                  type: "single",
                  exercises: [
                    {
                      name: "Squat",
                      sets: 3,
                      reps: "5",
                      tags: {
                        primary: ["quads"],
                        secondary: [],
                        incidental: [],
                        modifiers: [],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    warnings: [],
  })),
}));

// Mock the resolution module
jest.mock("@/lib/import/resolution", () => ({
  extractUnresolvedExercises: jest.fn().mockReturnValue([]),
  applyResolutions: jest.fn((p) => p),
  buildInitialResolutions: jest.fn().mockReturnValue({}),
  CUSTOM_ID: "__custom__",
}));

describe("ImportClient confirm step pluralization", () => {
  it("does not use (s) suffixes in confirm step", () => {
    render(<ImportClient />);

    // Verify that the component doesn't render the old format with (s)
    const documentText = document.body.textContent || "";

    // Check that we don't have the old format anywhere in rendered output
    expect(documentText).not.toMatch(/day\(s\)/);
    expect(documentText).not.toMatch(/exercise\(s\)/);
  });
});
