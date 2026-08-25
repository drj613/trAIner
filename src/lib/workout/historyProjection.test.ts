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
import {
  backRack,
  barbell,
  highBar,
  makeIdentityContext,
  squat,
} from "@/lib/catalog/identity.testFixtures";
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

  // The Today drawer filters by version, and a row can belong to a version that
  // has no `concreteExerciseId` (an underspecified name keys on
  // `movement:<id>`). Carrying the key on the row is what lets a surface group
  // by version without deriving a second, divergent rule.
  it("stamps every row with the version bucket it was counted in", () => {
    const projection = projectExerciseHistory(logs, context);
    for (const [versionKey, rows] of projection.rowsByVersionKey) {
      expect(rows.map((row) => row.versionKey)).toEqual(rows.map(() => versionKey));
    }
    expect(new Set(projection.rows.map((row) => row.versionKey)))
      .toEqual(new Set(projection.versionSummaries.keys()));
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
    // The standalone key is qualified by the normalized performed name, because
    // the slot id alone cannot tell two swapped exercises apart.
    expect(familyKeyForIdentity(identity)).toBe("slot:slot-mystery#zercher good morning");
    expect(versionKeyForIdentity(identity)).toBe("slot:slot-mystery#zercher good morning");
    expect(rowsForIdentity(projection, identity)).toHaveLength(1);
    expect(projection.rows[0]).toMatchObject({
      performedName: "Zercher Good Morning", concreteExerciseId: undefined,
      movementId: undefined, currentVersionLabel: undefined,
    });
    expect(projection.familySummaries.get("slot:slot-mystery#zercher good morning")).toMatchObject({
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

// ─── Unreadable stored shapes ────────────────────────────────────────────────

describe("unreadable sets", () => {
  // `src/lib/storage/appDb.ts:186-195` deliberately keeps a log whose `sets` is
  // present but not an array, because it "may be standing in for real sets we
  // have no way to recover". Those logs reach this projection, so one of them
  // must never remove another exercise's readable history from view.
  const logWith = (sets: unknown): WorkoutLogDocument => ({
    id: "log-corrupt", programId: "p1", dayId: "d1",
    performedAt: "2026-09-01T14:00:00.000Z", performedDate: "2026-09-01",
    entries: [
      {
        exerciseId: "slot-a", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, weight: 315, reps: 2 }],
      },
      {
        exerciseId: "slot-b", exerciseName: "Barbell Bench Press", canonicalExerciseId: bench.id,
        sets,
      },
    ],
  } as unknown as WorkoutLogDocument);

  // Present but unreadable: counts as recorded work, so the entry keeps a dated
  // row with no set labels and no volume rather than vanishing.
  it.each([["a string", "corrupt"], ["a number", 42], ["an object", {}]])(
    "rows an entry whose sets is %s, and keeps the readable entry beside it",
    (_label, sets) => {
      const projection = projectExerciseHistory([logWith(sets)], context);
      expect(projection.rows.map((r) => `${r.logId}#${r.entryIndex}`))
        .toEqual(["log-corrupt#0", "log-corrupt#1"]);
      expect(projection.rows[0]).toMatchObject({ sets: ["315x2"], volumeLb: 630 });
      expect(projection.rows[1]).toMatchObject({
        performedName: "Barbell Bench Press", sets: [], volumeLb: 0,
      });
      expect(projection.versionSummaries.get(bench.id)?.entryCount).toBe(1);
    },
  );

  // Absent, not unreadable — the settled line (`v10Identity.ts:158`, ledger
  // "the line is between absent and unreadable"). Nothing was recorded, so no
  // row, but it must not throw and take the readable entry down with it.
  it.each([["undefined", undefined], ["null", null]])(
    "keeps the readable entry when a sibling's sets is %s",
    (_label, sets) => {
      const projection = projectExerciseHistory([logWith(sets)], context);
      expect(projection.rows.map((r) => `${r.logId}#${r.entryIndex}`)).toEqual(["log-corrupt#0"]);
      expect(projection.rows[0]).toMatchObject({ sets: ["315x2"], volumeLb: 630 });
      expect(projection.versionSummaries.get(bench.id)).toBeUndefined();
    },
  );
});

// ─── Two exercises in one slot ───────────────────────────────────────────────

describe("unresolvable exercises sharing a slot id", () => {
  // Legacy pre-canonical logs carry only `exerciseId`, so the resolver falls
  // back to a standalone key built from the slot alone (`identity.ts:177-178`).
  // One exercise swap (`exerciseSwap.ts`) puts two genuinely different exercises
  // in that slot, and merging them would label one summary with the other's
  // name and report the other's best set.
  const logOf = (id: string, at: string, name: string, weight: number, reps: number): WorkoutLogDocument => ({
    id, programId: "p1", dayId: "d1", performedAt: at, performedDate: at.slice(0, 10),
    entries: [{ exerciseId: "slot-shared", exerciseName: name, sets: [{ setNumber: 1, weight, reps }] }],
  });
  const logs = [
    logOf("log-zercher", "2026-04-01T14:00:00.000Z", "Zercher Good Morning", 95, 8),
    logOf("log-nordic", "2026-04-08T14:00:00.000Z", "Nordic Hamstring Curl", 45, 10),
  ];

  it("keeps them as two versions with their own labels and best sets", () => {
    const projection = projectExerciseHistory(logs, context);
    const summaries = [...projection.versionSummaries.values()]
      .map((s) => ({ label: s.label, best: s.bestSetLabel, volumes: s.sessionVolumesLb }))
      .sort((a, b) => a.label.localeCompare(b.label));
    expect(summaries).toEqual([
      { label: "Nordic Hamstring Curl", best: "45x10", volumes: [450] },
      { label: "Zercher Good Morning", best: "95x8", volumes: [760] },
    ]);
  });

  it("keeps them as two families rather than one blended trend", () => {
    const projection = projectExerciseHistory(logs, context);
    expect([...projection.familySummaries.values()].map((f) => f.label).sort())
      .toEqual(["Nordic Hamstring Curl", "Zercher Good Morning"]);
    for (const family of projection.familySummaries.values()) {
      expect(family.workoutCount).toBe(1);
    }
  });

  it("still groups repeats of the same performed name in one slot together", () => {
    const repeats = [
      logOf("log-a", "2026-04-01T14:00:00.000Z", "Zercher Good Morning", 95, 8),
      logOf("log-b", "2026-04-08T14:00:00.000Z", "Zercher good morning", 105, 8),
    ];
    const projection = projectExerciseHistory(repeats, context);
    expect(projection.versionSummaries.size).toBe(1);
    expect([...projection.versionSummaries.values()][0]).toMatchObject({
      sessionCount: 2, sessionVolumesLb: [760, 840],
    });
  });
});

// ─── Best set: the total order ───────────────────────────────────────────────

describe("best set ordering", () => {
  const logWithSets = (sets: WorkoutLogDocument["entries"][number]["sets"]): WorkoutLogDocument => ({
    id: "log-best", programId: "p1", dayId: "d1",
    performedAt: "2026-10-01T14:00:00.000Z", performedDate: "2026-10-01",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets,
    }],
  });
  const bestOf = (sets: WorkoutLogDocument["entries"][number]["sets"]) =>
    projectExerciseHistory([logWithSets(sets)], context).versionSummaries.get(highBar.id)?.bestSetLabel;

  it("ranks by set volume first", () => {
    // 200x8 = 1600 beats 240x3 = 720 and 180x4 = 720.
    expect(bestOf([
      { setNumber: 1, weight: 240, reps: 3 },
      { setNumber: 2, weight: 200, reps: 8 },
      { setNumber: 3, weight: 180, reps: 4 },
    ])).toBe("200x8");
  });

  it("breaks an equal-volume tie by the heavier load", () => {
    // Both 1000 lb of work; 200 is the heavier set, and it is logged second, so
    // this cannot pass on position.
    expect(bestOf([
      { setNumber: 1, weight: 100, reps: 10 },
      { setNumber: 2, weight: 200, reps: 5 },
    ])).toBe("200x5");
  });

  it("breaks a no-load tie by reps, so bodyweight work ranks sensibly", () => {
    // Every bodyweight set has volume 0 and no load, and 8 reps is plainly the
    // better set than 5.
    expect(bestOf([
      { setNumber: 1, reps: 5 },
      { setNumber: 2, reps: 8 },
    ])).toBe("BWx8");
  });

  it("keeps the earliest set when volume, load and reps are all equal", () => {
    // Identical work, distinguishable only by their raw cells.
    expect(bestOf([
      { setNumber: 1, weight: 100, reps: 5, rawCell: "first" },
      { setNumber: 2, weight: 100, reps: 5, rawCell: "second" },
    ])).toBe("first");
  });

  it("compares the load tiebreak in pounds, not raw numbers", () => {
    // Neither set recorded reps, so both have volume 0 and the load tiebreak
    // decides. 100kg is 220 lb, so it is the heavier set even though 150 is the
    // larger raw number — and it is logged second, so neither a raw-number
    // comparison nor the earliest-set fallback can produce this answer.
    expect(bestOf([
      { setNumber: 1, weight: 150 },
      { setNumber: 2, weight: 100, unit: "kg" },
    ])).toBe("100kg");
  });
});

