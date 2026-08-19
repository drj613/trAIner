import { deleteDB, openDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { seedVersion9Database, v9Fixture } from "./appDb.testFixtures";

// A migration failure must not commit half a migration. idb does not await
// the `upgrade` callback's promise, so a throw after the first `await` would
// otherwise leave the versionchange transaction to commit whatever was
// already issued — including the `aliases.clear()` that precedes the re-puts.
// Injecting the failure through the resolver is the closest stand-in for the
// real cause: an unreadable field the guards do not cover yet.
const failure = { inject: false, onCanonicalId: undefined as string | undefined };
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

beforeEach(async () => {
  failure.inject = false;
  failure.onCanonicalId = undefined;
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
  failure.inject = false;
  failure.onCanonicalId = undefined;
  resetDbConnection();
});

describe("DB v10 — upgrade failure safety", () => {
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
});
