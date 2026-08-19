import { deleteDB } from "idb";
import type { NormalizationOverrideDocument } from "@/lib/catalog/identity";
import { DB_NAME, resetDbConnection } from "./appDb";
import {
  normalizationOverrideRepo,
  type NormalizationOverrideSaveInput,
} from "./normalizationOverrideRepo";

// jest.useFakeTimers fakes Date plus every timer API by default; faking the
// timer queue would stall fake-indexeddb's request callbacks.
const FAKE_DATE_ONLY = [
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "setImmediate", "clearImmediate", "queueMicrotask", "nextTick",
  "performance", "requestAnimationFrame", "cancelAnimationFrame",
  "requestIdleCallback", "cancelIdleCallback", "hrtime",
] as const;

const validOverride: NormalizationOverrideSaveInput = {
  targetKind: "normalized-name",
  targetValue: "Hatfield Squat",
  movementId: "squat",
  movementModifierIds: ["barbell"],
};

type InvalidOverrideCase = {
  name: string;
  input: NormalizationOverrideSaveInput;
  expected: string;
};

function invalidOverrideInputs(): InvalidOverrideCase[] {
  const input = (
    movementId: string | null,
    movementModifierIds: string[],
  ): NormalizationOverrideSaveInput => ({
    ...validOverride,
    movementId,
    movementModifierIds,
  });

  return [
    { name: "unknown movement", input: input("missing-movement", []), expected: "Unknown movement: missing-movement" },
    { name: "unknown modifier", input: input("squat", ["missing-modifier"]), expected: "Unknown modifier: missing-modifier" },
    { name: "noncanonical order", input: input("squat", ["back-rack", "barbell"]), expected: "Modifier order is not canonical" },
    { name: "missing implication", input: input("squat", ["barbell", "high-bar"]), expected: "Missing implied modifier: high-bar requires back-rack" },
    { name: "exclusion conflict", input: input("squat", ["back-rack", "front-rack"]), expected: "Modifier exclusion conflict: back-rack/front-rack" },
    { name: "exclusive-group conflict", input: input("squat", ["back-rack", "high-bar", "low-bar"]), expected: "Exclusive-group conflict: bar-height" },
    { name: "exact allowlist miss", input: input("squat", ["pronated-grip"]), expected: "Modifier not allowed for movement: pronated-grip" },
    {
      name: "family maximum",
      input: input("squat", ["barbell", "dumbbell", "kettlebell", "bodyweight", "paused"]),
      expected: "Too many identity modifiers: squat",
    },
    { name: "null movement with modifiers", input: input(null, ["barbell"]), expected: "A standalone override cannot have movement modifiers" },
  ];
}

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
  resetDbConnection();
});

describe("normalizationOverrideRepo", () => {
  it("normalizes deterministic override keys", async () => {
    const saved = await normalizationOverrideRepo.save({
      ...validOverride,
      targetValue: " Hatfield Squat ",
    });

    expect(saved.id).toBe("normalized-name:hatfield squat");
    expect(saved.targetValue).toBe("hatfield squat");
    expect(saved.updatedAt).toEqual(expect.any(String));
    await expect(normalizationOverrideRepo.get(saved.id)).resolves.toEqual(saved);
  });

  it("upserts a repeated save on the same target to one record with a bumped updatedAt", async () => {
    const first = await normalizationOverrideRepo.save(validOverride);

    // Only Date is faked; timers stay real so the IndexedDB request queue
    // still drains normally.
    jest.useFakeTimers({ doNotFake: [...FAKE_DATE_ONLY] });
    jest.setSystemTime(new Date(Date.parse(first.updatedAt) + 60_000));
    let second: NormalizationOverrideDocument;
    try {
      second = await normalizationOverrideRepo.save({
        ...validOverride,
        targetValue: "hatfield squat",
        movementModifierIds: ["barbell", "back-rack"],
      });
    } finally {
      jest.useRealTimers();
    }

    expect(second.id).toBe(first.id);
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
    await expect(normalizationOverrideRepo.list()).resolves.toEqual([second]);
  });

  it("uses a trimmed exercise id as the deterministic exercise target key", async () => {
    const saved = await normalizationOverrideRepo.save({
      targetKind: "exercise-id",
      targetValue: " barbell-high-bar-squat ",
      movementId: "squat",
      movementModifierIds: ["barbell", "back-rack", "high-bar"],
    });

    expect(saved.id).toBe("exercise-id:barbell-high-bar-squat");
    expect(saved.targetValue).toBe("barbell-high-bar-squat");
  });

  it.each(invalidOverrideInputs())("rejects override: $name", async ({ input, expected }) => {
    await expect(normalizationOverrideRepo.save(input)).rejects.toThrow(expected);
    await expect(normalizationOverrideRepo.list()).resolves.toEqual([]);
  });

  it("rejects an unknown exercise-id target", async () => {
    await expect(normalizationOverrideRepo.save({
      ...validOverride,
      targetKind: "exercise-id",
      targetValue: "unknown-catalog-id",
    })).rejects.toThrow("Unknown exercise target: unknown-catalog-id");
  });

  it("accepts an existing user exercise as an exercise-id target", async () => {
    const db = await import("./appDb").then(({ getDb }) => getDb());
    await db.put("userExercises", {
      id: "user-fixture",
      name: "My squat",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    await expect(normalizationOverrideRepo.save({
      ...validOverride,
      targetKind: "exercise-id",
      targetValue: "user-fixture",
    })).resolves.toMatchObject({ id: "exercise-id:user-fixture" });
  });

  it("dispatches once after save commits and the listener can read the document", async () => {
    let committedRead: Promise<NormalizationOverrideDocument | undefined> | undefined;
    const listener = jest.fn(() => {
      committedRead = normalizationOverrideRepo.get("normalized-name:hatfield squat");
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await normalizationOverrideRepo.save(validOverride);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(committedRead).resolves.toMatchObject({ movementId: "squat" });
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  it("dispatches once after remove and supports suppressing migration/restore events", async () => {
    const saved = await normalizationOverrideRepo.save(validOverride, { dispatch: false });
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await normalizationOverrideRepo.remove(saved.id);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(normalizationOverrideRepo.get(saved.id)).resolves.toBeUndefined();
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });
});
