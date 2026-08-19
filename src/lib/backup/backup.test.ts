import { exportBackup, restoreBackup, resetWorkspace } from "./backup";
import type { NormalizationOverrideDocument } from "@/lib/catalog/identity";
import type { BackupDocumentV1, BackupDocumentV2, LegacyAliasDocument } from "@/lib/programs/types";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { resetDbConnection } from "@/lib/storage/appDb";

const mockClear = jest.fn().mockResolvedValue(undefined);
const mockPut = jest.fn();

// Per-store seed data for transaction reads. Tests set e.g.
// storeData.programs = [myProgram] instead of mocking programRepo.list.
const storeData: Record<string, unknown[]> = {};
const mockGetAll = jest.fn();
// Set when the mocked transaction's `done` settles, so "after the commit" is an
// observable fact rather than a claim. Counting writes cannot see the
// difference: every put is issued synchronously before `await tx.done`.
let txCommitted = false;
const mockTransaction = jest.fn().mockImplementation(() => ({
  objectStore: jest.fn().mockImplementation((name: string) => ({
    // Route through the shared spy so clear-per-store is attributable
    // (e.g. `expect(mockClear).toHaveBeenCalledWith("aliases")`), while
    // "db untouched" tests can still assert `mockClear` was never called
    // at all, regardless of which store.
    clear: jest.fn().mockImplementation(() => mockClear(name)),
    put: mockPut,
    getAll: jest.fn().mockImplementation(() => {
      mockGetAll(name);
      return Promise.resolve(storeData[name] ?? []);
    }),
  })),
  done: Promise.resolve().then(() => {
    txCommitted = true;
  }),
}));
const mockGetDb = jest.fn().mockResolvedValue({
  clear: mockClear,
  transaction: mockTransaction,
});

beforeEach(() => {
  for (const k of Object.keys(storeData)) delete storeData[k];
  txCommitted = false;
});

// Shared fixture for restoreBackup validation and store-safety tests below.
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
  it("returns a backup document with version 2", async () => {
    const backup = await exportBackup();
    expect(backup.version).toBe(2);
    expect(Array.isArray(backup.normalizationOverrides)).toBe(true);
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
      restoreBackup({ version: 3, programs: [], logs: [], aliases: [] })
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

  // IndexedDB gives no way to cancel a pending deleteDatabase request once
  // onblocked fires — per spec it's purely informational, and the request
  // stays live, completing (onsuccess) as soon as the last blocking
  // connection closes. Rejecting here would tell the caller the reset
  // failed right before it silently succeeds — the exact silent-data-loss
  // bug this fix exists to close. So onblocked must notify via callback
  // and leave the promise pending, not settle it.
  it("invokes onBlocked when deleteDatabase is blocked, and does not reject", async () => {
    const deleteDatabase = jest.fn().mockReturnValue({});
    Object.defineProperty(global, "indexedDB", { value: { deleteDatabase }, configurable: true });

    const onBlocked = jest.fn();
    const promise = resetWorkspace(onBlocked);
    const req = deleteDatabase.mock.results[0].value;
    req.onblocked?.();

    expect(onBlocked).toHaveBeenCalledTimes(1);

    // Give any microtask queue a chance to settle the promise — it must not.
    let settled = false;
    promise.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    // Clean up: let the deferred deletion actually complete so it doesn't
    // leave an unhandled rejection dangling past the test.
    req.onsuccess?.();
    await promise;
  });

  it("resolves once onsuccess fires after being blocked (blocked-then-completed)", async () => {
    const deleteDatabase = jest.fn().mockReturnValue({});
    Object.defineProperty(global, "indexedDB", { value: { deleteDatabase }, configurable: true });

    const onBlocked = jest.fn();
    const promise = resetWorkspace(onBlocked);
    const req = deleteDatabase.mock.results[0].value;
    req.onblocked?.();
    req.onsuccess?.();

    await expect(promise).resolves.toBeUndefined();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("still rejects on onerror after being blocked", async () => {
    const deleteDatabase = jest.fn().mockReturnValue({});
    Object.defineProperty(global, "indexedDB", { value: { deleteDatabase }, configurable: true });

    const onBlocked = jest.fn();
    const promise = resetWorkspace(onBlocked);
    const req = deleteDatabase.mock.results[0].value;
    req.onblocked?.();
    const error = new DOMException("Delete failed");
    Object.defineProperty(req, "error", { value: error });
    req.onerror?.();

    await expect(promise).rejects.toBe(error);
  });

  it("works with no onBlocked callback passed (optional parameter)", async () => {
    const deleteDatabase = jest.fn().mockReturnValue({});
    Object.defineProperty(global, "indexedDB", { value: { deleteDatabase }, configurable: true });

    const promise = resetWorkspace();
    const req = deleteDatabase.mock.results[0].value;
    req.onblocked?.();
    req.onsuccess?.();

    await expect(promise).resolves.toBeUndefined();
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
      "aliases", "bodyweight", "logs", "normalizationOverrides",
      "profile", "programs", "promptPresets", "userExercises",
    ]);
    // Pins "reads every store, once, in the one transaction" — not just
    // that the store list passed to transaction() was right.
    expect(mockGetAll).toHaveBeenCalledTimes(8);
    expect([...new Set(mockGetAll.mock.calls.map((call) => call[0]))].sort()).toEqual([
      "aliases", "bodyweight", "logs", "normalizationOverrides",
      "profile", "programs", "promptPresets", "userExercises",
    ]);
  });
});

