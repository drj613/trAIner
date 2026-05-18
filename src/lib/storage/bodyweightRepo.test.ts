import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { bodyweightRepo } from "./bodyweightRepo";
import { DB_NAME, resetDbConnection } from "./appDb";

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
  resetDbConnection();
});

describe("bodyweightRepo", () => {
  it("save then list returns the entry", async () => {
    await bodyweightRepo.save({
      id: "2026-05-18",
      value: 80,
      unit: "kg",
      recordedAt: "2026-05-18T10:00:00.000Z",
    });
    const all = await bodyweightRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(80);
  });

  it("save twice with same id overwrites", async () => {
    await bodyweightRepo.save({ id: "2026-05-18", value: 80, unit: "kg", recordedAt: "2026-05-18T10:00:00.000Z" });
    await bodyweightRepo.save({ id: "2026-05-18", value: 81, unit: "kg", recordedAt: "2026-05-18T18:00:00.000Z" });
    const all = await bodyweightRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(81);
  });

  it("remove deletes a single entry", async () => {
    await bodyweightRepo.save({ id: "2026-05-18", value: 80, unit: "kg", recordedAt: "2026-05-18T10:00:00.000Z" });
    await bodyweightRepo.remove("2026-05-18");
    expect(await bodyweightRepo.list()).toHaveLength(0);
  });
});
