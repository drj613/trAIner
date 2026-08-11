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

import { backupRepo } from "@/lib/storage/backupRepo";
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

  it("rounds snapshotKB to 0 for tiny snapshot records (the rounds-to-zero case)", async () => {
    // The default mocked snapshots above are just {id: ...} — a couple of
    // dozen encoded bytes each, nowhere near a full KB.
    const stats = await loadWorkspaceStats();
    expect(stats.snapshotKB).toBe(0);
  });

  it("computes snapshotKB from the encoded byte size of full snapshot records", async () => {
    const big = "x".repeat(2000);
    (backupRepo.list as jest.Mock).mockResolvedValueOnce([
      { id: "2026-04-20T00:00:00.000Z", programs: [big] },
      { id: "2026-04-22T00:00:00.000Z", programs: [big] },
    ]);
    const stats = await loadWorkspaceStats();
    // ~4000 bytes of payload plus JSON overhead — comfortably >0 KB, and an
    // exact-ish sanity bound so a byte-vs-code-unit regression would show up.
    expect(stats.snapshotKB).toBeGreaterThanOrEqual(3);
    expect(stats.snapshotKB).toBeLessThan(6);
  });

  it("byte-encodes multi-byte characters instead of counting UTF-16 code units", async () => {
    // "é" is 1 UTF-16 code unit but 2 UTF-8 bytes — repeated enough times,
    // .length (code units) and true byte size diverge by a whole KB, which
    // is exactly the class of bug this computation must not have.
    const accented = "é".repeat(2000);
    const record = { id: "2026-04-20T00:00:00.000Z", programs: [accented] };
    (backupRepo.list as jest.Mock).mockResolvedValueOnce([record]);

    const stats = await loadWorkspaceStats();

    const byteBasedKB = Math.round(new Blob([JSON.stringify(record)]).size / 1024);
    const codeUnitBasedKB = Math.round(JSON.stringify(record).length / 1024);
    expect(byteBasedKB).toBeGreaterThan(codeUnitBasedKB); // sanity: fixture actually distinguishes the two measures
    expect(stats.snapshotKB).toBe(byteBasedKB);
  });
});
