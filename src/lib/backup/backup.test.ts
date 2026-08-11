import { exportBackup, restoreBackup, resetWorkspace } from "./backup";
import { resetDbConnection } from "@/lib/storage/appDb";

const mockClear = jest.fn().mockResolvedValue(undefined);
const mockPut = jest.fn();

// Per-store seed data for transaction reads. Tests set e.g.
// storeData.programs = [myProgram] instead of mocking programRepo.list.
const storeData: Record<string, unknown[]> = {};
const mockGetAll = jest.fn();
const mockTransaction = jest.fn().mockImplementation(() => ({
  objectStore: jest.fn().mockImplementation((name: string) => ({
    // Route through the shared spy so clear-per-store is attributable
    // (e.g. `expect(mockClear).toHaveBeenCalledWith("metrics")`), while
    // "db untouched" tests can still assert `mockClear` was never called
    // at all, regardless of which store.
    clear: jest.fn().mockImplementation(() => mockClear(name)),
    put: mockPut,
    getAll: jest.fn().mockImplementation(() => {
      mockGetAll(name);
      return Promise.resolve(storeData[name] ?? []);
    }),
  })),
  done: Promise.resolve(undefined),
}));
const mockGetDb = jest.fn().mockResolvedValue({
  clear: mockClear,
  transaction: mockTransaction,
});

beforeEach(() => {
  for (const k of Object.keys(storeData)) delete storeData[k];
});