// ─── Ordering is a total order ───────────────────────────────────────────────

describe("deterministic ordering with unreadable timestamps", () => {
  // A hand-edited or foreign backup can carry a `performedAt` that does not
  // parse. Falling back to a string comparison only when one side is
  // unparseable makes the comparator intransitive, and `Array.prototype.sort`
  // over an intransitive comparator has implementation-defined output.
  const entry = (name: string) => ({
    exerciseId: "slot", exerciseName: name, canonicalExerciseId: highBar.id,
    sets: [{ setNumber: 1, weight: 100, reps: 5 }],
  });
  const logs: WorkoutLogDocument[] = [
    { id: "l-mid", programId: "p1", dayId: "d1", performedAt: "2026-06-01T14:00:00.000Z", performedDate: "2026-06-01", entries: [entry("mid")] },
    { id: "l-bad", programId: "p1", dayId: "d1", performedAt: "not a date", performedDate: "2026-06-02", entries: [entry("bad")] },
    { id: "l-new", programId: "p1", dayId: "d1", performedAt: "2026-07-01T14:00:00.000Z", performedDate: "2026-07-01", entries: [entry("new")] },
  ];

  it("sorts rows with an unparseable timestamp oldest", () => {
    expect(projectExerciseHistory(logs, context).rows.map((r) => r.performedName))
      .toEqual(["new", "mid", "bad"]);
  });

  it("orders every pair the same way the whole list is ordered", () => {
    // This is the assertion that actually pins transitivity. Measured: the
    // permutation test below is green under the pre-round intransitive
    // comparator at n=3, 4, 5 and 6 exhaustively and at n=40 over 400 shuffles —
    // V8 never exposes the inconsistency, so `new Set(orders).size === 1` cannot
    // fail for that reason at any size reachable here. A pairwise-versus-global
    // check does not depend on the sort algorithm noticing.
    // "May 1 2026" is the shape that makes the pre-round comparator intransitive:
    // it parses, so against another parseable stamp it is compared by instant,
    // but against an unparseable one it is compared as text — and its text order
    // disagrees with its chronological order. With "Foo" sitting lexicographically
    // between it and an ISO stamp, the three form a cycle.
    const mixed: WorkoutLogDocument[] = [
      "2026-06-01T14:00:00.000Z", "May 1 2026", "Foo", "not a date", "zzz",
      "2026-07-01T14:00:00.000Z", "42", "",
    ].map((performedAt, i) => ({
      id: `l-${i}`, programId: "p1", dayId: "d1",
      performedAt, performedDate: "2026-06-01", entries: [entry(`n${i}`)],
    } as unknown as WorkoutLogDocument));

    const globalOrder = projectExerciseHistory(mixed, context).rows.map((r) => r.performedName);
    const rankOf = new Map(globalOrder.map((name, index) => [name, index]));
    const inconsistent: string[] = [];
    for (let i = 0; i < mixed.length; i += 1) {
      for (let j = i + 1; j < mixed.length; j += 1) {
        const pair = projectExerciseHistory([mixed[i], mixed[j]], context)
          .rows.map((r) => r.performedName);
        const globallyFirst = rankOf.get(`n${i}`)! < rankOf.get(`n${j}`)! ? `n${i}` : `n${j}`;
        if (pair[0] !== globallyFirst) inconsistent.push(`${i},${j}`);
      }
    }
    // Sanity: the probe really did compare all 28 pairs of 8 distinct rows.
    expect(globalOrder).toHaveLength(8);
    expect(inconsistent).toEqual([]);
  });

  it("returns the same order for every input permutation", () => {
    // Pins output stability, NOT transitivity: measured green under the
    // pre-round intransitive comparator at every size reachable in V8. The
    // literal-order assertion below is what carries this test; the pairwise
    // check above is the transitivity pin.
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ].map((order) => order.map((i) => logs[i]));
    const orders = permutations.map((permutation) =>
      projectExerciseHistory(permutation, context).rows.map((r) => r.performedName).join(","),
    );
    expect(new Set(orders).size).toBe(1);
    expect(orders[0]).toBe("new,mid,bad");
  });

  it("keeps rows whose performedAt is not even a string", () => {
    // `Date.parse` coerces, so 42 and "42" are the same instant and the string
    // tiebreak runs on a number. Comparing them must not throw and take the
    // whole projection down.
    const corrupt = [
      { id: "l-num", programId: "p1", dayId: "d1", performedAt: 42, performedDate: "2042-01-01", entries: [entry("num")] },
      { id: "l-str", programId: "p1", dayId: "d1", performedAt: "42", performedDate: "2042-01-01", entries: [entry("str")] },
    ] as unknown as WorkoutLogDocument[];
    expect(projectExerciseHistory(corrupt, context).rows.map((r) => r.performedName).sort())
      .toEqual(["num", "str"]);
  });

  it("keeps rows whose log id is not a string", () => {
    // The `logId` tiebreak only runs when the `performedAt` key ties, which is
    // why the test above passes with a raw `localeCompare`: its fixture's ids
    // happen to be strings. Two logs at one instant with a numeric id are the
    // shape that reaches it, and `performedAtOrder` already coerces its own
    // tiebreak with `String(...)` two lines away for exactly this reason.
    // BOTH input orders, because `localeCompare` coerces its *argument*: with the
    // numeric id on the right the raw call survives, so a single-order fixture
    // would pass without the fix.
    const sameInstant = "2026-08-02T14:00:00.000Z";
    for (const ids of [[1, "l-two"], ["l-two", 1]]) {
      const corrupt = ids.map((id) => ({
        id, programId: "p1", dayId: "d1", performedAt: sameInstant, performedDate: "2026-08-02",
        entries: [entry(`log-${String(id)}`)],
      })) as unknown as WorkoutLogDocument[];
      const projection = projectExerciseHistory(corrupt, context);
      expect(projection.rows.map((r) => r.performedName).sort()).toEqual(["log-1", "log-l-two"]);
      // Each log is still its own session, so the numeric id did not merge them.
      expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
        entryCount: 2, sessionCount: 2, sessionVolumesLb: [500, 500],
      });
    }
  });

  it("keeps two same-instant workouts apart when both log ids are numbers", () => {
    // Reaches the chronological comparator's tiebreak as well as the newest-first
    // one: without coercion the bucketing sort throws before it can run.
    const sameInstant = "2026-08-03T14:00:00.000Z";
    const corrupt = [1, 2].map((id) => ({
      id, programId: "p1", dayId: "d1", performedAt: sameInstant, performedDate: "2026-08-03",
      entries: [entry(`log-${id}-a`), entry(`log-${id}-b`)],
    })) as unknown as WorkoutLogDocument[];
    const projection = projectExerciseHistory(corrupt, context);
    expect(projection.rows).toHaveLength(4);
    expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
      entryCount: 4, sessionCount: 2, sessionVolumesLb: [1000, 1000],
    });
  });

  it("keeps same-workout rows adjacent so one workout is one session", () => {
    // Two workouts recorded at the identical instant, each logging the version
    // twice. If the two logs' entries interleave, the session-bucketing loop
    // splits one workout into several sessions.
    const sameInstant = "2026-08-01T14:00:00.000Z";
    const twoLogs: WorkoutLogDocument[] = ["l-x", "l-y"].map((id) => ({
      id, programId: "p1", dayId: "d1", performedAt: sameInstant, performedDate: "2026-08-01",
      entries: [entry(`${id}-0`), entry(`${id}-1`)],
    }));
    const summary = projectExerciseHistory(twoLogs, context).versionSummaries.get(highBar.id);
    expect(summary).toMatchObject({
      entryCount: 4, sessionCount: 2, sessionVolumesLb: [1000, 1000],
    });
  });
});

