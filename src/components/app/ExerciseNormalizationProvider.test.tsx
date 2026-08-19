import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import { deleteDB } from "idb";
import { dispatchExerciseIdentityChanged } from "@/lib/catalog/identityEvents";
import type { AliasDocument, UserExerciseDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import { logRepo } from "@/lib/storage/logRepo";
import {
  normalizationOverrideRepo,
  type NormalizationOverrideSaveInput,
} from "@/lib/storage/normalizationOverrideRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";
import { ExerciseNormalizationProvider, useExerciseNormalization } from "./ExerciseNormalizationProvider";

// `Hatfield Squat` is a real catalogue entry (`ssb-hatfield-squat`) carrying
// `movementId: null`, so it resolves to a concrete exercise with NO family
// until an override assigns one. That makes it the honest fixture for "a
// committed correction changes what the resolver returns": the movement name
// flips from absent to `Squat` and nothing else about the entry moves.
const hatfieldSquatOverride: NormalizationOverrideSaveInput = {
  targetKind: "exercise-id",
  targetValue: "ssb-hatfield-squat",
  movementId: "squat",
  movementModifierIds: ["barbell"],
};

type ObservedSnapshot = {
  version: number;
  aliases: number;
  userExercises: number;
  overrides: number;
};

function Probe({ observed }: { observed?: ObservedSnapshot[] }) {
  const { version, context, loaded, resolve } = useExerciseNormalization();
  const identity = resolve({ kind: "import-name", name: "Hatfield Squat" });
  const unknown = resolve({ kind: "import-name", name: "Zzz Unknown Lift" });

  observed?.push({
    version,
    aliases: context.aliases.length,
    userExercises: context.userExercises.length,
    overrides: context.normalizationOverrides.length,
  });

  return (
    <>
      <span data-testid="version">{version}</span>
      <span data-testid="loaded">{String(loaded)}</span>
      <span data-testid="movement">{identity.movementName ?? "Standalone"}</span>
      <span data-testid="unknown">{unknown.displayLabel}</span>
    </>
  );
}

function renderProvider(observed?: ObservedSnapshot[]) {
  return render(
    <ExerciseNormalizationProvider>
      <Probe observed={observed} />
    </ExerciseNormalizationProvider>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.getByTestId("loaded")).toHaveTextContent("true"));
}

