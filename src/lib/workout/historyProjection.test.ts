import fs from "node:fs";
import path from "node:path";
import {
  familyKeyForIdentity,
  projectExerciseHistory,
  rowsForIdentity,
  versionKeyForIdentity,
} from "./historyProjection";
import {
  bench,
  lowBar,
  makeHistoryProjectionContext,
  makeHistoryProjectionFixture,
} from "./historyProjection.testFixtures";
import { resolveExerciseIdentity } from "@/lib/catalog/identity";
import { highBar } from "@/lib/catalog/identity.testFixtures";
import type { WorkoutLogDocument } from "@/lib/programs/types";

const {
  context,
  squatIdentity,
  logWithHighAndLowBar,
  logsWithDuplicateHighBarEntries,
  totalVolumeAcrossBothEntries,
} = makeHistoryProjectionFixture();

test("keeps two same-family entries from one log", () => {
  const rows = rowsForIdentity(projectExerciseHistory([logWithHighAndLowBar], context), squatIdentity);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.performedName)).toEqual(
    expect.arrayContaining(["Low Bar Back Squat", "High Bar Back Squat"]),
  );
});

test("counts distinct logs and keeps concrete metrics separate", () => {
  const projection = projectExerciseHistory(logsWithDuplicateHighBarEntries, context);
  expect(projection.versionSummaries.get("barbell-high-bar-squat")).toMatchObject({
    sessionCount: 1,
    sessionVolumesLb: [totalVolumeAcrossBothEntries],
  });
  expect(projection.familySummaries.get("squat")).not.toHaveProperty("best");
});

// ─── Losslessness ────────────────────────────────────────────────────────────

describe("losslessness", () => {
  const logs = [logWithHighAndLowBar, ...logsWithDuplicateHighBarEntries];
  const expectedIdentities = [
    "log-both#0", "log-both#1", "log-dupe#0", "log-dupe#1", "log-bench#0",
  ];

  it("retains one row per data-bearing entry, identified by log and index", () => {
    const projection = projectExerciseHistory(logs, context);
    const seen = projection.rows.map((r) => `${r.logId}#${r.entryIndex}`);
    expect(seen).toHaveLength(expectedIdentities.length);
    expect(seen.slice().sort()).toEqual(expectedIdentities.slice().sort());
  });

  it("partitions every row into exactly one family bucket", () => {
    const projection = projectExerciseHistory(logs, context);
    const bucketed = [...projection.rowsByFamilyKey.values()].flatMap((rows) =>
      rows.map((r) => `${r.logId}#${r.entryIndex}`),
    );
    expect(bucketed).toHaveLength(projection.rows.length);
    expect(new Set(bucketed).size).toBe(projection.rows.length);
    expect(bucketed.slice().sort()).toEqual(expectedIdentities.slice().sort());
  });

  it("accounts for every row in the concrete-version entry counts", () => {
    const projection = projectExerciseHistory(logs, context);
    const counted = [...projection.versionSummaries.values()]
      .reduce((sum, summary) => sum + summary.entryCount, 0);
    expect(counted).toBe(projection.rows.length);
    expect(projection.versionSummaries.get("barbell-high-bar-squat")?.entryCount).toBe(3);
  });

  it("keeps a zero-volume entry that a totals-only check would miss", () => {
    const zeroVolume: WorkoutLogDocument = {
      id: "log-zero", programId: "p1", dayId: "d1",
      performedAt: "2026-05-20T14:00:00.000Z", performedDate: "2026-05-20",
      entries: [
        {
          exerciseId: "slot-a", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
          sets: [{ setNumber: 1, reps: 5 }],
        },
        {
          exerciseId: "slot-b", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
          sets: [{ setNumber: 1, weight: 200, reps: 5 }],
        },
      ],
    };
    const projection = projectExerciseHistory([zeroVolume], context);
    expect(projection.rows).toHaveLength(2);
    expect(projection.rows.map((r) => r.volumeLb)).toEqual([0, 1000]);
    expect(projection.rows.map((r) => r.sets)).toEqual([["BWx5"], ["200x5"]]);
    expect(projection.versionSummaries.get(highBar.id)?.entryCount).toBe(2);
  });

  it("never merges different concrete versions into one version summary", () => {
    const projection = projectExerciseHistory([logWithHighAndLowBar], context);
    expect([...projection.versionSummaries.keys()].sort()).toEqual([highBar.id, lowBar.id]);
    expect(projection.versionSummaries.get(highBar.id)?.sessionVolumesLb).toEqual([225 * 5]);
    expect(projection.versionSummaries.get(lowBar.id)?.sessionVolumesLb).toEqual([275 * 3]);
  });
});

