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

  it("dispatches once after a multi-alias transaction commits", async () => {
    let committedRead: ReturnType<typeof aliasRepo.find> | undefined;
    const listener = jest.fn(() => {
      committedRead = aliasRepo.find("RDL");
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await aliasRepo.saveMany([
        { alias: "Back Squat", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" },
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
      ]);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(committedRead).resolves.toMatchObject({ canonicalExerciseId: "romanian-deadlift" });
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
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

  it("replaceRemembered is the explicit one-transaction correction path", async () => {
    await aliasRepo.putRaw({
      id: "legacy-alias-id",
      alias: "Back Squat",
      normalizedAlias: "back squat",
      canonicalExerciseId: "barbell-back-squat",
      createdAt: "2026-08-18T00:00:00.000Z",
    }, { dispatch: false });
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
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

  it("removeMany dispatches once and dispatch:false suppresses internal writes", async () => {
    await aliasRepo.saveMany([
      { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
      { alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" },
    ], { dispatch: false });
    const ids = (await aliasRepo.list()).map((alias) => alias.id);
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await aliasRepo.removeMany(ids);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.list()).resolves.toEqual([]);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });
});
