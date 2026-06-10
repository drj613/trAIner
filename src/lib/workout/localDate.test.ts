import { localDateString, localDateOf, sessionLogId } from "./localDate";

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
