import { localDateString, localDateOf, logLocalDate, sessionLogId } from "./localDate";

// jest.config.js pins TZ=America/New_York (UTC-4 in summer, UTC-5 in winter)
// so local-vs-UTC calendar-date boundaries are exercised deterministically.

describe("localDateOf", () => {
  it("returns the previous local date for a UTC timestamp after local midnight", () => {
    // 2026-06-11T03:30Z is 2026-06-10 23:30 EDT
    expect(localDateOf("2026-06-11T03:30:00.000Z")).toBe("2026-06-10");
  });

  it("returns the same calendar date when no boundary is crossed", () => {
    expect(localDateOf("2026-06-10T15:00:00.000Z")).toBe("2026-06-10");
  });

  it("handles standard time (EST, UTC-5)", () => {
    expect(localDateOf("2026-01-01T04:59:00.000Z")).toBe("2025-12-31");
  });
});

describe("localDateString", () => {
  it("formats the local calendar date of the given Date", () => {
    expect(localDateString(new Date("2026-06-11T03:30:00.000Z"))).toBe("2026-06-10");
  });

  it("defaults to now", () => {
    expect(localDateString()).toBe(localDateString(new Date()));
  });
});

describe("sessionLogId", () => {
  it("is deterministic for the same (program, day, date)", () => {
    expect(sessionLogId("p1", "d1", "2026-06-10")).toBe(
      sessionLogId("p1", "d1", "2026-06-10"),
    );
  });

  it("differs across programs, days, and dates", () => {
    const base = sessionLogId("p1", "d1", "2026-06-10");
    expect(sessionLogId("p2", "d1", "2026-06-10")).not.toBe(base);
    expect(sessionLogId("p1", "d2", "2026-06-10")).not.toBe(base);
    expect(sessionLogId("p1", "d1", "2026-06-11")).not.toBe(base);
  });
});

/**
 * The guard that closed Task 12's C-1, tested where it lives.
 *
 * `src/lib/storage/appDb.ts:186-195` preserves a log whose fields it cannot
 * read, so a non-string `performedDate` reaches every history surface despite
 * the declared type. It used to pass straight through: the Today drawer's
 * aggregator sorted on `b.date.localeCompare(a.date)` and threw, which made the
 * drawer an inert tap for *every* exercise, and `HistoryDrawer` threw again on
 * `localYmd.split` at render with no error boundary above it.
 *
 * This block used to be driven through `aggregateExerciseHistory`, which Task 13
 * deleted along with the surface that called it. The rule is unchanged and is
 * still pinned at three levels: here on the value, on the projection
 * (`historyProjection.test.ts`), and through the rendered drawer and all-time
 * page.
 *
 * The absent-vs-unreadable line is the settled one (`unreadableValue`,
 * `src/lib/storage/migrations/v10Identity.ts:158`): absent means the date was
 * never stamped and `performedAt` answers instead; a present non-string is
 * unreadable and must not remove another workout's history from view.
 */
describe("logLocalDate — an unreadable performedDate falls back rather than propagating", () => {
  const unreadable: [string, unknown][] = [
    ["a number", 7],
    ["an object", {}],
    ["a boolean", true],
    ["an array", []],
    ["an array holding null", [null]],
  ];

  it.each(unreadable)("falls back to performedAt when performedDate is %s", (_label, bad) => {
    const date = logLocalDate(
      { performedAt: "2026-04-16T09:00:00.000Z", performedDate: bad } as unknown as
        Parameters<typeof logLocalDate>[0],
    );
    expect(date).toBe("2026-04-16");
  });

  it.each(unreadable)("always answers with a string (%s)", (_label, bad) => {
    const date = logLocalDate(
      { performedAt: 7, performedDate: bad } as unknown as Parameters<typeof logLocalDate>[0],
    );
    expect(typeof date).toBe("string");
    // No date to report, and `new Date(7)` would have been a confident lie.
    expect(date).toBe("");
  });

  it("still prefers an explicit readable performedDate", () => {
    expect(logLocalDate({ performedAt: "2026-05-02T02:00:00.000Z", performedDate: "2026-05-01" }))
      .toBe("2026-05-01");
  });

  it.each([["undefined", undefined], ["null", null]])(
    "treats an absent performedDate (%s) as never stamped, not as unreadable",
    (_label, absent) => {
      expect(logLocalDate(
        { performedAt: "2026-05-02T02:00:00.000Z", performedDate: absent } as unknown as
          Parameters<typeof logLocalDate>[0],
      )).toBe("2026-05-01");
    },
  );
});
