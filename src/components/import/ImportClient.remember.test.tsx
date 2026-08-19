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
import { deleteDB } from "idb";
import { ImportClient } from "./ImportClient";
import { collectNamed } from "@/lib/import/resolution.testFixtures";
import fixture from "@/lib/import/__fixtures__/eight-back-squats.json";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import type { AliasDocument, ProgramDocument } from "@/lib/programs/types";

const mockSaveProgram = jest.fn();
const mockNavigate = jest.fn();
let saveManySpy: jest.SpyInstance;

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: mockSaveProgram }),
}));

// `@/lib/storage/aliasRepo` is deliberately NOT mocked. A partial mock of it
// only stayed green while no test touched the un-mocked exports, and would
// have thrown `is not a function` for the next person who added one — the same
// trap already removed from `ImportClient.test.tsx`. The real repository runs
// against fake-indexeddb, so every "an alias was / was not written" assertion
// below reads STORAGE rather than a spy, and `saveMany`'s own token derivation
// and conflict guard are exercised instead of imagined. `saveManySpy` calls
// through: it exists only to count transactions, which storage cannot show.

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

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
  mockSaveProgram.mockResolvedValue(undefined);
  saveManySpy = jest.spyOn(aliasRepo, "saveMany");
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Every remembered alias currently in storage, in a stable shape. */
async function storedAliases() {
  return (await aliasRepo.list())
    .map(({ alias, normalizedAlias, canonicalExerciseId, provenance }) => ({
      alias,
      normalizedAlias,
      canonicalExerciseId,
      provenance,
    }))
    .sort((left, right) => left.normalizedAlias.localeCompare(right.normalizedAlias));
}

// One base-day path, four stored exercises — the two numbers the confirm step
// must not confuse.
const fourWeekJson = JSON.stringify({
  program_name: "Four weeks, one squat",
  weeks: 4,
  days: [
    {
      day: 1,
      title: "Lower",
      sections: [
        {
          name: "Main",
          type: "strength",
          groups: [{ type: "single", exercises: [{ name: "Back Squat", sets: 5, reps: "5" }] }],
        },
      ],
    },
  ],
});

// A name the resolver can never look an alias up for: `or` is a
// `reject-alternative` phrase, so `resolveName` returns a standalone result
// before it ever consults the alias table.
const alternativeNameJson = JSON.stringify({
  program_name: "Alternatives",
  days: [
    {
      day: 1,
      title: "Lower",
      sections: [
        {
          name: "Main",
          type: "strength",
          groups: [
            { type: "single", exercises: [{ name: "Back Squat or Lunge", sets: 3, reps: "5" }] },
          ],
        },
      ],
    },
  ],
});

async function pasteAndValidate(
  user: ReturnType<typeof userEvent.setup>,
  json = JSON.stringify(fixture),
) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: json } });
  await user.click(screen.getByRole("button", { name: "Validate →" }));
  return screen.findByLabelText("Choose version for Back Squat");
}

async function chooseVersion(optionId: string, json = JSON.stringify(fixture)) {
  const user = userEvent.setup();
  render(<ImportClient />);
  await user.selectOptions(await pasteAndValidate(user, json), optionId);
  return user;
}

