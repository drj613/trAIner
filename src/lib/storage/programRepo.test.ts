import "fake-indexeddb/auto";
import { programRepo } from "./programRepo";
import { resetDbConnection } from "./appDb";

const makeProgram = (id: string, active: boolean) => ({
  id,
  title: id,
  source: "manual" as const,
  active,
  days: [],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(async () => {
  resetDbConnection();
  // After reset, open a fresh connection and clear the programs store
  const { getDb } = await import("./appDb");
  const db = await getDb();
  await db.clear("programs");
});

describe("programRepo.activate", () => {
  it("sets target active and deactivates others", async () => {
    await programRepo.save(makeProgram("p1", true));
    await programRepo.save(makeProgram("p2", false));
    await programRepo.activate("p2");
    const [p1, p2] = await Promise.all([
      programRepo.get("p1"),
      programRepo.get("p2"),
    ]);
    expect(p1?.active).toBe(false);
    expect(p1?.status).toBe("draft");
    expect(p2?.active).toBe(true);
    expect(p2?.status).toBe("active");
  });
});

describe("programRepo.duplicate", () => {
  it("creates a copy with a new id and draft status", async () => {
    await programRepo.save(makeProgram("p1", true));
    const copy = await programRepo.duplicate("p1");
    expect(copy.id).not.toBe("p1");
    expect(copy.active).toBe(false);
    expect(copy.status).toBe("draft");
    expect(copy.title).toMatch(/Copy of/);
  });
});

describe("programRepo.activate — edge cases", () => {
  it("throws when activating a nonexistent id", async () => {
    await expect(programRepo.activate("does-not-exist")).rejects.toThrow("not found");
  });

  it("does not change status of archived programs", async () => {
    await programRepo.save({ ...makeProgram("p1", false), status: "archived" as const });
    await programRepo.save(makeProgram("p2", false));
    await programRepo.activate("p2");
    const p1 = await programRepo.get("p1");
    expect(p1?.status).toBe("archived"); // must stay archived
  });
});

describe("programRepo.duplicate — edge cases", () => {
  it("throws when duplicating a nonexistent id", async () => {
    await expect(programRepo.duplicate("does-not-exist")).rejects.toThrow("not found");
  });

  it("resets runtime progress fields on copy", async () => {
    await programRepo.save({
      ...makeProgram("p1", false),
      lastRunAt: "2026-01-01",
      streakWeeks: 5,
      completion: 0.8,
    });
    const copy = await programRepo.duplicate("p1");
    expect(copy.lastRunAt).toBeNull();
    expect(copy.streakWeeks).toBe(0);
    expect(copy.completion).toBe(0);
  });
});
