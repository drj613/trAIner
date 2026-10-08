import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportClient } from "./ImportClient";
import { getRenderableDays } from "@/lib/programs/overrides";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { toTitleCase } from "@/lib/catalog/normalize";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: mockSaveProgram }),
}));

const mockSaveProgram = jest.fn().mockResolvedValue(undefined);

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
      source: "import",
      active: true,
      createdAt: "2026-10-08",
      updatedAt: "2026-10-08",
      days: [
        {
          id: "day-1",
          day: 1,
          dayNumber: 1,
          title: "Day 1",
          sections: [
            {
              id: "section-1",
              name: "Main",
              type: "strength",
              groups: [
                {
                  id: "group-1",
                  type: "single",
                  exercises: [
                    {
                      id: "exercise-1",
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

  it("saves the structured edit from the review draft", async () => {
    mockSaveProgram.mockClear();
    const user = userEvent.setup();
    render(<ImportClient />);
    fireEvent.change(screen.getByPlaceholderText('{ "program_name": "...", "days": [...] }'), { target: { value: "{}" } });
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    const setCount = await screen.findByLabelText("Sets");
    fireEvent.change(setCount, { target: { value: "5" } });
    fireEvent.blur(setCount);
    await user.click(await screen.findByRole("button", { name: "Apply edit" }));
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    expect(mockSaveProgram).toHaveBeenCalledTimes(1);
    expect(getRenderableDays(mockSaveProgram.mock.calls[0][0])[0].sections[0].groups[0].exercises[0].sets).toBe(5);
  });

  it("reopens exercise resolution after adding an exercise in review", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);
    fireEvent.change(screen.getByPlaceholderText('{ "program_name": "...", "days": [...] }'), { target: { value: "{}" } });
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    await user.click(await screen.findByRole("button", { name: "Add exercise" }));
    await user.click(await screen.findByRole("button", { name: "Apply edit" }));
    expect(await screen.findByRole("heading", { name: "Resolve exercises" })).toBeInTheDocument();
    expect(screen.getByText(/1 exercise need attention/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Remember "New exercise"/i)).toBeInTheDocument();
  });

  it("saves catalog identity selected in the review editor", async () => {
    mockSaveProgram.mockClear();
    const user = userEvent.setup();
    render(<ImportClient />);
    fireEvent.change(screen.getByPlaceholderText('{ "program_name": "...", "days": [...] }'), { target: { value: "{}" } });
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    const catalogItem = exerciseCatalog[0];
    fireEvent.change(screen.getByLabelText("Search exercise catalog"), { target: { value: toTitleCase(catalogItem.name) } });
    fireEvent.change(screen.getByLabelText("Choose catalog exercise"), { target: { value: catalogItem.id } });
    await user.click(await screen.findByRole("button", { name: "Apply edit" }));
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    const saved = mockSaveProgram.mock.calls[0][0];
    expect(getRenderableDays(saved)[0].sections[0].groups[0].exercises[0].canonicalExerciseId).toBe(catalogItem.id);
  });
});