// ─── Ordering ────────────────────────────────────────────────────────────────

describe("ordering", () => {
  it("sorts by performedAt descending, then logId, then entryIndex", () => {
    const sameInstant = "2026-06-01T14:00:00.000Z";
    const entry = (n: string) => ({
      exerciseId: "slot", exerciseName: n, canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1, weight: 100, reps: 5 }],
    });
    const logs: WorkoutLogDocument[] = [
      {
        id: "log-b", programId: "p1", dayId: "d1", performedAt: sameInstant, performedDate: "2026-06-01",
        entries: [entry("b0"), entry("b1")],
      },
      {
        id: "log-a", programId: "p1", dayId: "d1", performedAt: sameInstant, performedDate: "2026-06-01",
        entries: [entry("a0"), entry("a1")],
      },
      {
        id: "log-newer", programId: "p1", dayId: "d1", performedAt: "2026-06-02T14:00:00.000Z",
        performedDate: "2026-06-02", entries: [entry("newer")],
      },
    ];
    const rows = projectExerciseHistory(logs, context).rows;
    expect(rows.map((r) => r.performedName)).toEqual(["newer", "a0", "a1", "b0", "b1"]);
  });

  it("orders session volumes oldest first so trends read forward", () => {
    const logs: WorkoutLogDocument[] = [500, 400, 300, 200, 100].map((weight, i) => ({
      id: `log-${i}`, programId: "p1", dayId: "d1",
      performedAt: `2026-06-0${i + 1}T14:00:00.000Z`, performedDate: `2026-06-0${i + 1}`,
      entries: [{
        exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, weight, reps: 1 }],
      }],
    }));
    const summary = projectExerciseHistory(logs, context).versionSummaries.get(highBar.id);
    expect(summary?.sessionVolumesLb).toEqual([500, 400, 300, 200, 100]);
    expect(summary?.trend).toBe("down");
    expect(summary?.lastDate).toBe("2026-06-05");
  });
});

// ─── Inclusion rules ─────────────────────────────────────────────────────────

