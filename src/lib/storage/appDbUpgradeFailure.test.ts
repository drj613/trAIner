import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { seedLegacyLogs, seedVersion9Database, v9Fixture } from "./appDb.testFixtures";

// A migration failure must not commit half a migration. idb does not await
// the `upgrade` callback's promise, so a throw after the first `await` would
// otherwise leave the versionchange transaction to commit whatever was
// already issued — including the `aliases.clear()` that precedes the re-puts.
// Injecting the failure through the resolver is the closest stand-in for the
// real cause: an unreadable field the guards do not cover yet.
const failure = {
  inject: false,
  onCanonicalId: undefined as string | undefined,
  inV7: false,
};
jest.mock("@/lib/catalog/identity", () => {
  const actual = jest.requireActual<typeof import("@/lib/catalog/identity")>(
    "@/lib/catalog/identity",
  );
  return {
    ...actual,
    resolveExerciseIdentity: (...args: Parameters<typeof actual.resolveExerciseIdentity>) => {
      if (failure.onCanonicalId !== undefined) {
        const input = args[0] as { canonicalExerciseId?: string };
        if (input.canonicalExerciseId === failure.onCanonicalId) {
          throw new Error("injected migration failure");
        }
      }
      if (failure.inject) throw new Error("injected migration failure");
      return actual.resolveExerciseIdentity(...args);
    },
  };
});

// The v7 block's one external call, and the only injection point that does
// not require poisoning data the guards now tolerate.
jest.mock("@/lib/workout/localDate", () => {
  const actual = jest.requireActual<typeof import("@/lib/workout/localDate")>(
    "@/lib/workout/localDate",
  );
  return {
    ...actual,
    localDateOf: (iso: string) => {
      if (failure.inV7) throw new Error("injected v7 failure");
      return actual.localDateOf(iso);
    },
  };
});

beforeEach(async () => {
  failure.inject = false;
  failure.onCanonicalId = undefined;
  failure.inV7 = false;
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
  jest.restoreAllMocks();
  failure.inject = false;
  failure.onCanonicalId = undefined;
  failure.inV7 = false;
  resetDbConnection();
});

describe("DB upgrade failure safety — every block", () => {
  it("aborts the upgrade, leaving version 9 and its data intact, and retries on the next open", async () => {
    await seedVersion9Database(v9Fixture);
    const before = await openDB(DB_NAME, 9);
    const aliasesBefore = await before.getAll("aliases");
    const programsBefore = await before.getAll("programs");
    const logsBefore = await before.getAll("logs");
    before.close();
    resetDbConnection();
    expect(aliasesBefore).toHaveLength(v9Fixture.aliases.length);

    failure.inject = true;
    // The real cause, not the AbortError the rollback itself produces.
    await expect(getDb()).rejects.toThrow("injected migration failure");
    resetDbConnection();

    // Still version 9: opening with an explicit version 9 would throw
    // VersionError if the upgrade had committed at version 10.
    const after = await openDB(DB_NAME, 9);
    expect(after.version).toBe(9);
    expect(after.objectStoreNames.contains("metrics")).toBe(true);
    expect(await after.getAll("aliases")).toEqual(aliasesBefore);
    expect(await after.getAll("programs")).toEqual(programsBefore);
    expect(await after.getAll("logs")).toEqual(logsBefore);
    after.close();
    resetDbConnection();

    // The failure is transient from the app's point of view: nothing was
    // consumed, so a later load migrates for real.
    failure.inject = false;
    const migrated = await getDb();
    expect(migrated.version).toBe(10);
    expect((migrated.objectStoreNames as unknown as DOMStringList).contains("metrics")).toBe(false);
    expect(await migrated.getAll("aliases")).not.toHaveLength(0);
  });

  it("retires the failed attempt so the next getDb() retries without an explicit reset", async () => {
    // The existing retry assertions call resetDbConnection() first, which only
    // proves the manual path. getDb() promises self-healing: a rejected open
    // must not stay cached, or every later call replays the same rejection.
    await seedVersion9Database(v9Fixture);

    failure.inject = true;
    await expect(getDb()).rejects.toThrow("injected migration failure");

    failure.inject = false;
    const migrated = await getDb();
    expect(migrated.version).toBe(10);
    expect((migrated.objectStoreNames as unknown as DOMStringList).contains("metrics")).toBe(false);
  });

  it("does not empty the alias store when the failure lands after aliases are cleared", async () => {
    await seedVersion9Database(v9Fixture);

    // "removed-squat-id" appears only in programs and logs, which are
    // rewritten after `await aliasesStore.clear()` — so this failure lands in
    // the exact window where the store is empty and the re-puts have not run.
    failure.onCanonicalId = "removed-squat-id";
    await expect(getDb()).rejects.toThrow("injected migration failure");
    resetDbConnection();

    const after = await openDB(DB_NAME, 9);
    expect(after.version).toBe(9);
    expect(await after.getAll("aliases")).toHaveLength(v9Fixture.aliases.length);
    after.close();
    resetDbConnection();
  });

  it("aborts a v7-era failure, leaving version 6 and its logs intact", async () => {
    const log = {
      id: "legacy-1",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-05-10T10:00:00.000Z",
      completedAt: "2026-05-10T11:00:00.000Z",
      entries: [],
    };
    await seedLegacyLogs(6, [log]);

    failure.inV7 = true;
    await expect(getDb()).rejects.toThrow("injected v7 failure");
    resetDbConnection();

    const after = await openDB(DB_NAME, 6);
    expect(after.version).toBe(6);
    expect(await after.get("logs", "legacy-1")).toEqual(log);
    expect(after.objectStoreNames.contains("metrics")).toBe(true);
    expect(after.objectStoreNames.contains("normalizationOverrides")).toBe(false);
    after.close();
    resetDbConnection();

    failure.inV7 = false;
    const migrated = await getDb();
    expect(migrated.version).toBe(10);
    expect((await migrated.get("logs", "legacy-1"))?.performedDate).toBe("2026-05-10");
  });

  it("aborts a v8-era failure, leaving version 7 and its raw cells intact", async () => {
    const log = {
      id: "legacy-2",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-05-10T10:00:00.000Z",
      performedDate: "2026-05-10",
      completedAt: "2026-05-10T11:00:00.000Z",
      entries: [{ exerciseId: "slot-1", sets: [{ setNumber: 1, rawCell: "10kg x10" }] }],
    };
    await seedLegacyLogs(7, [log]);

    // The v8 block calls no project module, so the injection point is the
    // global it does call, narrowed to the value this fixture parses.
    const parse = jest.spyOn(globalThis, "parseFloat").mockImplementation((value: string) => {
      if (value === "10") throw new Error("injected v8 failure");
      return Number(value);
    });
    await expect(getDb()).rejects.toThrow("injected v8 failure");
    parse.mockRestore();
    resetDbConnection();

    const after = await openDB(DB_NAME, 7);
    expect(after.version).toBe(7);
    expect(await after.get("logs", "legacy-2")).toEqual(log);
    expect(after.objectStoreNames.contains("normalizationOverrides")).toBe(false);
    after.close();
    resetDbConnection();

    const migrated = await getDb();
    expect(migrated.version).toBe(10);
    expect((await migrated.get("logs", "legacy-2"))?.entries[0].sets[0])
      .toEqual({ setNumber: 1, weight: 10, unit: "kg", reps: 10 });
  });
});
