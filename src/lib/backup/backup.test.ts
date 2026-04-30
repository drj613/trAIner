import { exportBackup, restoreBackup, resetWorkspace } from "./backup";
import { resetDbConnection } from "@/lib/storage/appDb";

// Must be hoisted before imports in Jest
jest.mock("@/lib/storage/appDb", () => ({
  DB_NAME: "trainer-local-first",
  resetDbConnection: jest.fn(),
}));

jest.mock("@/lib/storage/profileRepo", () => ({
  profileRepo: {
    get: jest.fn().mockResolvedValue({ id: "profile-1", name: "Test" }),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: {
    list: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: {
    list: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: {
    list: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("exportBackup", () => {
  it("returns a backup document with version 1", async () => {
    const backup = await exportBackup();
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeDefined();
    expect(Array.isArray(backup.programs)).toBe(true);
    expect(Array.isArray(backup.logs)).toBe(true);
    expect(Array.isArray(backup.aliases)).toBe(true);
  });
});

describe("restoreBackup", () => {
  it("throws on unsupported version", async () => {
    await expect(
      restoreBackup({ version: 99 } as never)
    ).rejects.toThrow("Unsupported backup version.");
  });
});

describe("resetWorkspace", () => {
  beforeEach(() => {
    const deleteDatabase = jest.fn().mockReturnValue({});
    Object.defineProperty(global, "indexedDB", {
      value: { deleteDatabase },
      configurable: true,
    });
    (resetDbConnection as jest.Mock).mockClear();
  });

  it("deletes the database and resets the connection", async () => {
    const deleteDatabase = (global.indexedDB as { deleteDatabase: jest.Mock }).deleteDatabase;

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    req.onsuccess?.();
    await promise;

    expect(deleteDatabase).toHaveBeenCalledWith("trainer-local-first");
    expect(resetDbConnection).toHaveBeenCalled();
  });

  it("rejects when deleteDatabase errors", async () => {
    const deleteDatabase = (global.indexedDB as { deleteDatabase: jest.Mock }).deleteDatabase;

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    const error = new DOMException("Delete failed");
    Object.defineProperty(req, "error", { value: error });
    req.onerror?.();

    await expect(promise).rejects.toBe(error);
  });
});