describe("ExerciseNormalizationProvider", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDbConnection();
  });

  it("requires a surrounding provider", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow(
      "useExerciseNormalization must be used within ExerciseNormalizationProvider.",
    );

    errorSpy.mockRestore();
  });

  it("atomically reloads after a committed identity event", async () => {
    renderProvider();

    expect(screen.getByTestId("version")).toHaveTextContent("1");
    expect(screen.getByTestId("movement")).toHaveTextContent("Standalone");
    await waitForLoaded();

    await act(async () => {
      await normalizationOverrideRepo.save(hatfieldSquatOverride);
    });

    await waitFor(() => expect(screen.getByTestId("version")).toHaveTextContent("2"));
    expect(screen.getByTestId("movement")).toHaveTextContent("Squat");
  });

  it("never publishes a snapshot where one store is fresh and another stale", async () => {
    const observed: ObservedSnapshot[] = [];
    renderProvider(observed);
    await waitForLoaded();

    // Each store's read is pushed behind a real macrotask boundary. Three
    // IndexedDB reads genuinely complete at different times, and without that
    // boundary React's automatic batching hides a per-store reload behind one
    // commit — a torn snapshot that exists but that no test can observe. With
    // it, any reload that applies stores one at a time must commit a render
    // between them.
    const delayedList = <T,>(read: () => Promise<T>) => () =>
      new Promise<T>((resolve) => {
        setTimeout(() => {
          void read().then(resolve);
        }, 0);
      });
    const readAliases = aliasRepo.list.bind(aliasRepo);
    const readUserExercises = userExerciseRepo.list.bind(userExerciseRepo);
    const readOverrides = normalizationOverrideRepo.list.bind(normalizationOverrideRepo);
    jest.spyOn(aliasRepo, "list").mockImplementation(delayedList(readAliases));
    jest.spyOn(userExerciseRepo, "list").mockImplementation(delayedList(readUserExercises));
    jest.spyOn(normalizationOverrideRepo, "list").mockImplementation(delayedList(readOverrides));

    // One batch, one event: the first two writes suppress their own
    // notification, so the single reload the provider performs must see all
    // three new rows together.
    await act(async () => {
      await aliasRepo.save(
        { alias: "Hatfield Squat", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" },
        { dispatch: false },
      );
      await userExerciseRepo.save("My squat", { dispatch: false });
      await normalizationOverrideRepo.save(hatfieldSquatOverride);
    });

    await waitFor(() => expect(screen.getByTestId("version")).toHaveTextContent("2"));

    // Every store gains exactly one row, so the only coherent snapshots are
    // all-zero and all-one. The assertion names no ordering, because which
    // store lands first in a per-store reload is not something this test
    // controls.
    expect(
      observed.filter(
        (snapshot) =>
          new Set([snapshot.aliases, snapshot.userExercises, snapshot.overrides]).size !== 1,
      ),
    ).toEqual([]);
    // Completion canary: without it the assertion above is satisfied by a
    // provider that never loaded anything at all.
    expect(observed.at(-1)).toEqual({ version: 2, aliases: 1, userExercises: 1, overrides: 1 });
    // One committed event advances the snapshot exactly one generation.
    expect(Math.max(...observed.map((snapshot) => snapshot.version))).toBe(2);
  });

  it("reloads once per event and never reads logs", async () => {
    const aliasList = jest.spyOn(aliasRepo, "list");
    const overrideList = jest.spyOn(normalizationOverrideRepo, "list");
    const logList = jest.spyOn(logRepo, "list");

    renderProvider();
    await waitForLoaded();
    expect(aliasList).toHaveBeenCalledTimes(1);

    await act(async () => {
      await normalizationOverrideRepo.save(hatfieldSquatOverride);
    });
    await waitFor(() => expect(screen.getByTestId("version")).toHaveTextContent("2"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(aliasList).toHaveBeenCalledTimes(2);
    expect(overrideList).toHaveBeenCalledTimes(2);
    expect(logList).not.toHaveBeenCalled();
  });

  it("ignores a stale reload that resolves after a newer one", async () => {
    renderProvider();
    await waitForLoaded();

    const realList = aliasRepo.list.bind(aliasRepo);
    const gates: Array<() => void> = [];
    jest.spyOn(aliasRepo, "list").mockImplementation(
      () => new Promise<AliasDocument[]>((resolve) => {
        gates.push(() => resolve(realList()));
      }),
    );

    // Reload A starts before the override exists, so its own override read
    // returns an empty list.
    act(() => {
      dispatchExerciseIdentityChanged();
    });
    await waitFor(() => expect(gates).toHaveLength(1));

    // Reload B starts after the committed override.
    await act(async () => {
      await normalizationOverrideRepo.save(hatfieldSquatOverride);
    });
    await waitFor(() => expect(gates).toHaveLength(2));

    await act(async () => {
      gates[1]();
    });
    await waitFor(() => expect(screen.getByTestId("movement")).toHaveTextContent("Squat"));
    const versionAfterNewestReload = screen.getByTestId("version").textContent;

    await act(async () => {
      gates[0]();
    });

    // The stale snapshot has no override in it: applying it would revert the
    // movement to Standalone and advance the version again.
    expect(screen.getByTestId("movement")).toHaveTextContent("Squat");
    expect(screen.getByTestId("version")).toHaveTextContent(versionAfterNewestReload!);
  });

  it("keeps resolving when a stored alias row is unreadable", async () => {
    jest.spyOn(aliasRepo, "list").mockResolvedValue([
      {
        id: "unreadable-alias",
        alias: 42,
        normalizedAlias: 42,
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
        createdAt: "2026-08-18T00:00:00.000Z",
      } as unknown as AliasDocument,
    ]);

    renderProvider();

    await waitForLoaded();
    expect(screen.getByTestId("movement")).toHaveTextContent("Standalone");
  });

  it("keeps resolving when a stored user exercise row is unreadable", async () => {
    jest.spyOn(userExerciseRepo, "list").mockResolvedValue([
      { id: "user-unreadable", name: 42, createdAt: "2026-08-18T00:00:00.000Z" } as unknown as UserExerciseDocument,
    ]);

    renderProvider();

    await waitForLoaded();
    expect(screen.getByTestId("unknown")).toHaveTextContent("Zzz Unknown Lift");
  });

  it("wraps the whole app in the provider at the root", () => {
    const source = readFileSync(path.join(__dirname, "..", "..", "main.tsx"), "utf8");

    expect(source).toContain('from "@/components/app/ExerciseNormalizationProvider"');
    expect(source).toMatch(/<ExerciseNormalizationProvider>\s*<App \/>\s*<\/ExerciseNormalizationProvider>/);
  });
});