// Shared fixture for restoreBackup validation and metrics tests below.
const validDoc = {
  version: 1,
  exportedAt: "2026-08-10T00:00:00.000Z",
  profile: null,
  programs: [
    {
      id: "p1", title: "T", days: [], overrides: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  logs: [
    { id: "l1", programId: "p1", dayId: "d1", performedAt: "2026-01-02T00:00:00.000Z", entries: [] },
  ],
  aliases: [],
};

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

jest.mock("@/lib/storage/promptPresetRepo", () => ({
  promptPresetRepo: {
    list: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
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

describe("countsTowardVolume — backup round trip", () => {
  const makeProgramWithExercise = (countsTowardVolume: boolean | undefined) => ({
    id: "p1",
    title: "Test Program",
    source: "import" as const,
    active: true,
    days: [
      {
        id: "day-1",
        dayNumber: 1,
        title: "Day 1",
        sections: [
          {
            id: "s1",
            type: "strength" as const,
            name: "Main",
            groups: [
              {
                id: "g1",
                type: "single" as const,
                exercises: [
                  {
                    id: "e1",
                    name: "Squat",
                    countsTowardVolume,
                    tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    overrides: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("exportBackup preserves countsTowardVolume:true on a program exercise", async () => {
    storeData.programs = [makeProgramWithExercise(true)];
    const backup = await exportBackup();
    const exercise = backup.programs[0].days[0].sections[0].groups[0].exercises[0];
    expect(exercise.countsTowardVolume).toBe(true);
  });

  it("exportBackup preserves countsTowardVolume:false on a program exercise", async () => {
    storeData.programs = [makeProgramWithExercise(false)];
    const backup = await exportBackup();
    const exercise = backup.programs[0].days[0].sections[0].groups[0].exercises[0];
    expect(exercise.countsTowardVolume).toBe(false);
  });

  it("restoreBackup writes countsTowardVolume:true through to the programs store unchanged", async () => {
    mockPut.mockClear();
    const program = makeProgramWithExercise(true);
    await restoreBackup({ version: 1, programs: [program], logs: [], aliases: [] });
    const putProgram = mockPut.mock.calls.find((call) => call[0].id === "p1")?.[0];
    expect(putProgram.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(true);
  });

  it("restoreBackup writes countsTowardVolume:false through to the programs store unchanged", async () => {
    mockPut.mockClear();
    const program = makeProgramWithExercise(false);
    await restoreBackup({ version: 1, programs: [program], logs: [], aliases: [] });
    const putProgram = mockPut.mock.calls.find((call) => call[0].id === "p1")?.[0];
    expect(putProgram.days[0].sections[0].groups[0].exercises[0].countsTowardVolume).toBe(false);
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

describe("restoreBackup deep validation", () => {
  it("accepts a well-formed document", async () => {
    await expect(restoreBackup(validDoc)).resolves.toBeUndefined();
  });

  it("rejects a program that is only an id, without touching the db", async () => {
    mockClear.mockClear();
    mockTransaction.mockClear();
    mockGetDb.mockClear();
    const doc = { ...validDoc, programs: [{ id: "p1" }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("rejects a program with non-array days", async () => {
    const doc = { ...validDoc, programs: [{ ...validDoc.programs[0], days: "nope" }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
  });

  it("rejects a log missing performedAt, without touching the db", async () => {
    mockClear.mockClear();
    mockTransaction.mockClear();
    mockGetDb.mockClear();
    const doc = { ...validDoc, logs: [{ id: "l1", programId: "p1", dayId: "d1", entries: [] }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/logs\[0\]/);
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("rejects a log with non-array entries", async () => {
    const doc = { ...validDoc, logs: [{ ...validDoc.logs[0], entries: {} }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/logs\[0\]/);
  });

  it("rejects null elements inside days/entries", async () => {
    const badProgram = { ...validDoc, programs: [{ ...validDoc.programs[0], days: [null] }] };
    await expect(restoreBackup(badProgram)).rejects.toThrow(/programs\[0\]/);
    const badLog = { ...validDoc, logs: [{ ...validDoc.logs[0], entries: [null] }] };
    await expect(restoreBackup(badLog)).rejects.toThrow(/logs\[0\]/);
  });

  it("rejects a null element inside overrides, without touching the db", async () => {
    // getRenderableDays does [...program.overrides].sort((a, b) => ... a.scope ...)
    // unconditionally on every page that renders a program's days — a null
    // override element crashes that sort exactly like the days/entries case above.
    mockClear.mockClear();
    mockTransaction.mockClear();
    mockGetDb.mockClear();
    const doc = { ...validDoc, programs: [{ ...validDoc.programs[0], overrides: [null] }] };
    await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  describe("override.replacement", () => {
    const singleDay = { id: "d1", dayNumber: 1 };
    const dayArray = [{ id: "d1", dayNumber: 1 }, { id: "d2", dayNumber: 2 }];
    const baseOverride = {
      id: "o1", scope: "week", programId: "p1", weekNumber: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("rejects a null replacement, without touching the db", async () => {
      // applyOverride reads `replacement` (via getOverrideReplacementDays)
      // unconditionally before branching on scope; a week-scope override
      // whose replacement is null crashes the `.find(r => r.dayNumber...)`
      // lookup on load once its weekNumber matches a real day.
      mockClear.mockClear();
      mockTransaction.mockClear();
      mockGetDb.mockClear();
      const doc = {
        ...validDoc,
        programs: [{ ...validDoc.programs[0], overrides: [{ ...baseOverride, replacement: null }] }],
      };
      await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
      expect(mockClear).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockGetDb).not.toHaveBeenCalled();
    });

    it("rejects a missing replacement", async () => {
      const { replacement: _unused, ...overrideWithoutReplacement } = { ...baseOverride, replacement: singleDay };
      const doc = {
        ...validDoc,
        programs: [{ ...validDoc.programs[0], overrides: [overrideWithoutReplacement] }],
      };
      await expect(restoreBackup(doc)).rejects.toThrow(/programs\[0\]/);
    });

    it("accepts a single day object as replacement", async () => {
      const doc = {
        ...validDoc,
        programs: [{ ...validDoc.programs[0], overrides: [{ ...baseOverride, replacement: singleDay }] }],
      };
      await expect(restoreBackup(doc)).resolves.toBeUndefined();
    });

    it("accepts an array of day objects as replacement", async () => {
      const doc = {
        ...validDoc,
        programs: [{ ...validDoc.programs[0], overrides: [{ ...baseOverride, replacement: dayArray }] }],
      };
      await expect(restoreBackup(doc)).resolves.toBeUndefined();
    });
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

describe("exportBackup point-in-time", () => {
  it("reads all stores in one readonly transaction", async () => {
    mockTransaction.mockClear();
    mockGetAll.mockClear();
    await exportBackup();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const [stores, mode] = mockTransaction.mock.calls[0];
    expect(mode).toBe("readonly");
    expect([...stores].sort()).toEqual([
      "aliases", "bodyweight", "logs", "profile", "programs", "promptPresets", "userExercises",
    ]);
    // Pins "reads every store, once, in the one transaction" — not just
    // that the store list passed to transaction() was right.
    expect(mockGetAll).toHaveBeenCalledTimes(7);
    expect([...new Set(mockGetAll.mock.calls.map((call) => call[0]))].sort()).toEqual([
      "aliases", "bodyweight", "logs", "profile", "programs", "promptPresets", "userExercises",
    ]);
  });
});

describe("restoreBackup metrics", () => {
  it("clears the metrics store", async () => {
    mockClear.mockClear();
    await restoreBackup(validDoc);
    expect(mockClear).toHaveBeenCalledWith("metrics");
  });
});