describe("entry inclusion", () => {
  const inProgress: WorkoutLogDocument = {
    id: "log-progress", programId: "p1", dayId: "d1",
    performedAt: "2026-07-01T14:00:00.000Z", performedDate: "2026-07-01",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1, weight: 210, reps: 5 }],
    }],
  };
  const noteOnly: WorkoutLogDocument = {
    id: "log-note", programId: "p1", dayId: "d1",
    performedAt: "2026-07-02T14:00:00.000Z", performedDate: "2026-07-02",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [], notes: "knee felt off, stopped early",
    }],
  };
  const skippedWithoutData: WorkoutLogDocument = {
    id: "log-skip", programId: "p1", dayId: "d1",
    performedAt: "2026-07-03T14:00:00.000Z", performedDate: "2026-07-03",
    skippedAt: "2026-07-03T14:00:00.000Z", skipReason: "travel",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1 }, { setNumber: 2 }],
    }],
  };

  it("includes entries from workouts still in progress", () => {
    const rows = projectExerciseHistory([inProgress], context).rows;
    expect(rows.map((r) => r.logId)).toEqual(["log-progress"]);
  });

  it("includes a note-only entry with no recorded sets", () => {
    const rows = projectExerciseHistory([noteOnly], context).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ note: "knee felt off, stopped early", sets: [], volumeLb: 0 });
  });

  it("skips an entry with no sets and no note", () => {
    const projection = projectExerciseHistory([skippedWithoutData], context);
    expect(projection.rows).toEqual([]);
    expect(projection.versionSummaries.size).toBe(0);
    expect(projection.familySummaries.size).toBe(0);
  });

  it("keeps a raw-cell entry whose value never parsed to numbers", () => {
    const rawCell: WorkoutLogDocument = {
      id: "log-raw", programId: "p1", dayId: "d1",
      performedAt: "2026-07-04T14:00:00.000Z", performedDate: "2026-07-04",
      entries: [{
        exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, rawCell: "40s hold" }],
      }],
    };
    expect(projectExerciseHistory([rawCell], context).rows[0].sets).toEqual(["40s hold"]);
  });

  it("preserves logged units in labels while normalizing volume to pounds", () => {
    const kg: WorkoutLogDocument = {
      id: "log-kg", programId: "p1", dayId: "d1",
      performedAt: "2026-07-05T14:00:00.000Z", performedDate: "2026-07-05",
      entries: [{
        exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, weight: 100, unit: "kg", reps: 5 }],
      }],
    };
    const row = projectExerciseHistory([kg], context).rows[0];
    expect(row.sets).toEqual(["100kgx5"]);
    expect(row.volumeLb).toBeCloseTo(100 * 2.2046226218 * 5, 4);
  });
});

// ─── Family and version summaries ────────────────────────────────────────────

describe("summaries", () => {
  const logs = [logWithHighAndLowBar, ...logsWithDuplicateHighBarEntries];

  it("exposes only distinct workout count and latest date for a family", () => {
    const family = projectExerciseHistory(logs, context).familySummaries.get("squat");
    expect(family).toMatchObject({
      familyKey: "squat", movementId: "squat", label: "Squat", workoutCount: 2,
      latestDate: "2026-05-11",
    });
    for (const forbidden of ["best", "bestSetLabel", "trend", "sessionVolumesLb", "volumes"]) {
      expect(family).not.toHaveProperty(forbidden);
    }
  });

  it("counts a family workout once even when it holds several family entries", () => {
    const family = projectExerciseHistory([logWithHighAndLowBar], context).familySummaries.get("squat");
    expect(family?.workoutCount).toBe(1);
    expect(family?.versionKeys.slice().sort()).toEqual([highBar.id, lowBar.id]);
  });

  it("derives best set, last result and label per concrete version", () => {
    const summary = projectExerciseHistory(logs, context).versionSummaries.get(highBar.id);
    expect(summary).toMatchObject({
      versionKey: highBar.id, concreteExerciseId: highBar.id, familyKey: "squat",
      label: "High Bar Back Squat", sessionCount: 2,
      // Best is the highest-volume single set: 200x8 (1600) beats 240x3 (720).
      bestSetLabel: "200x8", lastSets: ["240x3", "200x8"], lastDate: "2026-05-11",
      sessionVolumesLb: [225 * 5, totalVolumeAcrossBothEntries],
    });
  });

  it("keeps other families out of a family's rows", () => {
    const projection = projectExerciseHistory(logs, context);
    const benchIdentity = resolveExerciseIdentity(
      { kind: "catalog-reference", canonicalExerciseId: bench.id },
      context,
    );
    expect(rowsForIdentity(projection, benchIdentity).map((r) => r.logId)).toEqual(["log-bench"]);
    expect(rowsForIdentity(projection, squatIdentity).map((r) => r.logId))
      .toEqual(["log-dupe", "log-dupe", "log-both", "log-both"]);
  });
});

// ─── Unresolved records ──────────────────────────────────────────────────────

