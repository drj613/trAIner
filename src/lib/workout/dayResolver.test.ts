import { resolveNextDay } from "./dayResolver";
import type { ProgramDay, WorkoutLogDocument } from "@/lib/programs/types";

function day(id: string, dayNumber: number, weekNumber?: number): ProgramDay {
  return { id, dayNumber, weekNumber, title: `Day ${dayNumber}`, sections: [] };
}

function log(
  dayId: string,
  performedAt: string,
  completedAt?: string,
): WorkoutLogDocument {
  return { id: `log-${dayId}-${performedAt}`, programId: "p1", dayId, performedAt, completedAt, entries: [] };
}

describe("resolveNextDay", () => {
  const days = [day("d1", 1, 1), day("d2", 2, 1), day("d3", 3, 1), day("d4", 1, 2)];

  it("returns undefined when there are no days", () => {
    expect(resolveNextDay([], [], "2026-05-18")).toBeUndefined();
  });

  it("returns days[0] for a first-time user (no logs)", () => {
    expect(resolveNextDay(days, [], "2026-05-18")?.id).toBe("d1");
  });

  it("resumes the in-progress day (autosaved log without completedAt)", () => {
    // d1 completed yesterday, d2 has an autosave-only log today.
    // Next completed should be d1 → resolver returns d2 (the in-progress one).
    const logs = [
      log("d1", "2026-05-17T09:00:00.000Z", "2026-05-17T10:00:00.000Z"),
      log("d2", "2026-05-18T09:00:00.000Z"), // no completedAt
    ];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("advances past a day completed earlier today", () => {
    // The bug: finishing day 1 today should not park the user on day 1.
    const logs = [log("d1", "2026-05-18T09:00:00.000Z", "2026-05-18T09:30:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("advances to the next day after the most recent completed log", () => {
    const logs = [log("d1", "2026-05-17T09:00:00.000Z", "2026-05-17T10:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("ignores in-progress (autosave-only) logs when picking the most recent", () => {
    // d2 has an in-progress log dated AFTER d1's completion. Resolver should
    // still advance from d1 (the latest completed), returning d2 to resume.
    const logs = [
      log("d1", "2026-05-16T09:00:00.000Z", "2026-05-16T10:00:00.000Z"),
      log("d2", "2026-05-17T09:00:00.000Z"),
    ];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d2");
  });

  it("crosses week boundaries (d3 → d4)", () => {
    const logs = [log("d3", "2026-05-17T09:00:00.000Z", "2026-05-17T10:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d4");
  });

  it("wraps from last day back to first", () => {
    const logs = [log("d4", "2026-05-17T09:00:00.000Z", "2026-05-17T10:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });

  it("ignores completed logs whose dayId no longer exists in the program", () => {
    const logs = [
      log("removed-day", "2026-05-17T10:00:00.000Z", "2026-05-17T11:00:00.000Z"),
      log("d2", "2026-05-16T09:00:00.000Z", "2026-05-16T10:00:00.000Z"),
    ];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d3");
  });

  it("starts at days[0] when every prior completed log references a removed day", () => {
    const logs = [log("removed-day", "2026-05-17T10:00:00.000Z", "2026-05-17T11:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });

  it("starts at days[0] when only in-progress logs exist", () => {
    const logs = [log("d2", "2026-05-18T09:00:00.000Z")];
    expect(resolveNextDay(days, logs, "2026-05-18")?.id).toBe("d1");
  });
});
