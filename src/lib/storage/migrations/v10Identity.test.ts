import type { AliasDocument, ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";
import {
  classifyAliases,
  createMigrationContext,
  migrateLog,
  migrateProgram,
} from "./v10Identity";

const context = createMigrationContext([], [], []);

// Rule 2 of the recipe in v10Identity.ts: a record we could not read is passed
// through exactly as stored, *including its key set*. `{ ...log, entries:
// mapped }` adds an own `entries: undefined` key when the field was absent —
// which is the legitimate shape of logs predating `entries`. fake-indexeddb
// drops such a key on write, so no database-level assertion can see it; real
// browsers' structuredClone keeps it, so the record comes back changed.
describe("v10 transforms preserve the stored key set", () => {
  it("does not add an entries key to a log that predates the field", () => {
    const log = {
      id: "l1",
      programId: "p1",
      dayId: "d1",
      performedAt: "2026-08-18T00:00:00.000Z",
    } as unknown as WorkoutLogDocument;

    const migrated = migrateLog(log, context);

    expect(Object.prototype.hasOwnProperty.call(migrated, "entries")).toBe(false);
    expect(migrated).toStrictEqual(log);
  });

  it("does not add days or overrides keys to a program that lacks them", () => {
    const program = { id: "p1", title: "T" } as unknown as ProgramDocument;

    const migrated = migrateProgram(program, context);

    expect(Object.prototype.hasOwnProperty.call(migrated, "days")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(migrated, "overrides")).toBe(false);
    expect(migrated).toStrictEqual(program);
  });

  it("does not add a sections key to a day that lacks one", () => {
    const program = {
      id: "p1",
      title: "T",
      days: [{ id: "day-1", dayNumber: 1 }],
      overrides: [],
    } as unknown as ProgramDocument;

    const migrated = migrateProgram(program, context);

    expect(Object.prototype.hasOwnProperty.call(migrated.days[0], "sections")).toBe(false);
    expect(migrated).toStrictEqual(program);
  });

  it("does not add a groups key to a section that lacks one", () => {
    const program = {
      id: "p1",
      title: "T",
      days: [{ id: "day-1", dayNumber: 1, sections: [{ id: "s1", type: "strength" }] }],
      overrides: [],
    } as unknown as ProgramDocument;

    const migrated = migrateProgram(program, context);

    expect(migrated).toStrictEqual(program);
  });

  it("does not add a suggestions key to an import warning that lacks one", () => {
    const program = {
      id: "p1",
      title: "T",
      days: [],
      overrides: [],
      import: { rawJson: {}, warnings: [{ path: "days.0", rawName: "X", message: "m" }] },
    } as unknown as ProgramDocument;

    const migrated = migrateProgram(program, context);

    expect(migrated).toStrictEqual(program);
  });
});

// Two colliding *remembered* rows can genuinely disagree about their target,
// so the survivor is a real choice rather than display text. Newest wins.
describe("classifyAliases — colliding remembered aliases", () => {
  const older: AliasDocument = {
    id: "alias-older",
    alias: "90/90 Hamstring",
    normalizedAlias: "90/90 hamstring",
    canonicalExerciseId: "pull-up",
    provenance: "remembered",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const newer: AliasDocument = {
    id: "alias-newer",
    alias: "90 90 Hamstring",
    normalizedAlias: "90 90 hamstring",
    canonicalExerciseId: "goblet-squat",
    provenance: "remembered",
    createdAt: "2026-06-01T00:00:00.000Z",
  };

  // Both orderings, because getAll returns rows in UUID-arbitrary key order and
  // a first-writer-wins implementation passes one of them by accident.
  it.each([
    { name: "newer row first", aliases: [newer, older] },
    { name: "older row first", aliases: [older, newer] },
  ])("keeps the newer remembered row on a token collision ($name)", ({ aliases }) => {
    expect(classifyAliases(aliases, [])).toEqual([{
      ...newer,
      normalizedAlias: "90 90 hamstring",
    }]);
  });

  // Two rows that arrive already classified as legacy-auto skip the outcome
  // gate, so — unlike rows classified here from a pre-v10 database — they can
  // genuinely disagree about their target. The tiebreak must not be left to key
  // order for them either.
  it.each([
    { name: "newer row first", order: [1, 0] },
    { name: "older row first", order: [0, 1] },
  ])("keeps the newer legacy-auto row on a token collision ($name)", ({ order }) => {
    const rows = [
      { ...older, provenance: "legacy-auto" as const },
      { ...newer, provenance: "legacy-auto" as const },
    ];
    expect(classifyAliases(order.map((index) => rows[index]), [])).toEqual([{
      ...newer,
      provenance: "legacy-auto",
      normalizedAlias: "90 90 hamstring",
    }]);
  });
});

// `aliasRepo.find` queries the by-normalized-alias index, and the resolver reads
// `candidate.normalizedAlias || candidate.alias` — so an alias missing only its
// *display* text is still fully usable, and dropping it destroys a working
// mapping for no gain. Drop only when nothing is left to match on.
describe("classifyAliases — how much malformation is still recoverable", () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: "alias-1",
    alias: "Romanian Deadlift",
    normalizedAlias: "romanian deadlift",
    canonicalExerciseId: "romanian-deadlift",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  }) as unknown as AliasDocument;

  it.each([
    { name: "an absent display text", overrides: { alias: undefined } },
    { name: "a non-string display text", overrides: { alias: 42 } },
    {
      name: "a display text that normalizes to nothing",
      overrides: { alias: "!!!" },
    },
  ])("retains an alias with $name but a usable token and target", ({ overrides }) => {
    expect(classifyAliases([row(overrides)], [])).toEqual([{
      ...row(overrides),
      normalizedAlias: "romanian deadlift",
      canonicalExerciseId: "romanian-deadlift",
      provenance: "legacy-auto",
    }]);
  });

  it.each([
    { name: "the target is not a string", overrides: { canonicalExerciseId: 7 } },
    {
      name: "neither the display text nor the token yields anything",
      overrides: { alias: undefined, normalizedAlias: "   " },
    },
    {
      name: "both the display text and the token are unreadable",
      overrides: { alias: null, normalizedAlias: 3 },
    },
  ])("drops an alias when $name", ({ overrides }) => {
    expect(classifyAliases([row(overrides)], [])).toEqual([]);
  });

  it("prefers the display text over a stale stored token", () => {
    const classified = classifyAliases([row({ normalizedAlias: "WRONG-TOKEN" })], []);
    expect(classified[0].normalizedAlias).toBe("romanian deadlift");
  });
});
