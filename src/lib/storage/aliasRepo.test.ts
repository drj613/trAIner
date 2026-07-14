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
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up" });
    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ alias: "Strict Pullup", canonicalExerciseId: "pull-up" });
    expect(all[0].id).toBeTruthy();
  });

  it("upserts by normalizedAlias: saving the same alias twice updates the existing record in place instead of inserting a duplicate", async () => {
    await aliasRepo.save({ alias: "Competition Bench Press", canonicalExerciseId: "bench-press" });
    const first = await aliasRepo.find("Competition Bench Press");
    expect(first).toBeDefined();

    // Save again with the same (normalized) alias — must not throw a
    // ConstraintError from the unique by-normalized-alias index, and must
    // not create a second record.
    await aliasRepo.save({ alias: "competition bench press", canonicalExerciseId: "bench-press" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    const second = await aliasRepo.find("Competition Bench Press");
    expect(second?.id).toBe(first?.id);
  });

  it("updates canonicalExerciseId in place when re-saving an existing alias with a different resolution", async () => {
    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat-v1" });
    const original = await aliasRepo.find("Goblet Squat");

    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat-v2" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(original?.id);
    expect(all[0].canonicalExerciseId).toBe("goblet-squat-v2");
  });

  it("preserves the original createdAt when upserting", async () => {
    await aliasRepo.save({ alias: "Front Squat", canonicalExerciseId: "front-squat" });
    const original = await aliasRepo.find("Front Squat");

    await aliasRepo.save({ alias: "Front Squat", canonicalExerciseId: "front-squat-v2" });
    const updated = await aliasRepo.find("Front Squat");

    expect(updated?.createdAt).toBe(original?.createdAt);
  });

  it("treats names differing only by case/punctuation/whitespace as the same alias", async () => {
    await aliasRepo.save({ alias: "Competition Bench Press", canonicalExerciseId: "bench-press" });
    await aliasRepo.save({ alias: "  competition   bench-press!  ", canonicalExerciseId: "bench-press" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
  });

  it("still inserts distinct aliases as separate records", async () => {
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up" });
    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(2);
  });
});
