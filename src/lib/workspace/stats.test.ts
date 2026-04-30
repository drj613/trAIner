jest.mock("@/lib/storage/profileRepo", () => ({
  profileRepo: { get: jest.fn().mockResolvedValue({ id: "p1" }) },
}));
jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: { list: jest.fn().mockResolvedValue([{}, {}]) },
}));
jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { list: jest.fn().mockResolvedValue(Array.from({ length: 5 })) },
}));
jest.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: { list: jest.fn().mockResolvedValue([{}, {}, {}]) },
}));
jest.mock("@/lib/storage/backupRepo", () => ({
  backupRepo: {
    list: jest.fn().mockResolvedValue([
      { id: "2026-04-20T00:00:00.000Z" },
      { id: "2026-04-22T00:00:00.000Z" },
    ]),
  },
}));

Object.defineProperty(global.navigator, "storage", {
  value: { estimate: jest.fn().mockResolvedValue({ usage: 1887437 }) },
  configurable: true,
});

import { loadWorkspaceStats } from "./stats";

describe("loadWorkspaceStats", () => {
  it("returns counts from repos and storage size", async () => {
    const stats = await loadWorkspaceStats();
    expect(stats.profile).toBe(1);
    expect(stats.programs).toBe(2);
    expect(stats.logs).toBe(5);
    expect(stats.aliases).toBe(3);
    expect(stats.snapshots).toBe(2);
    expect(stats.lastSnapshotAt).toBe("2026-04-22");
    expect(stats.sizeKB).toBeGreaterThan(0);
  });
});
