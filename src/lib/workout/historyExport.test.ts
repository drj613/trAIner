import { makeIdentityContext } from "@/lib/catalog/identity.testFixtures";
import type { ExerciseIdentityContext } from "@/lib/catalog/identity";
import type { ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";
import { buildHistoryExport, historyRoutineOptions } from "./historyExport";

const context: ExerciseIdentityContext = makeIdentityContext();

function program(id: string, title: string, days: ProgramDocument["days"] = []): ProgramDocument {
  return {
    id, title, source: "manual", active: true, days, overrides: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

function log(overrides: Partial<WorkoutLogDocument> = {}): WorkoutLogDocument {
  return {
    id: "log-1", programId: "p1", dayId: "d1", performedAt: "2026-10-21T12:00:00.000Z",
    performedDate: "2026-10-21", completedAt: "2026-10-21T13:00:00.000Z", entries: [], ...overrides,
  };
}

function build(
  logs: readonly WorkoutLogDocument[],
  programs: readonly ProgramDocument[] = [program("p1", "Upper/Lower")],
  selection: { routine: { kind: "all" } | { kind: "one"; programId: string }; from?: string; through?: string } = { routine: { kind: "all" } },
) {
  return buildHistoryExport({ logs, programs, context, selection });
}

function textOf(logs: readonly WorkoutLogDocument[], programs?: readonly ProgramDocument[], selection?: Parameters<typeof build>[2]): string {
  const result = build(logs, programs, selection);
  if (!result.ok) throw new Error(result.message);
  return result.text;
}

describe("history export", () => {
  it("renders exact stable output with quoted routine, day and exercise names", () => {
    const result = build([
      log({
        completedAt: "2026-10-21T13:00:00.000Z",
        prescriptionSnapshot: { id: "d1", dayNumber: 1, title: "Upper A", sections: [] },
        entries: [{ exerciseId: "slot-secret", exerciseName: "Bench press", sets: [{ setNumber: 1, weight: 185, reps: 8, rpe: 8 }] }],
      }),
    ]);
    expect(result).toEqual({
      ok: true,
      text: 'trAIner workout history v1\nscope: all routines\ndates: all; local, inclusive\nsessions: 1; entries: 1; sets: 1; warnings: 0; excluded-undated: 0\nsets: #number weight-unit x reps @RPE; ?=unrecorded; quoted text=recorded text\n\n2026-10-21 | routine:"Upper/Lower" | day:"Upper A" | completed\n"Bench press": #1 185lbx8 @8\n',
      fileName: "trAIner-history-all-all.txt",
      summary: { sessions: 1, entries: 1, sets: 1, warnings: 0, excludedUndated: 0 },
      canExport: true,
    });
  });

  it("offers ID-sorted routines, labels deleted and duplicate-title routines, and filters one routine", () => {
    const programs = [program("p2", "Same"), program("p1", "Same")];
    const logs = [log({ id: "a", programId: "gone" }), log({ id: "b", programId: "p2" })];
    expect(historyRoutineOptions(logs, programs)).toEqual([
      { value: "gone", label: "Unavailable routine 1" },
      { value: "p1", label: "Same (1)" },
      { value: "p2", label: "Same (2)" },
    ]);
    const all = textOf(logs, programs);
    expect(all).toContain('routine:"Unavailable routine 1"');
    expect(all).toContain('routine:"Same (2)"');
    expect(all).not.toContain("programId");
    const selected = build(logs, programs, { routine: { kind: "one", programId: "p2" } });
    expect(selected.ok && selected.summary.sessions).toBe(1);
    if (selected.ok) expect(selected.text).toContain('scope: "Same (2)"');
    expect(build(logs, programs, { routine: { kind: "one", programId: "unknown" } })).toMatchObject({ ok: false, field: "routine" });
  });

  it("omits blank or malformed routine IDs from options while preserving exact valid IDs", () => {
    const malformedLogs = [
      log({ id: "number-id", programId: 42 as unknown as string }),
      log({ id: "blank-id", programId: "" }),
      log({ id: "space-id", programId: "   " }),
      log({ id: "missing-id", programId: undefined as unknown as string }),
      log({ id: "object-id", programId: { secret: "DO_NOT_LEAK" } as unknown as string }),
      log({ id: "valid-id", programId: " gone " }),
    ];
    const malformedPrograms = [
      program("", "Blank program"),
      program("   ", "Whitespace program"),
      program("gone", "Malformed id program"),
      { ...program("valid-program", "Valid"), id: 42 as unknown as string },
    ];

    expect(historyRoutineOptions(malformedLogs, malformedPrograms)).toEqual([
      { value: " gone ", label: "Unavailable routine 1" },
      { value: "gone", label: "Malformed id program" },
    ]);
    expect(historyRoutineOptions([], [program("", "Blank"), program("   ", "Whitespace")])).toEqual([]);
  });

  it("keeps unreadable routine identities distinct and excludes them with a warning when filtered", () => {
    const logs = [
      log({ id: "bad-number", programId: 42 as unknown as string, notes: "unknown id" }),
      log({ id: "bad-blank", programId: "   ", notes: "blank id" }),
      log({ id: "bad-missing", programId: undefined as unknown as string, notes: "missing id" }),
      log({ id: "bad-object", programId: { secret: "DO_NOT_LEAK" } as unknown as string, notes: "object id" }),
      log({ id: "gone", programId: "gone", notes: "deleted routine" }),
    ];
    const all = build(logs, []);
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.summary).toMatchObject({ sessions: 5, warnings: 4 });
      expect((all.text.match(/routine:"Unknown routine"/g) ?? [])).toHaveLength(4);
      expect(all.text).toContain("!unreadable-routine");
      expect(all.text).toContain('routine:"Unavailable routine 1"');
      expect(all.text).not.toContain('routine:"Unavailable routine 2"');
      expect(all.text).not.toContain("DO_NOT_LEAK");
    }

    const selected = build(logs, [], { routine: { kind: "one", programId: "gone" } });
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.summary).toMatchObject({ sessions: 1, warnings: 4 });
      expect(selected.text).toContain('scope: "Unavailable routine 1"');
      expect(selected.text).toContain('routine:"Unavailable routine 1"');
      expect(selected.text).toContain("notice: 4 unreadable sessions were excluded by filtering");
      expect(selected.text).not.toContain("unknown id");
      expect(selected.text).not.toContain("blank id");
      expect(selected.text).not.toContain("missing id");
      expect(selected.text).not.toContain("object id");
    }
  });

  it("uses the same labels for multiple deleted routines and selected deleted history", () => {
    const logs = [
      log({ id: "gone-b", programId: "gone-b" }),
      log({ id: "gone-a", programId: "gone-a" }),
    ];
    const all = build(logs, [], { routine: { kind: "all" } });
    expect(all.ok && all.text).toContain('routine:"Unavailable routine 1"');
    expect(all.ok && all.text).toContain('routine:"Unavailable routine 2"');
    const selected = build(logs, [], { routine: { kind: "one", programId: "gone-b" } });
    expect(selected.ok && selected.text).toContain('scope: "Unavailable routine 2"');
    expect(selected.ok && selected.text).toContain('routine:"Unavailable routine 2"');
  });

  it("uses the global routine labels for deleted routines and duplicate titles", () => {
    const programs = [program("p2", "Same"), program("p1", "Same")];
    const logs = [log({ id: "gone-a", programId: "gone-a" }), log({ id: "gone-b", programId: "gone-b" }),
      log({ id: "p1", programId: "p1" }), log({ id: "p2", programId: "p2" })];
    const all = build(logs, programs);
    expect(all.ok && all.text).toContain('routine:"Unavailable routine 2"');
    expect(all.ok && all.text).toContain('routine:"Same (2)"');
    const selected = build(logs, programs, { routine: { kind: "one", programId: "gone-b" } });
    expect(selected.ok && selected.text).toContain('scope: "Unavailable routine 2"');
    expect(selected.ok && selected.text).toContain('routine:"Unavailable routine 2"');
  });

  it("validates calendar bounds and applies inclusive one-sided ranges", () => {
    const logs = ["20", "21", "22"].map((day) => log({ id: day, performedDate: `2026-10-${day}` }));
    const range = build(logs, undefined, { routine: { kind: "all" }, from: "2026-10-21", through: "2026-10-21" });
    expect(range.ok && range.summary.sessions).toBe(1);
    expect(build(logs, undefined, { routine: { kind: "all" }, from: "2026-02-29" })).toMatchObject({ ok: false, field: "from" });
    expect(build(logs, undefined, { routine: { kind: "all" }, from: "2026-10-22", through: "2026-10-21" })).toMatchObject({ ok: false, field: "through" });
    expect(build(logs, undefined, { routine: { kind: "all" }, through: "not-a-date" })).toMatchObject({ ok: false, field: "through" });
    expect(build(logs, undefined, { routine: { kind: "all" }, from: "2024-02-29" })).toMatchObject({ ok: true });
    const fromOnly = build(logs, undefined, { routine: { kind: "all" }, from: "2026-10-21" });
    const throughOnly = build(logs, undefined, { routine: { kind: "all" }, through: "2026-10-21" });
    expect(fromOnly.ok && fromOnly.summary.sessions).toBe(2);
    expect(throughOnly.ok && throughOnly.summary.sessions).toBe(2);
  });

  it("uses local performedDate and the legacy logLocalDate fallback", () => {
    const logs = [
      log({ id: "utc-differs", performedAt: "2026-10-22T01:00:00.000Z", performedDate: "2026-10-20" }),
      log({ id: "legacy", performedAt: "2026-10-21T01:00:00.000Z", performedDate: undefined }),
    ];
    const result = build(logs, undefined, { routine: { kind: "all" }, from: "2026-10-20", through: "2026-10-21" });
    expect(result.ok && result.summary.sessions).toBe(2);
    if (result.ok) expect(result.text).toContain("2026-10-20 | routine:");
  });

  it("sorts unknown dates last without bounds and excludes them with bounded metadata", () => {
    const source = [log({ id: "unknown", performedDate: "bad-date" }), log({ id: "known", performedDate: "2026-10-20" })];
    const before = structuredClone(source);
    const unbounded = textOf(source);
    expect(unbounded.indexOf("2026-10-20")).toBeLessThan(unbounded.indexOf("date-unknown"));
    const bounded = build(source, undefined, { routine: { kind: "all" }, from: "2026-10-20" });
    expect(bounded.ok && bounded.summary.excludedUndated).toBe(1);
    if (bounded.ok) expect(bounded.text).toContain("excluded-undated: 1");
    expect(source).toEqual(before);
  });

  it("keeps filtered exclusion-only warnings in the header and enables the export", () => {
    const result = build([null as unknown as WorkoutLogDocument, log({ id: "undated", performedDate: "bad-date" })], undefined, {
      routine: { kind: "all" }, from: "2026-10-01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toMatchObject({ sessions: 0, warnings: 2, excludedUndated: 1 });
      expect(result.canExport).toBe(true);
      expect(result.text).toContain("sessions: 0; entries: 0; sets: 0; warnings: 2; excluded-undated: 1");
      expect(result.text).toContain("notice: 1 unreadable session was excluded by filtering");
    }
  });

  it("uses deterministic file names and inclusive one-sided date headers", () => {
    const logs = [log({ performedDate: "2026-10-21" })];
    const from = build(logs, undefined, { routine: { kind: "one", programId: "p1" }, from: "2026-10-21" });
    const through = build(logs, undefined, { routine: { kind: "all" }, through: "2026-10-21" });
    expect(from.ok && from.fileName).toBe("trAIner-history-routine-2026-10-21_end.txt");
    expect(from.ok && from.text).toContain("dates: 2026-10-21..*; local, inclusive");
    expect(through.ok && through.fileName).toBe("trAIner-history-all-start_2026-10-21.txt");
    expect(through.ok && through.text).toContain("dates: *..2026-10-21; local, inclusive");
  });

  it("preserves repeated entries, sparse set numbers, and independent raw/numeric observations", () => {
    const result = build([log({ entries: [
      { exerciseId: "slot-1", exerciseName: "Press", sets: [
        { setNumber: 1, weight: 0, reps: 0, unit: "kg", rpe: 7, rawCell: "slow; rep", notes: "note\nnext" },
        { setNumber: 3, reps: 8 }, { setNumber: 4, rpe: 8 }, { setNumber: 5, notes: "only note" }, { setNumber: 1 },
      ] },
      { exerciseId: "slot-2", exerciseName: "Press", sets: [{ setNumber: 1, weight: 185, reps: 8 }] },
    ] })]);
    expect(result.ok && result.summary).toMatchObject({ entries: 2, sets: 5 });
    if (result.ok) {
      expect(result.text).toContain('#1 0kgx0 @7 raw:"slow; rep" note:"note\\nnext"');
      expect(result.text).toContain("#3 ?x8");
      expect(result.text).toContain("#4 @8");
      expect(result.text).toContain('#5 note:"only note"');
      expect((result.text.match(/"Press":/g) ?? []).length).toBe(2);
      expect(result.text).not.toContain("#2");
    }
  });

  it("keeps all session notes, snapshot day title and completed/skipped empty sessions", () => {
    const programs = [program("p1", "Current", [{ id: "d1", dayNumber: 1, title: "Current day", sections: [] }])];
    const result = build([
      log({ id: "done", completedAt: "2026-10-21T13:00:00Z", notes: "session", dayNote: "day", prescriptionSnapshot: { id: "d1", dayNumber: 1, title: "Snapshot", sections: [] } }),
      log({ id: "skip", completedAt: undefined, skippedAt: "2026-10-21T13:00:00Z", skipReason: "busy", entries: [] }),
      log({ id: "empty", completedAt: undefined, performedDate: "2026-10-22", entries: [] }),
      log({ id: "conflict", completedAt: "2026-10-21T13:00:00Z", skippedAt: "2026-10-21T13:01:00Z", entries: [] }),
    ], programs);
    expect(result.ok && result.summary.sessions).toBe(3);
    if (result.ok) {
      expect(result.text).toContain('day:"Snapshot" | completed');
      expect(result.text).toContain('session-note:"session"');
      expect(result.text).toContain('day-note:"day"');
      expect(result.text).toContain('skip-reason:"busy"');
      expect(result.text).toContain("| conflicting-status");
      expect(result.text).not.toContain("| !conflicting-status");
      expect(result.summary.warnings).toBe(1);
      expect(result.text).not.toContain("| day:\"Current day\" | in-progress");
    }
  });

  it("treats blank status markers as absent and marks malformed nonblank status values", () => {
    const logs = [
      log({ id: "empty", completedAt: "", skippedAt: null as unknown as string, entries: [] }),
      log({ id: "space", completedAt: "   ", skippedAt: null as unknown as string, entries: [] }),
      log({ id: "bad-string", completedAt: "not a timestamp", skippedAt: undefined, entries: [] }),
      log({ id: "bad-completed", completedAt: {} as unknown as string, skippedAt: undefined, entries: [] }),
      log({ id: "bad-skipped", completedAt: undefined, skippedAt: 0 as unknown as string, entries: [] }),
      log({ id: "both-valid", completedAt: "2026-10-21T13:00:00Z", skippedAt: "2026-10-21T14:00:00Z", entries: [] }),
    ];
    const result = build(logs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.sessions).toBe(4);
      expect(result.summary.warnings).toBe(4);
      expect(result.text).toContain("| in-progress");
      expect(result.text).toContain("!unreadable-completed-at");
      expect(result.text).toContain("!unreadable-skipped-at");
      expect(result.text).toContain("| conflicting-status");
    }
  });

  it("uses the effective current day title and falls back when no matching day exists", () => {
    const baseDay = { id: "d1", dayNumber: 1, title: "Base day", sections: [] };
    const overridden = program("p1", "Routine", [baseDay]);
    overridden.overrides = [{
      id: "override-1", scope: "day", programId: "p1", dayId: "d1",
      replacement: { ...baseDay, title: "Current edited day" }, createdAt: "2026-01-01",
    }];
    const result = build([
      log({ id: "edited", completedAt: undefined, entries: [{ exerciseId: "slot", exerciseName: "Lift", sets: [{ setNumber: 1, reps: 5 }] }] }),
      log({ id: "missing-day", completedAt: "2026-10-21T13:00:00Z", dayId: "gone", entries: [] }),
    ], [overridden]);
    expect(result.ok && result.text).toContain('day:"Current edited day"');
    expect(result.ok && result.text).toContain('day:"Unavailable day"');
  });

  it("omits blank set text and renders entry notes on their own indented line", () => {
    const result = build([log({
      completedAt: undefined,
      entries: [
        { exerciseId: "slot-note", exerciseName: "Note only", sets: [], notes: "entry note" },
        { exerciseId: "slot-blank", exerciseName: "Blank", sets: [{ setNumber: 1, rawCell: "", notes: "  " }] },
      ],
    })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toMatchObject({ sessions: 1, entries: 1, sets: 0 });
      expect(result.text).toContain('"Note only":\n  entry-note:"entry note"');
      expect(result.text).not.toContain('"Blank"');
    }
  });

  it("quotes user strings and omits IDs, profile and prescription-only fields", () => {
    const result = build([log({
      notes: 'quote " and |\nnew line',
      entries: [{ exerciseId: "SECRET-SLOT", exerciseName: "Line\nname | \"quoted\"", sets: [{ setNumber: 1, weight: 10, reps: 2 }] }],
      prescriptionSnapshot: { id: "SNAPSHOT-ID", dayNumber: 1, title: "Day", sections: [] },
    })], [program("p1", "Routine", [])]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('"Line\\nname | \\"quoted\\""');
      expect(result.text).toContain('session-note:"quote \\" and |\\nnew line"');
      expect(result.text).not.toContain("SECRET-SLOT");
      expect(result.text).not.toContain("SNAPSHOT-ID");
      expect(result.text).not.toContain("profile");
    }
  });

  it("emits safe markers and warning counts for corrupt records without leaking values", () => {
    const malformedEntry = {
      exerciseId: "safe-slot", exerciseName: "Lift",
      sets: [
        { setNumber: 0, weight: { private: "DO_NOT_LEAK" }, reps: "5", unit: "stones", rawCell: 7, notes: [] },
        null,
      ],
    } as unknown as WorkoutLogDocument["entries"][number];
    const corrupted = log({ entries: [malformedEntry] });
    (corrupted as unknown as { entries: unknown }).entries = [null, { exerciseId: "broken", sets: "bad" }];
    (corrupted as unknown as { unreadableEntries: unknown }).unreadableEntries = { secret: "DO_NOT_LEAK" };
    const result = build([corrupted]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("!unreadable-entry");
      expect(result.text).toContain("!unreadable-entries");
      expect(result.text).not.toContain("DO_NOT_LEAK");
      expect(result.summary.warnings).toBeGreaterThanOrEqual(2);
    }
  });

  it("marks malformed set fields and containers one warning per emitted marker", () => {
    const malformedEntry = {
      exerciseId: "slot", exerciseName: "Lift",
      sets: [
        { setNumber: 0, weight: { private: "DO_NOT_LEAK" }, reps: "5", unit: "stones", rawCell: 7, notes: [] },
        { setNumber: 2, weight: 10, reps: 4, unit: "stones" },
        null,
      ],
    } as unknown as WorkoutLogDocument["entries"][number];
    const result = build([log({ entries: [malformedEntry] })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("!unreadable-set-number");
      expect(result.text).toContain("!unreadable-weight");
      expect(result.text).toContain("!unreadable-reps");
      expect(result.text).toContain("!unreadable-unit");
      expect(result.text).toContain("?unit");
      expect(result.text).toContain("!unreadable-raw-cell");
      expect(result.text).toContain("!unreadable-set-note");
      expect(result.text).toContain("!unreadable-set");
      expect(result.text).not.toContain("DO_NOT_LEAK");
      expect(result.summary.warnings).toBe(8);
      expect(result.summary.sets).toBe(2);
    }
  });

  it("preserves a performed name alongside a corrected version label and never prints a slot ID", () => {
    const contextWithIdentity = makeIdentityContext({
      catalogById: new Map([["bench", { id: "bench", name: "Current Bench", aliases: [], equipment: [], movementPatterns: [], muscles: { primary: [], secondary: [] }, tags: [], movementModifierIds: [] }]]),
    });
    const result = buildHistoryExport({
      logs: [log({ entries: [
        { exerciseId: "slot-secret", canonicalExerciseId: "bench", exerciseName: "Performed bench", sets: [{ setNumber: 1, reps: 5 }] },
        { exerciseId: "another-secret", sets: [{ setNumber: 1, reps: 3 }] },
      ] })], programs: [program("p1", "Routine")], context: contextWithIdentity, selection: { routine: { kind: "all" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('"Performed bench" (version:"Current Bench")');
      expect(result.text).toContain('"Unnamed exercise"');
      expect(result.text).not.toContain("slot-secret");
      expect(result.text).not.toContain("another-secret");
    }
  });

  it("disables truly empty exports but keeps warning-only exports available", () => {
    const empty = build([]);
    expect(empty.ok && empty.canExport).toBe(false);
    if (empty.ok) expect(empty.text).toBe([
      "trAIner workout history v1",
      "scope: all routines",
      "dates: all; local, inclusive",
      "sessions: 0; entries: 0; sets: 0; warnings: 0; excluded-undated: 0",
      "sets: #number weight-unit x reps @RPE; ?=unrecorded; quoted text=recorded text",
      "",
      "No workouts in this range",
      "",
    ].join("\n"));
    const malformed = log({ entries: [] });
    (malformed as unknown as { entries: unknown }).entries = "unreadable";
    const warning = build([malformed]);
    expect(warning.ok && warning.canExport).toBe(true);
    expect(warning.ok && warning.summary.warnings).toBeGreaterThan(0);
    const excluded = build([log({ performedDate: "invalid" })], undefined, { routine: { kind: "all" }, from: "2026-10-01" });
    expect(excluded.ok && excluded.summary.sessions).toBe(0);
    expect(excluded.ok && excluded.canExport).toBe(true);
    const unreadable = build([null as unknown as WorkoutLogDocument]);
    expect(unreadable.ok && unreadable.summary.sessions).toBe(0);
    expect(unreadable.ok && unreadable.canExport).toBe(true);
    if (unreadable.ok) expect(unreadable.text).toContain("!unreadable-session");
  });

  it("uses code-unit ordering for IDs and stable session tie breakers", () => {
    const logs = [
      log({ id: "a", performedAt: "2026-10-21T12:00:00.000Z", notes: "last input" }),
      log({ id: "A", performedAt: "2026-10-21T12:00:00.000Z", notes: "uppercase" }),
      log({ id: "!", performedAt: "2026-10-21T11:00:00.000Z", notes: "earlier" }),
      log({ id: "a", performedAt: "2026-10-21T12:00:00.000Z", notes: "first same id" }),
    ];
    const result = build(logs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.indexOf('session-note:"earlier"')).toBeLessThan(result.text.indexOf('session-note:"uppercase"'));
      expect(result.text.indexOf('session-note:"uppercase"')).toBeLessThan(result.text.indexOf('session-note:"last input"'));
      expect(result.text.indexOf('session-note:"last input"')).toBeLessThan(result.text.indexOf('session-note:"first same id"'));
      expect(build(logs)).toEqual(result);
    }
  });
});
