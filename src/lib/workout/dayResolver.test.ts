import { resolveNextDay } from "./dayResolver";
import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

function day(id: string, dayNumber: number, weekNumber?: number): ProgramDay {
  return { id, dayNumber, weekNumber, title: `Day ${dayNumber}`, sections: [] };
}

function log(dayId: string, performedAt: string): WorkoutLogDocument {
  return { id: `log-${dayId}`, programId: "p1", dayId, performedAt, entries: [] };
}

describe("resolveNextDay", () => {
  const days = [day("d1", 1, 1), day("d2", 2, 1), day("d3", 3, 1), day("d4", 1, 2)];

  it("returns undefined when there are no days", () => {
    expect(resolveNextDay([], [], "2026-05-18")).toBeUndefined();
  });

  it("returns days[0] for a first-time user (no logs)", () => {
    expect(resolveNextDay(days, [], "2026-05-18")?.id).toBe("d1");
  });

  it("returns the day with a log dated today (resume in-progress)", () => {
    const logs = [log("d2", "2026-05-18T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("advances to the next day after the most recent log", () => {
    const logs = [log("d1", "2026-05-17T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("crosses week boundaries (d3 → d4)", () => {
    const logs = [log("d3", "2026-05-17T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d4");
  });

  it("wraps from last day back to first", () => {
    const logs = [log("d4", "2026-05-17T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });

  it("ignores logs whose dayId no longer exists in the program", () => {
    const logs = [
      log("removed-day", "2026-05-17T10:00:00.000Z"),
      log("d2", "2026-05-16T09:00:00.000Z"),
    ];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d3");
  });

  it("starts at days[0] when every prior log references a removed day", () => {
    const logs = [log("removed-day", "2026-05-17T10:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });

  it("treats today's log on a removed day as 'start at days[0]'", () => {
    const logs = [log("removed-day", "2026-05-18T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });
});
