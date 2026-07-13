import { exportBackup, restoreBackup, resetWorkspace } from "./backup";
import { resetDbConnection } from "@/lib/storage/appDb";

const mockClear = jest.fn().mockResolvedValue(undefined);
const mockGetDb = jest.fn().mockResolvedValue({
  clear: mockClear,
});

// Must be hoisted before imports in Jest
jest.mock("@/lib/storage/appDb", () => ({
  DB_NAME: "trainer-local-first",
  resetDbConnection: jest.fn(),
  getDb: () => mockGetDb(),
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
    putRaw: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/storage/userExerciseRepo", () => ({
  userExerciseRepo: {
    list: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/storage/bodyweightRepo", () => ({
  bodyweightRepo: {
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
    expect(Array.isArray(backup.userExercises)).toBe(true);
    expect(Array.isArray(backup.bodyweight)).toBe(true);
  });
});

describe("restoreBackup — C7 validation", () => {
  it("throws when backup is null", async () => {
    await expect(restoreBackup(null)).rejects.toThrow("Invalid backup: expected an object.");
  });

  it("throws when backup is a primitive", async () => {
    await expect(restoreBackup("not-an-object")).rejects.toThrow("Invalid backup: expected an object.");
  });

  it("throws on unsupported version", async () => {
    await expect(
      restoreBackup({ version: 99, programs: [], logs: [], aliases: [] })
    ).rejects.toThrow("Unsupported backup version");
  });

  it("throws when programs is not an array", async () => {
    await expect(
      restoreBackup({ version: 1, programs: "not-an-array", logs: [], aliases: [] })
    ).rejects.toThrow("'programs' must be an array");
  });

  it("throws when logs is not an array", async () => {
    await expect(
      restoreBackup({ version: 1, programs: [], logs: null, aliases: [] })
    ).rejects.toThrow("'logs' must be an array");
  });

  it("throws when aliases is not an array", async () => {
    await expect(
      restoreBackup({ version: 1, programs: [], logs: [], aliases: undefined })
    ).rejects.toThrow("'aliases' must be an array");
  });

  it("does not call getDb when validation fails", async () => {
    mockGetDb.mockClear();
    await expect(
      restoreBackup({ version: 2, programs: [], logs: [], aliases: [] })
    ).rejects.toThrow();
    expect(mockGetDb).not.toHaveBeenCalled();
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
    const indexedDbMock = global.indexedDB as unknown as { deleteDatabase: jest.Mock };
    const deleteDatabase = indexedDbMock.deleteDatabase;

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    req.onsuccess?.();
    await promise;

    expect(deleteDatabase).toHaveBeenCalledWith("trainer-local-first");
    expect(resetDbConnection).toHaveBeenCalled();
  });

  it("rejects when deleteDatabase errors", async () => {
    const indexedDbMock = global.indexedDB as unknown as { deleteDatabase: jest.Mock };
    const deleteDatabase = indexedDbMock.deleteDatabase;

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    const error = new DOMException("Delete failed");
    Object.defineProperty(req, "error", { value: error });
    req.onerror?.();

    await expect(promise).rejects.toBe(error);
  });

  it("calls resetDbConnection BEFORE deleteDatabase to avoid blocking", async () => {
    const callOrder: string[] = [];
    (resetDbConnection as jest.Mock).mockImplementation(() => callOrder.push("reset"));
    const deleteDatabase = jest.fn().mockImplementation(() => {
      callOrder.push("delete");
      return {};
    });
    Object.defineProperty(global, "indexedDB", { value: { deleteDatabase }, configurable: true });

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    req.onsuccess?.();
    await promise;

    expect(callOrder).toEqual(["reset", "delete"]);
  });

  it("rejects with a user-readable message when deleteDatabase is blocked", async () => {
    const deleteDatabase = jest.fn().mockReturnValue({});
    Object.defineProperty(global, "indexedDB", { value: { deleteDatabase }, configurable: true });

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    req.onblocked?.();

    await expect(promise).rejects.toThrow(/blocked/i);
  });
});