// ─── Unreadable entries lists ────────────────────────────────────────────────

describe("unreadable entries", () => {
  // `appDb.ts:186-195` keeps a log whose `entries` is not an array or whose
  // entry elements are not records, and the v7 ruling keeps a log whose only
  // entry is `null`, both because they may stand in for real sets. So these
  // logs are in storage by design, and one of them must not erase every other
  // workout's history.
  const goodLog: WorkoutLogDocument = {
    id: "l-good", programId: "p1", dayId: "d1",
    performedAt: "2026-11-01T14:00:00.000Z", performedDate: "2026-11-01",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1, weight: 405, reps: 1 }],
    }],
  };
  const withEntries = (entries: unknown): WorkoutLogDocument => ({
    id: "l-bad", programId: "p1", dayId: "d1",
    performedAt: "2026-11-02T14:00:00.000Z", performedDate: "2026-11-02", entries,
  } as unknown as WorkoutLogDocument);

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "corrupt"],
    ["a number", 7],
    ["an object", {}],
    ["an array holding null", [null]],
    ["an array holding a string", ["corrupt"]],
  ])("keeps every other workout's history when one log's entries is %s", (_label, entries) => {
    const projection = projectExerciseHistory([withEntries(entries), goodLog], context);
    expect(projection.rows.map((r) => `${r.logId}#${r.entryIndex}`)).toEqual(["l-good#0"]);
    expect(projection.rows[0]).toMatchObject({ sets: ["405x1"], volumeLb: 405 });
    expect(projection.versionSummaries.get(highBar.id)?.sessionCount).toBe(1);
  });

  it("keeps the readable entries of a log that also holds an unreadable one", () => {
    // The row identity is the entry's position in the stored array, so skipping
    // an unreadable element must not renumber the ones after it.
    const mixed = withEntries([
      null,
      {
        exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, weight: 315, reps: 3 }],
      },
    ]);
    const projection = projectExerciseHistory([mixed], context);
    expect(projection.rows.map((r) => `${r.logId}#${r.entryIndex}`)).toEqual(["l-bad#1"]);
  });
});

