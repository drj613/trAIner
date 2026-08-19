import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportClient } from "./ImportClient";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: jest.fn() }),
}));

jest.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: { list: jest.fn().mockResolvedValue([]), saveMany: jest.fn() },
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
      overrides: [],
    },
    warnings: [],
  })),
}));

// `@/lib/import/resolution` is deliberately NOT mocked. A partial mock of it
// went stale the moment ImportClient imported another of its exports, and only
// stayed green because this test never leaves the paste step — the next person
// to click Validate here would have got `groupResolutionOccurrences is not a
// function`. The real module is pure and cheap, so there is nothing to fake.

describe("ImportClient confirm step pluralization", () => {
  it("does not use (s) suffixes in confirm step", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);

    // Reach the step this test is named after. Asserting on the paste step's
    // text could never have distinguished singular copy from "(s)" copy,
    // because the strings under test are not on that step at all.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "{}" } });
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    expect(await screen.findByText(/1 day · 1 exercise/)).toBeInTheDocument();

    const documentText = document.body.textContent || "";
    expect(documentText).not.toMatch(/day\(s\)/);
    expect(documentText).not.toMatch(/exercise\(s\)/);
  });
});
