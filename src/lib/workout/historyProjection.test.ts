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
import { aggregateExerciseHistory } from "./historyUtils";

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

  it("still reports an unreadable-sets entry as data-bearing to the drawer path", () => {
    const rows = aggregateExerciseHistory(
      [logWith("corrupt")],
      "slot-b",
      bench.id,
    );
    expect(rows).toEqual([{ date: "2026-09-01", sets: [], note: undefined, volume: 0 }]);
  });
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

  it("returns the same order for every input permutation", () => {
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

  it("keeps the drawer path readable too", () => {
    const rows = aggregateExerciseHistory(
      [withEntries("corrupt"), goodLog] as WorkoutLogDocument[],
      "slot",
      highBar.id,
    );
    expect(rows).toEqual([{ date: "2026-11-01", sets: ["405x1"], note: undefined, volume: 405 }]);
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
