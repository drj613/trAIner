/**
 * Randomized differential check of the projection's first invariant.
 *
 * Hand fixtures pin the cases someone thought of. This re-derives the
 * data-bearing set independently of the projection over 300 seeded random
 * corpora — colliding instants, non-string log ids and timestamps, unreadable
 * entries, unreadable sets, unreadable set fields, unreadable weights and reps —
 * and asserts that every one of them becomes exactly one row, in exactly one
 * family bucket and one version bucket, with volumes that add up and stay finite.
 *
 * The seed is fixed, so this cannot flake.
 *
 * Proven non-vacuous — it fails under each of:
 *   - deleting `logIdOrder` from `compareRowsChronologically` (sessionCount 4 vs 2)
 *   - `logIdOrder` calling `localeCompare` on a raw `logId` (throws)
 *   - `setNumberField` returning the stored value unguarded (a NaN volume total)
 *
 * Log ids are unique per corpus on purpose. Two DISTINCT logs sharing one id is
 * out of contract: `logId#entryIndex` stops identifying a row, and if their
 * instants differ the session bucketing reports one workout as several. That is
 * the reviewer's A6, still open, and Task 13's note 9.
 */
import { projectExerciseHistory } from "./historyProjection";
import { makeHistoryProjectionFixture, bench, lowBar } from "./historyProjection.testFixtures";
import { highBar } from "@/lib/catalog/identity.testFixtures";
import { readableEntries, readableSets, setHasData, entryNote } from "./historyUtils";
import type { WorkoutLogDocument } from "@/lib/programs/types";

const { context } = makeHistoryProjectionFixture();

let seed = 20260819;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

const instants = ["2026-06-01T14:00:00.000Z", "2026-06-01T14:00:00.000Z", "not a date", "May 1 2026", 42, "2026-07-02T09:00:00.000Z"];
const ids = ["a", "b", 1, 2, "c"];
const canon = [highBar.id, lowBar.id, bench.id, undefined, "unknown-id"];
const entryShapes = (): unknown => pick<unknown>([
  null,
  "corrupt",
  { exerciseId: "s", sets: [] },
  { exerciseId: "s", sets: undefined },
  { exerciseId: "s", sets: "corrupt" },
  { exerciseId: "s", sets: [null] },
  { exerciseId: "s", notes: "note only" },
  { exerciseId: "s", notes: 7, sets: [{ setNumber: 1, rawCell: 7 }] },
  { exerciseId: "s", exerciseName: pick(["Squat", "Squats", 7, undefined]), canonicalExerciseId: pick(canon), sets: [{ setNumber: 1, weight: pick([100, {}, "60"]), reps: pick([5, {}]) }] },
  { exerciseId: 7, sets: [{ setNumber: 1, weight: 100, reps: 5, notes: {} }] },
]);

// Expected data-bearing set, computed independently of the module under test.
const expectedIdentities = (logs: WorkoutLogDocument[]): string[] => {
  const out: string[] = [];
  for (const log of logs) {
    for (const { entry, entryIndex } of readableEntries(log)) {
      const sets = entry.sets as unknown;
      const setsUnreadable = sets === undefined || sets === null
        ? false
        : !Array.isArray(sets) || (sets as unknown[]).some((s) => s === null || typeof s !== "object" || Array.isArray(s));
      const bearing = setsUnreadable
        || readableSets(entry).some(setHasData)
        || Boolean(entryNote(entry)?.trim());
      if (bearing) out.push(`${String(log.id)}#${entryIndex}`);
    }
  }
  return out.sort();
};

test("300 randomized corpora stay lossless", () => {
  let nonTrivial = 0;
  for (let n = 0; n < 300; n += 1) {
    const logs: WorkoutLogDocument[] = [];
    const logCount = 1 + Math.floor(rnd() * 5);
    for (let i = 0; i < logCount; i += 1) {
      const entryCount = Math.floor(rnd() * 4);
      logs.push({
        id: ids[i], programId: "p1", dayId: "d1",
        performedAt: pick(instants),
        entries: Array.from({ length: entryCount }, entryShapes),
      } as unknown as WorkoutLogDocument);
    }
    const expected = expectedIdentities(logs);
    if (expected.length > 0) nonTrivial += 1;
    const p = projectExerciseHistory(logs, context);

    const actual = p.rows.map((r) => `${String(r.logId)}#${r.entryIndex}`).sort();
    expect(actual).toEqual(expected);

    // Each row lands in exactly one family bucket and one version bucket.
    const fam = [...p.rowsByFamilyKey.values()].flat().map((r) => `${String(r.logId)}#${r.entryIndex}`).sort();
    const ver = [...p.rowsByVersionKey.values()].flat().map((r) => `${String(r.logId)}#${r.entryIndex}`).sort();
    expect(fam).toEqual(expected);
    expect(ver).toEqual(expected);

    let entrySum = 0;
    for (const [key, summary] of p.versionSummaries) {
      entrySum += summary.entryCount;
      const rows = p.rowsByVersionKey.get(key)!;
      expect(summary.sessionCount).toBe(new Set(rows.map((r) => String(r.logId))).size);
      expect(summary.sessionVolumesLb).toHaveLength(summary.sessionCount);
      const rowTotal = rows.reduce((a, r) => a + r.volumeLb, 0);
      expect(summary.sessionVolumesLb.reduce((a, b) => a + b, 0)).toBeCloseTo(rowTotal, 6);
      expect(Number.isFinite(rowTotal)).toBe(true);
    }
    expect(entrySum).toBe(p.rows.length);

    for (const [key, summary] of p.familySummaries) {
      const rows = p.rowsByFamilyKey.get(key)!;
      expect(summary.workoutCount).toBe(new Set(rows.map((r) => String(r.logId))).size);
    }
  }
  // Non-vacuity canary: the corpora actually produced rows.
  expect(nonTrivial).toBeGreaterThan(250);
});
