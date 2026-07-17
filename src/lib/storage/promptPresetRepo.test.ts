import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { promptPresetRepo } from "./promptPresetRepo";
import { DB_NAME, resetDbConnection } from "./appDb";
import type { PromptPresetDocument } from "@/lib/programs/types";

const make = (over: Partial<PromptPresetDocument> = {}): PromptPresetDocument => ({
  id: "p1",
  name: "Push focus",
  personaIds: ["rp"],
  editedBlocks: {},
  fieldOn: { goals: true },
  schemaOn: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});
afterEach(() => resetDbConnection());

describe("promptPresetRepo", () => {
  it("save then list returns the preset", async () => {
    await promptPresetRepo.save(make());
    const all = await promptPresetRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Push focus");
  });

  it("save twice with same id overwrites (single row)", async () => {
    await promptPresetRepo.save(make({ name: "A" }));
    await promptPresetRepo.save(make({ name: "B" }));
    const all = await promptPresetRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("B");
  });

  it("two different ids with the same name coexist", async () => {
    await promptPresetRepo.save(make({ id: "p1", name: "Dup" }));
    await promptPresetRepo.save(make({ id: "p2", name: "Dup" }));
    expect(await promptPresetRepo.list()).toHaveLength(2);
  });

  it("stamps createdAt once and advances updatedAt on re-save", async () => {
    await promptPresetRepo.save(make({ createdAt: "", updatedAt: "" }));
    const first = (await promptPresetRepo.list())[0];
    expect(first.createdAt).not.toBe("");
    expect(first.updatedAt).not.toBe("");
    await new Promise((r) => setTimeout(r, 2));
    await promptPresetRepo.save({ ...first, name: "edited" });
    const second = (await promptPresetRepo.list())[0];
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.createdAt);
  });

  it("remove deletes a single preset by id", async () => {
    await promptPresetRepo.save(make());
    await promptPresetRepo.remove("p1");
    expect(await promptPresetRepo.list()).toHaveLength(0);
  });
});