function rememberBox() {
  return screen.getByRole("checkbox", { name: /^Remember "Back Squat"/ });
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
    // ...and nothing was written to the global alias table. Read from storage,
    // not from a spy: an empty table cannot be satisfied by a write that was
    // attempted and swallowed.
    expect(await storedAliases()).toEqual([]);
    expect(saveManySpy).not.toHaveBeenCalled();
  });

  it("persists exactly one bulk alias write for an explicit Remember", async () => {
    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);

    // Exactly one bulk write — one transaction, one identity event — and the
    // row that actually landed, including the token the store derived for it.
    await waitFor(() => expect(saveManySpy).toHaveBeenCalledTimes(1));
    await waitFor(async () =>
      expect(await storedAliases()).toEqual([
        {
          alias: "Back Squat",
          normalizedAlias: "back squat",
          canonicalExerciseId: "barbell-low-bar-squat",
          provenance: "remembered",
        },
      ]),
    );
    expect(mockSaveProgram).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
  });

  it("keeps the import when a remembered name is already taken", async () => {
    await aliasRepo.putRaw(danglingBackSquatAlias);

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);

    // The routine is saved — the whole point. It used to be lost entirely.
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    expect(
      collectNamed(savedProgram(), "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(8).fill("barbell-low-bar-squat"));

    // The occupied token is never overwritten, and no batch is attempted that
    // the store would only reject.
    expect(saveManySpy).not.toHaveBeenCalled();
    expect(await storedAliases()).toEqual([
      {
        alias: "Back Squat",
        normalizedAlias: "back squat",
        canonicalExerciseId: "user-exercise-since-deleted",
        provenance: "remembered",
      },
    ]);

    // The user is told which name is taken, and is not stranded on this step.
    const notice = await screen.findByText(/already remembered/i);
    expect(notice).toHaveTextContent("Back Squat");
    expect(screen.getByRole("button", { name: /open program/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("offers the save again once the user changes their mind", async () => {
    await aliasRepo.putRaw(danglingBackSquatAlias);

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);
    await screen.findByRole("button", { name: /open program/i });

    // Drop the Remember tick: the conflict is gone, so saving is on offer
    // again rather than leaving a stale "already saved" state on screen.
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(rememberBox());
    await user.click(screen.getByRole("button", { name: /review import/i }));
    expect(screen.getByRole("button", { name: /save program/i })).toBeInTheDocument();
    expect(screen.queryByText(/already remembered/i)).not.toBeInTheDocument();
  });

  it("keeps the import even if the alias write is rejected outright", async () => {
    // The token is free at check time and taken by the time we write — the
    // race the store's own guard exists for. Losing a shortcut is acceptable;
    // losing the routine is not.
    saveManySpy.mockRejectedValue(new Error("ConstraintError"));

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);

    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    expect(
      collectNamed(savedProgram(), "Back Squat").map((e) => e.canonicalExerciseId),
    ).toEqual(Array(8).fill("barbell-low-bar-squat"));
    expect(saveManySpy).toHaveBeenCalledTimes(1);

    const notice = await screen.findByText(/routine is saved/i);
    expect(notice).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open program/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("ImportClient: what a failed or repeated save must not do", () => {
  it("writes no alias when the routine itself could not be saved", async () => {
    // Ordering is what protects this: an alias is a permanent shortcut for a
    // routine, so persisting one for an import the user does not have would
    // leave a mapping pointing at nothing they can see.
    mockSaveProgram.mockRejectedValue(new Error("QuotaExceededError"));

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);

    await waitFor(() => expect(screen.getByText(/QuotaExceededError/)).toBeInTheDocument());
    expect(mockSaveProgram).toHaveBeenCalledTimes(1);
    expect(saveManySpy).not.toHaveBeenCalled();
    expect(await storedAliases()).toEqual([]);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not remember a stale tick after the choice becomes ambiguous and settles elsewhere", async () => {
    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());

    // Split the occurrences, which makes Remember impossible...
    await user.click(
      screen.getByRole("button", { name: /resolve occurrences separately/i }),
    );
    const occurrence = screen.getByLabelText(
      "Choose version for Back Squat at days.2.sections.0.groups.0.exercises.0",
    );
    await user.selectOptions(occurrence, "barbell-high-bar-squat");
    expect(rememberBox()).toBeDisabled();

    // ...then settle every occurrence on a version the user never ticked for.
    await user.selectOptions(occurrence, "barbell-low-bar-squat");
    expect(rememberBox()).not.toBeChecked();

    await reviewAndSave(user);
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    expect(saveManySpy).not.toHaveBeenCalled();
    expect(await storedAliases()).toEqual([]);
  });

  it("re-validating the same paste updates one program instead of creating a second", async () => {
    // The conflict path deliberately does not navigate away, so the user can
    // walk back to the paste step and validate again. That reparses with a
    // fresh program id, which used to leave two documents for one routine.
    await aliasRepo.putRaw(danglingBackSquatAlias);

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);
    await screen.findByRole("button", { name: /open program/i });

    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.selectOptions(await pasteAndValidate(user), "barbell-high-bar-squat");
    await reviewAndSave(user);

    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(2));
    const [first, second] = mockSaveProgram.mock.calls.map(([program]) => program as ProgramDocument);
    expect(second.id).toBe(first.id);
  });

  // The inverse of the test above, and the one that matters for data safety:
  // reusing the saved id is a WRITE OVER an existing document, so the rule that
  // decides when to reuse it has to be pinned in both directions. IndexedDB is
  // the user's only copy — silently replacing routine A with routine B is
  // permanent loss of A. Two guards block it (handleValidate clears the id when
  // the text changed, handleSave re-checks it); with both loosened the whole
  // suite stayed green, which is why this test exists.
  it("saves a different paste as a new routine instead of overwriting the first", async () => {
    await aliasRepo.putRaw(danglingBackSquatAlias);

    const user = await chooseVersion("barbell-low-bar-squat");
    await user.click(rememberBox());
    await reviewAndSave(user);
    await screen.findByRole("button", { name: /open program/i });

    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.selectOptions(
      await pasteAndValidate(user, fourWeekJson),
      "barbell-high-bar-squat",
    );
    await reviewAndSave(user);

    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(2));
    const [first, second] = mockSaveProgram.mock.calls.map(([program]) => program as ProgramDocument);
    // The routines really are different, so "same id" would mean the first is
    // gone rather than merely re-saved.
    expect(first.title).not.toBe(second.title);
    expect(second.title).toBe("Four weeks, one squat");
    expect(second.id).not.toBe(first.id);
  });

  it("counts stored exercises in the confirm summary, not occurrence paths", async () => {
    const user = await chooseVersion("barbell-high-bar-squat", fourWeekJson);
    await user.click(screen.getByRole("button", { name: /review import/i }));
    // One warning path; four week-clones actually mapped.
    expect(screen.getByText(/4 exercises mapped to catalog/i)).toBeInTheDocument();
    expect(screen.queryByText(/1 exercise mapped to catalog/i)).not.toBeInTheDocument();

    // The custom tally is the same claim about the same routine, so it counts
    // the same way. Pinned separately because it is computed separately.
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /keep as custom/i }));
    await user.click(screen.getByRole("button", { name: /review import/i }));
    expect(screen.getByText(/4 exercises imported as custom/i)).toBeInTheDocument();
    expect(screen.queryByText(/1 exercise imported as custom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mapped to catalog/i)).not.toBeInTheDocument();
  });
});

describe("ImportClient: a Remember tick that could never take effect", () => {
  it("refuses it in words, and stores nothing, for a name that offers a choice", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: alternativeNameJson },
    });
    await user.click(screen.getByRole("button", { name: "Validate →" }));

    // Answer it for this import, which is the only thing that makes the tick
    // reachable at all.
    await user.click(await screen.findByRole("button", { name: /Barbell Back Squat/i }));

    const remember = screen.getByRole("checkbox", { name: /^Remember "Back Squat or Lunge"/ });
    expect(remember).toBeDisabled();
    expect(screen.getByText(/names more than one exercise/i)).toBeInTheDocument();

    await reviewAndSave(user);
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    // The import itself still carries the answer...
    expect(
      collectNamed(savedProgram(), "Back Squat or Lunge").map((e) => e.canonicalExerciseId),
    ).toEqual(["barbell-back-squat"]);
    // ...and no unreadable row was written for it.
    expect(await storedAliases()).toEqual([]);
  });
});
