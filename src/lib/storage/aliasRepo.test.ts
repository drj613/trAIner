import { deleteDB } from "idb";
import { aliasRepo } from "./aliasRepo";
import { DB_NAME, resetDbConnection } from "./appDb";

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

describe("aliasRepo.save", () => {
  it("inserts a new alias with a fresh id", async () => {
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" });
    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      alias: "Strict Pullup",
      canonicalExerciseId: "pull-up",
      provenance: "remembered",
    });
    expect(all[0].id).toBeTruthy();
  });

  it("upserts by normalizedAlias: saving the same alias twice updates the existing record in place instead of inserting a duplicate", async () => {
    await aliasRepo.save({ alias: "Competition Bench Press", canonicalExerciseId: "bench-press", provenance: "remembered" });
    const first = await aliasRepo.find("Competition Bench Press");
    expect(first).toBeDefined();

    // Save again with the same (normalized) alias — must not throw a
    // ConstraintError from the unique by-normalized-alias index, and must
    // not create a second record.
    await aliasRepo.save({ alias: "competition bench press", canonicalExerciseId: "bench-press", provenance: "remembered" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    const second = await aliasRepo.find("Competition Bench Press");
    expect(second?.id).toBe(first?.id);
  });

  it("rejects a different target without overwriting the remembered interpretation", async () => {
    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat-v1", provenance: "remembered" });
    const original = await aliasRepo.find("Goblet Squat");

    await expect(aliasRepo.save({
      alias: "Goblet Squat",
      canonicalExerciseId: "goblet-squat-v2",
      provenance: "remembered",
    })).rejects.toThrow("Alias already maps to a different exercise");

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(original?.id);
    expect(all[0].canonicalExerciseId).toBe("goblet-squat-v1");
  });

  it("preserves the original createdAt when upserting", async () => {
    await aliasRepo.save({ alias: "Front Squat", canonicalExerciseId: "front-squat", provenance: "remembered" });
    const original = await aliasRepo.find("Front Squat");

    await aliasRepo.save({ alias: "Front Squat", canonicalExerciseId: "front-squat", provenance: "remembered" });
    const updated = await aliasRepo.find("Front Squat");

    expect(updated?.createdAt).toBe(original?.createdAt);
  });

  it("treats names differing only by case/punctuation/whitespace as the same alias", async () => {
    await aliasRepo.save({ alias: "Competition Bench Press", canonicalExerciseId: "bench-press", provenance: "remembered" });
    await aliasRepo.save({ alias: "  competition   bench-press!  ", canonicalExerciseId: "bench-press", provenance: "remembered" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
  });

  it("still inserts distinct aliases as separate records", async () => {
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" });
    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat", provenance: "remembered" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(2);
  });

  it("dispatches once for a whole multi-alias transaction, not once per alias", async () => {
    // Only the count is asserted here. Reading the data from inside the
    // listener would prove nothing about ordering — that claim belongs to the
    // transaction-lifecycle test below, which can actually observe it.
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await aliasRepo.saveMany([
        { alias: "Back Squat", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" },
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
      ]);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.list()).resolves.toHaveLength(2);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  it("dispatches only after the write transaction has actually committed", async () => {
    // "Dispatch once" is not the same claim as "dispatch after commit": a
    // listener's own read is serialised behind the open transaction either
    // way, so reading committed data proves nothing about ordering. Observe
    // the transaction lifecycle directly instead — the native `complete`
    // event is what idb's `tx.done` resolves on, and this listener is
    // registered before idb attaches its own, so it always runs first.
    const nativeTransaction = IDBDatabase.prototype.transaction;
    let writeTransactionCommitted = false;
    let committedAtDispatch: boolean | undefined;
    IDBDatabase.prototype.transaction = function patched(
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      const tx = nativeTransaction.apply(this, args);
      if (tx.mode === "readwrite") {
        tx.addEventListener("complete", () => {
          writeTransactionCommitted = true;
        });
      }
      return tx;
    };
    const listener = jest.fn(() => {
      committedAtDispatch = writeTransactionCommitted;
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await aliasRepo.saveMany([
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
        { alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" },
      ]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(committedAtDispatch).toBe(true);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
      IDBDatabase.prototype.transaction = nativeTransaction;
    }
  });

  it("putRaw preserves ids and defaults old aliases to legacy-auto", async () => {
    await aliasRepo.putRaw({
      id: "legacy-alias-id",
      alias: "RDL",
      normalizedAlias: "rdl",
      canonicalExerciseId: "romanian-deadlift",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    await expect(aliasRepo.find("RDL")).resolves.toMatchObject({
      id: "legacy-alias-id",
      provenance: "legacy-auto",
    });
  });

  it("putRaw recomputes normalizedAlias instead of trusting the stored token", async () => {
    // A backup file (validated only for string ids) can carry a token that
    // disagrees with its alias text. Trusting it plants a duplicate on the
    // unique by-normalized-alias index that later rejects a write — including
    // the migration's re-put, which would then fail on every single load.
    await aliasRepo.putRaw({
      id: "legacy-alias-id",
      alias: "90/90 Hamstring",
      normalizedAlias: "totally-wrong-token",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    const [stored] = await aliasRepo.list();
    expect(stored.normalizedAlias).toBe("90 90 hamstring");
    // Reachable by the same lookup the app uses, which the bad token broke.
    await expect(aliasRepo.find("90/90 Hamstring")).resolves.toMatchObject({ id: "legacy-alias-id" });
  });

  it("replaceRemembered is the explicit one-transaction correction path", async () => {
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      // Registered before the suppressed write, so `not.toHaveBeenCalled()`
      // is a real observation rather than a vacuous one.
      await aliasRepo.putRaw({
        id: "legacy-alias-id",
        alias: "Back Squat",
        normalizedAlias: "back squat",
        canonicalExerciseId: "barbell-back-squat",
        createdAt: "2026-08-18T00:00:00.000Z",
      }, { dispatch: false });
      await expect(aliasRepo.find("Back Squat")).resolves.toBeDefined();
      expect(listener).not.toHaveBeenCalled();

      await aliasRepo.replaceRemembered({
        alias: "Back Squat",
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
      });
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.find("Back Squat")).resolves.toMatchObject({
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
      });
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  it("removeMany dispatches once, and dispatch:false announces nothing at all", async () => {
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      // Suppression is what migration and restore rely on: the write lands,
      // the event does not. Asserting that needs the listener attached first.
      await aliasRepo.saveMany([
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
        { alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" },
      ], { dispatch: false });
      const ids = (await aliasRepo.list()).map((alias) => alias.id);
      expect(ids).toHaveLength(2);
      expect(listener).not.toHaveBeenCalled();

      await aliasRepo.removeMany(ids);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.list()).resolves.toEqual([]);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });
});