describe("unresolved records", () => {
  const unknown: WorkoutLogDocument = {
    id: "log-unknown", programId: "p1", dayId: "d1",
    performedAt: "2026-08-01T14:00:00.000Z", performedDate: "2026-08-01",
    entries: [{
      exerciseId: "slot-mystery", exerciseName: "Zercher Good Morning",
      canonicalExerciseId: "does-not-exist", sets: [{ setNumber: 1, weight: 95, reps: 8 }],
    }],
  };

  it("keeps an unknown canonical id visible under a resolver standalone key", () => {
    const projection = projectExerciseHistory([unknown], context);
    const identity = resolveExerciseIdentity(
      {
        kind: "stored-exercise", canonicalExerciseId: "does-not-exist",
        slotId: "slot-mystery", performedName: "Zercher Good Morning",
      },
      context,
    );
    expect(familyKeyForIdentity(identity)).toBe("slot:slot-mystery");
    expect(versionKeyForIdentity(identity)).toBe("slot:slot-mystery");
    expect(rowsForIdentity(projection, identity)).toHaveLength(1);
    expect(projection.rows[0]).toMatchObject({
      performedName: "Zercher Good Morning", concreteExerciseId: undefined,
      movementId: undefined, currentVersionLabel: undefined,
    });
    expect(projection.familySummaries.get("slot:slot-mystery")).toMatchObject({
      label: "Zercher Good Morning", workoutCount: 1,
    });
  });

  it("labels a row with no stored name from resolver output rather than dropping it", () => {
    const nameless: WorkoutLogDocument = {
      id: "log-nameless", programId: "p1", dayId: "d1",
      performedAt: "2026-08-02T14:00:00.000Z", performedDate: "2026-08-02",
      entries: [{ exerciseId: "slot-bare", sets: [{ setNumber: 1, weight: 45, reps: 10 }] }],
    };
    const rows = projectExerciseHistory([nameless], context).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].performedName).toBe("slot-bare");
  });
});

// ─── Immutable performed labels vs current classification ────────────────────

describe("stored labels versus current classification", () => {
  it("keeps the stored performed name and adds the current version label", () => {
    const typedName: WorkoutLogDocument = {
      id: "log-typed", programId: "p1", dayId: "d1",
      performedAt: "2026-08-03T14:00:00.000Z", performedDate: "2026-08-03",
      entries: [{
        exerciseId: "slot", exerciseName: "hi bar squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, weight: 230, reps: 4 }],
      }],
    };
    expect(projectExerciseHistory([typedName], context).rows[0]).toMatchObject({
      performedName: "hi bar squat",
      currentVersionLabel: "High Bar Back Squat",
      movementId: "squat",
    });
  });
});

// ─── Identity-context changes do not require reloading logs ──────────────────

describe("identity-context seam", () => {
  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === "object") Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };

  it("regroups the very same logs under a changed context without mutating them", () => {
    const logs = deepFreeze([logWithHighAndLowBar]);
    const before = projectExerciseHistory(logs, context);
    expect(rowsForIdentity(before, squatIdentity)).toHaveLength(2);

    const corrected = makeHistoryProjectionContext();
    const movedContext = {
      ...corrected,
      normalizationOverrides: [{
        id: "override-low-bar", targetKind: "exercise-id" as const, targetValue: lowBar.id,
        movementId: null, movementModifierIds: [], updatedAt: "2026-08-04T00:00:00.000Z",
      }],
    };
    const after = projectExerciseHistory(logs, movedContext);

    // Same log objects, no reload: only the classification moved.
    expect(after.rows).toHaveLength(2);
    expect(rowsForIdentity(after, squatIdentity)).toHaveLength(1);
    expect(after.familySummaries.get(`exercise:${lowBar.id}`)?.workoutCount).toBe(1);
    expect(logs[0].entries[1].canonicalExerciseId).toBe(lowBar.id);
  });

  it("reads no storage: the projection module imports no repository or database", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "historyProjection.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((s) => /storage|Repo|appDb|indexedDB|idb/i.test(s))).toEqual([]);
  });
});