// ─── Unreadable fields inside an entry ───────────────────────────────────────

describe("unreadable entry fields", () => {
  // Found while self-reviewing the unreadable-sets fix: three more shapes threw
  // out of the whole projection, on the same reasoning as `sets` — a value we
  // cannot read must not remove readable history from view.
  const goodLog: WorkoutLogDocument = {
    id: "l-good", programId: "p1", dayId: "d1",
    performedAt: "2026-12-01T14:00:00.000Z", performedDate: "2026-12-01",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1, weight: 500, reps: 1 }],
    }],
  };
  const logWithEntry = (entry: unknown): WorkoutLogDocument => ({
    id: "l-bad", programId: "p1", dayId: "d1",
    performedAt: "2026-12-02T14:00:00.000Z", performedDate: "2026-12-02", entries: [entry],
  } as unknown as WorkoutLogDocument);

  it.each([
    ["a set element is null", { exerciseId: "s", exerciseName: "Mystery", sets: [null] }],
    ["a set element is a string", { exerciseId: "s", exerciseName: "Mystery", sets: ["corrupt"] }],
    ["the exercise name is a number", { exerciseId: "s", exerciseName: 7, sets: [{ setNumber: 1, weight: 60, reps: 5 }] }],
    ["the note is a number", { exerciseId: "s", exerciseName: "Mystery", sets: [], notes: 7 }],
  ])("keeps the other workout's history when %s", (_label, entry) => {
    const projection = projectExerciseHistory([logWithEntry(entry), goodLog], context);
    expect(projection.rows.map((r) => r.logId)).toContain("l-good");
    expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
      sessionCount: 1, bestSetLabel: "500x1", sessionVolumesLb: [500],
    });
  });

  it("rows an entry whose only set element is unreadable, with no fabricated set", () => {
    const projection = projectExerciseHistory([logWithEntry({
      exerciseId: "s", exerciseName: "Mystery", sets: [null],
    })], context);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0]).toMatchObject({
      performedName: "Mystery", sets: [], volumeLb: 0,
    });
    expect(projection.versionSummaries.get("slot:s#mystery")?.bestSetLabel).toBeUndefined();
  });

  it("keeps a readable set that sits beside an unreadable one", () => {
    const projection = projectExerciseHistory([logWithEntry({
      exerciseId: "s", exerciseName: "Mystery",
      sets: [{ setNumber: 1, weight: 100, reps: 5 }, null],
    })], context);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0]).toMatchObject({ sets: ["100x5"], volumeLb: 500 });
    expect(projection.versionSummaries.get("slot:s#mystery")?.bestSetLabel).toBe("100x5");
  });

  it("labels a row from an unreadable slot id as text", () => {
    // Nothing readable names this entry, so the slot id is the only label left
    // and the row type promises a string.
    const projection = projectExerciseHistory([logWithEntry({
      exerciseId: 7, sets: [{ setNumber: 1, weight: 60, reps: 5 }],
    })], context);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0].performedName).toBe("7");
    expect(typeof projection.rows[0].performedName).toBe("string");
    // Summary labels come from the same unreadable value and carry the same
    // promise.
    expect(projection.familySummaries.get("slot:7")?.label).toBe("7");
    expect(projection.versionSummaries.get("slot:7")?.label).toBe("7");
  });

  it("does not pass an unreadable note or name through to a row", () => {
    const projection = projectExerciseHistory([logWithEntry({
      exerciseId: "slot-x", exerciseName: 7, notes: 9,
      sets: [{ setNumber: 1, weight: 60, reps: 5 }],
    })], context);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0].note).toBeUndefined();
    expect(typeof projection.rows[0].performedName).toBe("string");
    expect(projection.rows[0].performedName).toBe("slot-x");
  });
});

