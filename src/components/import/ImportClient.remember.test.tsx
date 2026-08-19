// Import save, driven through the REAL parser, resolution grouping, and
// catalogue — only the repositories and the router are mocked. The rule under
// test is the product rule: a resolution chosen during import is LOCAL to that
// import, and only an explicit "Remember this interpretation" writes an alias.
//
// The "already taken" and "rejected outright" tests are the regression guards
// for the alias-conflict break: alias save rejects a token that already means
// something else, and before this it took the whole import down with it.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportClient } from "./ImportClient";
import { collectNamed } from "@/lib/import/resolution.testFixtures";
import fixture from "@/lib/import/__fixtures__/eight-back-squats.json";
import type { AliasDocument, ProgramDocument } from "@/lib/programs/types";

const mockSaveProgram = jest.fn();
const mockNavigate = jest.fn();
const mockAliasList = jest.fn<Promise<AliasDocument[]>, []>();
const mockAliasSaveMany = jest.fn();

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: mockSaveProgram }),
}));

jest.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: {
    list: () => mockAliasList(),
    saveMany: (...args: unknown[]) => mockAliasSaveMany(...args),
  },
}));

jest.mock("@/lib/storage/userExerciseRepo", () => ({
  userExerciseRepo: { list: jest.fn().mockResolvedValue([]), save: jest.fn() },
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const danglingBackSquatAlias: AliasDocument = {
  id: "alias-1",
  alias: "Back Squat",
  normalizedAlias: "back squat",
  // The exercise this alias was remembered as no longer exists, so the name
  // becomes an underspecified choice again — while the alias row keeps
  // occupying the "back squat" token.
  canonicalExerciseId: "user-exercise-since-deleted",
  provenance: "remembered",
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAliasList.mockResolvedValue([]);
  mockSaveProgram.mockResolvedValue(undefined);
  mockAliasSaveMany.mockResolvedValue(undefined);
});

async function chooseVersion(optionId: string) {
  const user = userEvent.setup();
  render(<ImportClient />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: JSON.stringify(fixture) },
  });
  await user.click(screen.getByRole("button", { name: "Validate →" }));
  const select = await screen.findByLabelText("Choose version for Back Squat");
  await user.selectOptions(select, optionId);
  return user;
}

async function reviewAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /review import/i }));
  await user.click(screen.getByRole("button", { name: /save program/i }));
}

function savedProgram(): ProgramDocument {
  return mockSaveProgram.mock.calls[0][0] as ProgramDocument;
}

describe("ImportClient: import choices are local by default", () => {
  it("saves the choice into the program and remembers nothing", async () => {
    const user = await chooseVersion("barbell-high-bar-squat");
    await reviewAndSave(user);

    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    // The effect, not a spinner: all eight occurrences carry the choice.
    expect(
      collectNamed(savedProgram(), "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(8).fill("barbell-high-bar-squat"));
    // ...and nothing was written to the global alias table.
    expect(mockAliasSaveMany).not.toHaveBeenCalled();
  });

  it("persists exactly one bulk alias write for an explicit Remember", async () => {
    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(
      screen.getByRole("checkbox", { name: "Remember this interpretation" }),
    );
    await reviewAndSave(user);

    await waitFor(() => expect(mockAliasSaveMany).toHaveBeenCalledTimes(1));
    expect(mockAliasSaveMany).toHaveBeenCalledWith([
      {
        alias: "Back Squat",
        canonicalExerciseId: "barbell-low-bar-squat",
        provenance: "remembered",
      },
    ]);
    expect(mockSaveProgram).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });

  it("keeps the import when a remembered name is already taken", async () => {
    mockAliasList.mockResolvedValue([danglingBackSquatAlias]);

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(
      screen.getByRole("checkbox", { name: "Remember this interpretation" }),
    );
    await reviewAndSave(user);

    // The routine is saved — the whole point. It used to be lost entirely.
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    expect(
      collectNamed(savedProgram(), "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(8).fill("barbell-low-bar-squat"));

    // The occupied token is never overwritten, and no batch is attempted that
    // the store would only reject.
    expect(mockAliasSaveMany).not.toHaveBeenCalled();

    // The user is told which name is taken, and is not stranded on this step.
    const notice = await screen.findByText(/already remembered/i);
    expect(notice).toHaveTextContent("Back Squat");
    expect(screen.getByRole("button", { name: /open program/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("offers the save again once the user changes their mind", async () => {
    mockAliasList.mockResolvedValue([danglingBackSquatAlias]);

    const user = await chooseVersion("barbell-low-bar-squat");
    const remember = screen.getByRole("checkbox", {
      name: "Remember this interpretation",
    });
    await user.click(remember);
    await reviewAndSave(user);
    await screen.findByRole("button", { name: /open program/i });

    // Drop the Remember tick: the conflict is gone, so saving is on offer
    // again rather than leaving a stale "already saved" state on screen.
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(
      screen.getByRole("checkbox", { name: "Remember this interpretation" }),
    );
    await user.click(screen.getByRole("button", { name: /review import/i }));
    expect(screen.getByRole("button", { name: /save program/i })).toBeInTheDocument();
    expect(screen.queryByText(/already remembered/i)).not.toBeInTheDocument();
  });

  it("keeps the import even if the alias write is rejected outright", async () => {
    // The token is free at check time and taken by the time we write — the
    // race the store's own guard exists for. Losing a shortcut is acceptable;
    // losing the routine is not.
    mockAliasSaveMany.mockRejectedValue(new Error("ConstraintError"));

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(
      screen.getByRole("checkbox", { name: "Remember this interpretation" }),
    );
    await reviewAndSave(user);

    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    expect(
      collectNamed(savedProgram(), "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(8).fill("barbell-low-bar-squat"));
    expect(mockAliasSaveMany).toHaveBeenCalledTimes(1);

    const notice = await screen.findByText(/routine is saved/i);
    expect(notice).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open program/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