describe("restoreBackup v10 store safety", () => {
  it("does not transact against or clear the removed metrics store", async () => {
    mockTransaction.mockClear();
    mockClear.mockClear();
    await restoreBackup(validDoc);
    const [stores, mode] = mockTransaction.mock.calls[0];
    expect(mode).toBe("readwrite");
    expect([...stores].sort()).toEqual([
      "aliases", "bodyweight", "logs", "normalizationOverrides",
      "profile", "programs", "promptPresets", "userExercises",
    ]);
    expect(mockClear).toHaveBeenCalledTimes(8);
    expect(mockClear).not.toHaveBeenCalledWith("metrics");
  });

  it("preserves legacy alias ids and defaults a missing provenance", async () => {
    mockPut.mockClear();
    await restoreBackup({
      ...validDoc,
      aliases: [{
        id: "legacy-alias-id",
        alias: "Romanian Deadlift",
        normalizedAlias: "romanian deadlift",
        canonicalExerciseId: "romanian-deadlift",
        createdAt: "2026-08-18T00:00:00.000Z",
      }],
    });

    expect(mockPut).toHaveBeenCalledWith({
      id: "legacy-alias-id",
      alias: "Romanian Deadlift",
      normalizedAlias: "romanian deadlift",
      canonicalExerciseId: "romanian-deadlift",
      provenance: "legacy-auto",
      createdAt: "2026-08-18T00:00:00.000Z",
    });
  });
});