describe("summary labels with nothing to name them", () => {
  // Pins that the label comes from the row rather than an invented placeholder.
  // It cannot distinguish `labelOf` from plain `textOf` — see that function's
  // comment for why no input can.
  it("labels a family from the row when the resolver has no display label", () => {
    // No canonical id, no stored name and no slot id, so the resolver's
    // displayLabel is absent and the label must come from the next candidate.
    const projection = projectExerciseHistory([{
      id: "l-nolabel", programId: "p1", dayId: "d1",
      performedAt: "2027-01-01T14:00:00.000Z", performedDate: "2027-01-01",
      entries: [{ notes: "did something" }],
    } as unknown as WorkoutLogDocument], context);
    expect(projection.rows).toHaveLength(1);
    const family = [...projection.familySummaries.values()][0];
    expect(family.label).toBe(projection.rows[0].performedName);
    expect([...projection.versionSummaries.values()][0].label)
      .toBe(projection.rows[0].performedName);
  });
});

describe("unreadable set fields", () => {
  // One level deeper than the entry-level guards above, and the same class:
  // `src/lib/storage/appDb.ts:186-195` never inspects the fields of a set
  // record, so a hand-edited or foreign backup can put anything in `rawCell` or
  // a set-level `notes` and storage preserves it verbatim. A value we cannot
  // read must not remove readable history from view, on the settled
  // absent-vs-unreadable line (`unreadableValue`,
  // `src/lib/storage/migrations/v10Identity.ts:158`).
  const goodLog: WorkoutLogDocument = {
    id: "l-fine", programId: "p1", dayId: "d1",
    performedAt: "2027-02-01T14:00:00.000Z", performedDate: "2027-02-01",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1, weight: 500, reps: 1 }],
    }],
  };
  // The corrupt set sits *beside* a readable one in the same entry, so the
  // assertions can tell "nothing threw" apart from "the readable set survived".
  const logWithSet = (set: unknown): WorkoutLogDocument => ({
    id: "l-set", programId: "p1", dayId: "d1",
    performedAt: "2027-02-02T14:00:00.000Z", performedDate: "2027-02-02",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      // Corrupt set FIRST: `readableSets(entry).some(setHasData)` short-circuits,
      // so a corrupt field on a *later* set is never even read and a test with
      // that order would pass without the guard.
      sets: [set, { setNumber: 2, weight: 200, reps: 5 }],
    }],
  } as unknown as WorkoutLogDocument);

  const corruptShapes: [string, unknown][] = [
    ["rawCell is a number", { setNumber: 1, rawCell: 7 }],
    ["rawCell is an object", { setNumber: 1, rawCell: {} }],
    ["a set-level notes is a number", { setNumber: 1, notes: 7 }],
    ["a set-level notes is an object", { setNumber: 1, notes: {} }],
  ];

  it.each(corruptShapes)("keeps every workout's history when %s", (_label, set) => {
    const projection = projectExerciseHistory([logWithSet(set), goodLog], context);
    expect(projection.rows.map((r) => `${r.logId}#${r.entryIndex}`).sort())
      .toEqual(["l-fine#0", "l-set#0"]);
    // Oldest first: `l-fine` is 2027-02-01, `l-set` is 2027-02-02.
    expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
      sessionCount: 2, sessionVolumesLb: [500, 1000], bestSetLabel: "200x5",
    });
    expect(projection.rows.find((r) => r.logId === "l-set")).toMatchObject({
      sets: ["200x5"], volumeLb: 1000,
    });
  });

  it("rows a set whose only content is an unreadable rawCell, with no label", () => {
    const projection = projectExerciseHistory([{
      id: "l-only", programId: "p1", dayId: "d1",
      performedAt: "2027-02-04T14:00:00.000Z", performedDate: "2027-02-04",
      entries: [{
        exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, rawCell: 7 }],
      }],
    } as unknown as WorkoutLogDocument], context);
    // Unreadable content is recorded work, so the entry earns a dated row; there
    // is nothing readable to label the set with, so no label is fabricated.
    expect(projection.rows.map((r) => `${r.logId}#${r.entryIndex}`)).toEqual(["l-only#0"]);
    expect(projection.rows[0]).toMatchObject({ sets: [], volumeLb: 0 });
    expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
      sessionCount: 1, entryCount: 1, bestSetLabel: undefined,
    });
  });

  // N5. Measured at HEAD, and the mechanism is narrower than the review stated:
  // `a || b || c` returns `c` when `a` and `b` are `NaN` (both falsy), so an
  // unreadable *weight* leaves the reps clause deciding and "best" stays the
  // earliest set. What an unreadable weight does destroy is the volume — the
  // whole readable session reads `NaN`. An unreadable *reps* is the shape that
  // makes every clause `NaN`, so `NaN <= 0` is false and "best" becomes the last
  // set. Both are pinned here.
  const mixedLog = (corruptSet: unknown): WorkoutLogDocument => ({
    id: "l-mix", programId: "p1", dayId: "d1",
    performedAt: "2027-02-03T14:00:00.000Z", performedDate: "2027-02-03",
    entries: [{
      exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
      sets: [{ setNumber: 1, weight: 300, reps: 5 }, corruptSet],
    }],
  } as unknown as WorkoutLogDocument);

  it("keeps an unreadable weight from turning a readable session's volume into NaN", () => {
    const projection = projectExerciseHistory(
      [mixedLog({ setNumber: 2, weight: {}, reps: 5 })],
      context,
    );
    expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
      sessionVolumesLb: [1500], bestSetLabel: "300x5",
    });
    expect(projection.rows[0].volumeLb).toBe(1500);
  });

  // The reps clause is only *reached* when volume and load both tie, which for an
  // unreadable reps means two no-load sets — bodyweight work. Written this way
  // deliberately: with any load, the volume clause decides first and a test there
  // would pass with the reps guard removed.
  it("keeps an unreadable reps from stealing the best set from a readable bodyweight one", () => {
    const projection = projectExerciseHistory([{
      id: "l-bw", programId: "p1", dayId: "d1",
      performedAt: "2027-02-05T14:00:00.000Z", performedDate: "2027-02-05",
      entries: [{
        exerciseId: "slot", exerciseName: "High Bar Back Squat", canonicalExerciseId: highBar.id,
        sets: [{ setNumber: 1, reps: 5 }, { setNumber: 2, reps: {} }],
      }],
    } as unknown as WorkoutLogDocument], context);
    expect(projection.versionSummaries.get(highBar.id)).toMatchObject({
      bestSetLabel: "BWx5", sessionVolumesLb: [0],
    });
  });
});

// ─── One underspecified movement logged under synonymous names ────────────────

describe("underspecified names the catalogue declares identical", () => {
  // The shipped catalogue gives movement `squat` four underspecified names —
  // `back squat`, `barbell back squat`, `squat`, `squats`
  // (`src/lib/catalog/importDisambiguations.generated.json`) — so it declares
  // them the same thing at the same specificity. An underspecified name is
  // healthy data, not corruption, and a user who types "Squat" some weeks and
  // "Squats" others must keep one history with a real progression rather than a
  // version card per spelling, each with its own PR and its own one-session
  // trend.
  const underspecifiedSquatContext = makeIdentityContext({
    movementsById: new Map([[squat.id, squat]]),
    modifiersById: new Map([[barbell.id, barbell], [backRack.id, backRack]]),
    disambiguations: new Map((["squat", "squats", "back squat"]).map((normalizedName) => [
      normalizedName,
      {
        id: `${normalizedName.replace(/\s/g, "-")}-choice`,
        kind: "underspecified-name" as const,
        normalizedName,
        movementId: "squat",
        candidateExerciseIds: [highBar.id],
        matchedModifierIds: ["barbell", "back-rack"],
      },
    ])),
  });

  const logOf = (id: string, date: string, name: string, weight: number): WorkoutLogDocument => ({
    id, programId: "p1", dayId: "d1",
    performedAt: `${date}T14:00:00.000Z`, performedDate: date,
    entries: [{ exerciseId: "slot-squat", exerciseName: name, sets: [{ setNumber: 1, weight, reps: 5 }] }],
  });

  it("keeps one version history across Squat, Squats and Back Squat", () => {
    const projection = projectExerciseHistory([
      logOf("l-1", "2027-03-01", "Squat", 300),
      logOf("l-2", "2027-03-08", "Squats", 305),
      logOf("l-3", "2027-03-15", "Back Squat", 310),
    ], underspecifiedSquatContext);

    expect([...projection.versionSummaries.keys()]).toEqual(["movement:squat"]);
    expect(projection.versionSummaries.get("movement:squat")).toMatchObject({
      sessionCount: 3,
      entryCount: 3,
      sessionVolumesLb: [1500, 1525, 1550],
      bestSetLabel: "310x5",
    });
    // The family was never split, so this is a narrowing of the version key
    // only.
    expect([...projection.familySummaries.keys()]).toEqual(["squat"]);
  });

  it("keys an underspecified identity by its movement, unqualified", () => {
    const identity = resolveExerciseIdentity(
      { kind: "stored-exercise", slotId: "slot-squat", performedName: "Squats" },
      underspecifiedSquatContext,
    );
    expect(identity).toMatchObject({ movementId: "squat", concreteExerciseId: undefined });
    expect(versionKeyForIdentity(identity)).toBe("movement:squat");
    expect(familyKeyForIdentity(identity)).toBe("squat");
  });
});