const validOverride: NormalizationOverrideDocument = {
  id: "normalized-name:hatfield squat",
  targetKind: "normalized-name",
  targetValue: "hatfield squat",
  movementId: "squat",
  movementModifierIds: ["barbell"],
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const legacyAlias = (alias: string, canonicalExerciseId: string): LegacyAliasDocument => ({
  id: `legacy:${alias}`,
  alias,
  normalizedAlias: normalizeExerciseName(alias),
  canonicalExerciseId,
  createdAt: "2026-08-18T00:00:00.000Z",
});

function makeBackupV1(overrides: Partial<BackupDocumentV1> = {}): BackupDocumentV1 {
  return {
    ...(validDoc as unknown as BackupDocumentV1),
    version: 1,
    ...overrides,
  };
}

function makeBackupV2(overrides: Partial<BackupDocumentV2> = {}): BackupDocumentV2 {
  return {
    ...(validDoc as unknown as BackupDocumentV1),
    version: 2,
    aliases: [],
    normalizationOverrides: [],
    ...overrides,
  };
}

const putsToStore = (predicate: (value: Record<string, unknown>) => boolean) =>
  mockPut.mock.calls.map((call) => call[0]).filter(predicate);
const isOverride = (value: Record<string, unknown>) => "targetKind" in value;
const isAlias = (value: Record<string, unknown>) => "normalizedAlias" in value;

describe("restoreBackup — version 2 overrides", () => {
  it("restores every override in the document", async () => {
    mockPut.mockClear();
    await restoreBackup(makeBackupV2({ normalizationOverrides: [validOverride] }));
    expect(putsToStore(isOverride)).toEqual([validOverride]);
  });

  // A hand-edited (or older-build) file can carry a target that is not yet
  // normalized. Written verbatim it would sit under a key nothing looks up, so
  // the override silently never applies.
  it("re-derives an override's id and target value from its target text", async () => {
    mockPut.mockClear();
    await restoreBackup(makeBackupV2({
      normalizationOverrides: [{
        ...validOverride,
        id: "stale-id",
        targetValue: " Hatfield   Squat ",
      }],
    }));
    expect(putsToStore(isOverride)).toEqual([validOverride]);
  });

  it("defaults a version-1 document's overrides to an empty list", async () => {
    mockPut.mockClear();
    await restoreBackup(makeBackupV1());
    expect(putsToStore(isOverride)).toEqual([]);
    expect(mockClear).toHaveBeenCalledWith("normalizationOverrides");
  });

  it("rejects duplicate override targets before clearing stores", async () => {
    mockPut.mockClear();
    mockClear.mockClear();
    mockGetDb.mockClear();
    await expect(restoreBackup(makeBackupV2({
      normalizationOverrides: [validOverride, { ...validOverride, movementModifierIds: [] }],
    }))).rejects.toThrow("duplicate normalization override target");
    expect(mockGetDb).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  // Two rows that only *look* distinct: the ids differ, but both normalize to
  // the same target, so the store would silently keep one and lose the other.
  it("treats differently-spelled targets that normalize alike as duplicates", async () => {
    mockGetDb.mockClear();
    await expect(restoreBackup(makeBackupV2({
      normalizationOverrides: [
        validOverride,
        { ...validOverride, id: "normalized-name:Hatfield  Squat", targetValue: "Hatfield  Squat" },
      ],
    }))).rejects.toThrow("duplicate normalization override target");
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it.each([
    { name: "an unknown movement", movementId: "no-such-movement", expected: "Unknown movement" },
    { name: "an unknown modifier", modifierIds: ["no-such-modifier"], expected: "Unknown modifier" },
    { name: "a noncanonical modifier order", modifierIds: ["back-rack", "barbell"], expected: "Modifier order is not canonical" },
  ])("rejects $name before clearing stores", async ({ movementId, modifierIds, expected }) => {
    mockClear.mockClear();
    mockGetDb.mockClear();
    await expect(restoreBackup(makeBackupV2({
      normalizationOverrides: [{
        ...validOverride,
        ...(movementId ? { movementId } : {}),
        ...(modifierIds ? { movementModifierIds: modifierIds } : {}),
      }],
    }))).rejects.toThrow(expected);
    expect(mockGetDb).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("rejects a version-2 document whose normalizationOverrides is missing", async () => {
    mockGetDb.mockClear();
    const { normalizationOverrides: _dropped, ...withoutOverrides } = makeBackupV2();
    await expect(restoreBackup(withoutOverrides))
      .rejects.toThrow("'normalizationOverrides' must be an array of objects");
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("rejects an unknown override target kind before opening the write transaction", async () => {
    // Passes the shape check (it *is* a string) and would otherwise reach
    // canonicalNormalizationOverride, which throws — but by then the stores
    // would already be cleared.
    mockGetDb.mockClear();
    await expect(restoreBackup(makeBackupV2({
      normalizationOverrides: [{ ...validOverride, targetKind: "banana" } as unknown as NormalizationOverrideDocument],
    }))).rejects.toThrow("Unknown normalization target kind: banana");
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("rejects an override that is not shaped like one", async () => {
    mockGetDb.mockClear();
    await expect(restoreBackup(makeBackupV2({
      normalizationOverrides: [{ ...validOverride, movementModifierIds: "barbell" } as unknown as NormalizationOverrideDocument],
    }))).rejects.toThrow(/normalizationOverrides\[0\]/);
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  // A newer build's file is rejected, not coerced: silently dropping fields
  // this build does not know about would destroy whatever they held.
  it("rejects a future version rather than discarding its unknown fields", async () => {
    mockGetDb.mockClear();
    await expect(restoreBackup({ ...makeBackupV2(), version: 3 }))
      .rejects.toThrow("Unsupported backup version: 3");
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});

describe("restoreBackup — alias tokens are recomputed, never trusted", () => {
  // The file's own token is untrustworthy in every version: hand-edited files
  // exist, and `by-normalized-alias` is the schema's only unique index. A stale
  // token restores with no error at all and the alias is simply dead —
  // aliasRepo.find() looks it up by the *recomputed* token and gets nothing.
  it("recomputes normalizedAlias from the alias text", async () => {
    mockPut.mockClear();
    await restoreBackup(makeBackupV1({
      aliases: [{ ...legacyAlias("Romanian Deadlift", "romanian-deadlift"), normalizedAlias: "WRONG-TOKEN" }],
    }));
    expect(putsToStore(isAlias)).toEqual([{
      id: "legacy:Romanian Deadlift",
      alias: "Romanian Deadlift",
      normalizedAlias: "romanian deadlift",
      canonicalExerciseId: "romanian-deadlift",
      provenance: "legacy-auto",
      createdAt: "2026-08-18T00:00:00.000Z",
    }]);
  });

  it("keeps one row when two aliases recompute to the same token", async () => {
    mockPut.mockClear();
    await restoreBackup(makeBackupV2({
      aliases: [
        {
          id: "alias-older", alias: "My Squat", normalizedAlias: "my squat",
          canonicalExerciseId: "goblet-squat", provenance: "remembered",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "alias-newer", alias: "My  squat", normalizedAlias: "my  squat",
          canonicalExerciseId: "pull-up", provenance: "remembered",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    }));
    expect(putsToStore(isAlias)).toEqual([{
      id: "alias-newer",
      alias: "My  squat",
      normalizedAlias: "my squat",
      canonicalExerciseId: "pull-up",
      provenance: "remembered",
      createdAt: "2026-06-01T00:00:00.000Z",
    }]);
  });

  it("purges a legacy alias whose token has no unique concrete outcome", async () => {
    mockPut.mockClear();
    await restoreBackup(makeBackupV1({
      aliases: [
        legacyAlias("Romanian Deadlift", "romanian-deadlift"),
        legacyAlias("3x8 @ RPE 7", "romanian-deadlift"),
      ],
    }));
    expect(putsToStore(isAlias).map((alias) => alias["alias"])).toEqual(["Romanian Deadlift"]);
  });
});

describe("restoreBackup — identity notification", () => {
  it("dispatches exactly one identity event, after the transaction commits", async () => {
    const committedAtDispatch: boolean[] = [];
    const listener = jest.fn(() => committedAtDispatch.push(txCommitted));
    window.addEventListener("trainer-exercise-identity-changed", listener);
    try {
      await restoreBackup(makeBackupV2({ normalizationOverrides: [validOverride] }));
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
    expect(listener).toHaveBeenCalledTimes(1);
    expect(committedAtDispatch).toEqual([true]);
  });
});
