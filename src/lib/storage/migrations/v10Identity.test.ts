import { resolveExerciseIdentity } from "@/lib/catalog/identity";
import type {
  AliasDocument,
  ProgramDocument,
  UserExerciseDocument,
  WorkoutLogDocument,
} from "@/lib/programs/types";
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
  it("preserves editing lineage metadata", () => {
    const editing = {
      version: 1 as const,
      templateDays: [{ id: "template-day", dayNumber: 1, title: "Day", sections: [] }],
      dayBindings: [{ occurrenceDayId: "occurrence-day", templateDayId: "template-day" }],
      elementBindings: [],
      exceptions: [],
    };
    const program = { id: "p1", days: [], overrides: [], editing } as unknown as ProgramDocument;

    expect(migrateProgram(program, context).editing).toStrictEqual(editing);
  });

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
    expect(classifyAliases(aliases, [], "all")).toEqual([{
      ...newer,
      normalizedAlias: "90 90 hamstring",
    }]);
  });

  // Hand-edited files carry hand-written timestamps, and ISO 8601 permits an
  // offset. Comparing those as strings gets the order wrong: this candidate is
  // an hour *later* than the incumbent in real time but sorts earlier.
  it("compares createdAt as an instant, not as a string", () => {
    const incumbent: AliasDocument = { ...newer, createdAt: "2026-06-01T00:00:00.000Z" };
    const candidate: AliasDocument = {
      ...older,
      id: "alias-offset",
      canonicalExerciseId: "goblet-squat",
      createdAt: "2026-05-31T23:00:00.000-02:00",
    };

    expect(classifyAliases([incumbent, candidate], [], "unclassified")).toEqual([{
      ...candidate,
      normalizedAlias: "90 90 hamstring",
    }]);
  });

  // An unreadable timestamp is no evidence of anything, so it must not beat a
  // readable one by sitting in the store first.
  it("prefers the row whose createdAt can be read at all", () => {
    const incumbent = { ...newer, createdAt: undefined } as unknown as AliasDocument;
    const candidate: AliasDocument = { ...older, canonicalExerciseId: "goblet-squat" };

    expect(classifyAliases([incumbent, candidate], [], "unclassified")).toEqual([{
      ...candidate,
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
    expect(classifyAliases(order.map((index) => rows[index]), [], "unclassified")).toEqual([{
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
    expect(classifyAliases([row(overrides)], [], "all")).toEqual([{
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
    expect(classifyAliases([row(overrides)], [], "all")).toEqual([]);
  });

  // Was "prefers the display text over a stale stored token", and the
  // preference is now the other way round: a readable stored token is the key
  // its writer chose and is kept. See `aliasLookupToken` for why — re-deriving
  // it from the display text is what killed a corrected annotated name on
  // restore. Two consequences, pinned separately because they are different
  // rows:
  //
  //  - a row whose writer classified it keeps its token, whatever the display
  //    text would have produced;
  //  - an unclassified legacy row is still judged by the outcome gate on that
  //    token, so a hand-edited one that names nothing is purged rather than
  //    repaired. Only a hand-edited file can produce such a row: every writer
  //    in `src/` derives the token from the display text, and the row was
  //    already unreachable in the database that exported it.
  it("keeps a readable stored token that disagrees with the display text", () => {
    const classified = classifyAliases(
      [row({ normalizedAlias: "WRONG-TOKEN", provenance: "remembered" })],
      [],
      "unclassified",
    );
    expect(classified.map((alias) => alias.normalizedAlias)).toEqual(["wrong token"]);
  });

  it("purges an unclassified legacy row whose stored token names no exercise", () => {
    expect(classifyAliases([row({ normalizedAlias: "WRONG-TOKEN" })], [], "all")).toEqual([]);
  });
});

// The scope is the whole of the difference between "a pre-v10 database or a
// version-1 file" and "a version-2 file". No mocked registry needed: a token
// with zero concrete outcomes is purged by the outcome gate whenever the rules
// run at all.
describe("classifyAliases — classification scope", () => {
  const legacyAutoRow: AliasDocument = {
    id: "alias-noise",
    alias: "3x8 @ RPE 7",
    normalizedAlias: "3x8 rpe 7",
    canonicalExerciseId: "romanian-deadlift",
    provenance: "legacy-auto",
    createdAt: "2026-08-18T00:00:00.000Z",
  };

  it("re-runs the rules over a legacy-auto row under scope all", () => {
    expect(classifyAliases([legacyAutoRow], [], "all")).toEqual([]);
  });

  it("keeps an already-classified legacy-auto row under scope unclassified", () => {
    expect(classifyAliases([legacyAutoRow], [], "unclassified")).toEqual([legacyAutoRow]);
  });

  // The branch tests for the *known* value, not for truthiness. Rewriting it to
  // `!!alias.provenance` — the obvious simplification — would let any string at
  // all stand in for "already classified", reopening the smuggle path the scope
  // rule closed. The v1 `it.each` case cannot reach this: under scope "all" the
  // branch never fires.
  it("re-runs the rules over a row whose provenance is unrecognized", () => {
    const bogus = { ...legacyAutoRow, provenance: "nope" } as unknown as AliasDocument;
    expect(classifyAliases([bogus], [], "unclassified")).toEqual([]);
  });

  it.each(["all", "unclassified"] as const)(
    "keeps a remembered row under scope %s",
    (scope) => {
      const remembered: AliasDocument = { ...legacyAutoRow, provenance: "remembered" };
      expect(classifyAliases([remembered], [], scope)).toEqual([remembered]);
    },
  );
});

// A restore is the one path on which the app deliberately rewrites the user's
// key set, so it is the one path that can silently unmake a correction the user
// watched take effect. Two decisions live in `classifyAliases` and they are
// independent:
//
//  - the KEY a row lands on, which is its writer's deliberate choice and not
//    ours to re-derive while we can read it;
//  - the TEXT the disambiguation rules run over, which must stay the raw
//    display name so an "or" name is still seen as offering a choice.
//
// Collapsing the two is what made a corrected annotated name die on restore.
describe("classifyAliases — a restore keeps the key its writer chose", () => {
  // The name must carry a non-identity phrase. A plain name cannot tell the
  // phrase-stripped rule from the plain-normalize rule, so it would pass under
  // either and verify nothing.
  const annotated = "3 second paused Hatfield Squat";
  const strippedToken = "paused hatfield squat";
  const unstrippedToken = "3 second paused hatfield squat";

  const rememberedRow = (overrides: Partial<AliasDocument> = {}): AliasDocument => ({
    id: "alias-new",
    alias: annotated,
    normalizedAlias: strippedToken,
    canonicalExerciseId: "goblet-squat",
    provenance: "remembered",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });

  const resolves = (aliases: readonly AliasDocument[], name: string) =>
    resolveExerciseIdentity(
      { kind: "import-name", name },
      createMigrationContext(aliases, [], []),
    ).concreteExerciseId;

  it("keeps a remembered correction on the phrase-stripped token the resolver reads", () => {
    const row = rememberedRow();
    expect(resolves([row], annotated)).toBe("goblet-squat");

    const classified = classifyAliases([row], [], "unclassified");

    expect(classified.map((alias) => alias.normalizedAlias)).toEqual([strippedToken]);
    expect(resolves(classified, annotated)).toBe("goblet-squat");
  });

  it("keeps both generations of key when one display name carries a legacy row and a new one", () => {
    const legacy = rememberedRow({
      id: "alias-legacy",
      normalizedAlias: unstrippedToken,
      canonicalExerciseId: "barbell-high-bar-squat",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const classified = classifyAliases([legacy, rememberedRow()], [], "unclassified");

    expect(classified.map((alias) => [alias.id, alias.normalizedAlias])).toEqual([
      ["alias-legacy", unstrippedToken],
      ["alias-new", strippedToken],
    ]);
    expect(resolves(classified, annotated)).toBe("goblet-squat");
  });

  // The decoupling guard. If the key preference is inverted without splitting
  // the rule text off it, the rules see the already-stripped token, an "or"
  // name stops reading as an alternative, and the migration silently starts
  // RETAINING rows it is specified to purge.
  //
  // The token has to name exactly one real exercise, or the outcome gate
  // further down drops the row on its own and the test passes whether the
  // rules ran on the right text or not. Measured: with a token that names
  // nothing, recoupling the rule text to the key left this suite 266/266.
  it("runs the disambiguation rules over the display text even when the token is already stripped", () => {
    const custom: UserExerciseDocument = {
      id: "user-exercise-1",
      name: "Hatfield Squat Lunge",
      createdAt: "2026-08-18T00:00:00.000Z",
    } as UserExerciseDocument;
    const alternative: AliasDocument = {
      id: "alias-or",
      alias: "Hatfield Squat or Lunge",
      // What `prepareImportName` makes of that name: no "or" left in it.
      normalizedAlias: "hatfield squat lunge",
      canonicalExerciseId: custom.id,
      createdAt: "2026-08-18T00:00:00.000Z",
    } as AliasDocument;

    // Canary: the outcome gate would keep this row, so the only thing that can
    // drop it is the alternative check reading the display text.
    expect(classifyAliases([{ ...alternative, alias: "Hatfield Squat Lunge" }], [custom], "all"))
      .toHaveLength(1);

    expect(classifyAliases([alternative], [custom], "all")).toEqual([]);
  });

  // The new collision path, and the reason the write set stays legal.
  // `by-normalized-alias` is the schema's only unique index, and preferring
  // the stored token means two rows with different display texts can now claim
  // one key where re-deriving would have given them two. The dedupe absorbs it;
  // without it a restore would issue a colliding put and be REJECTED outright,
  // which is worse than either token choice.
  it("collapses two rows that claim one stored token, rather than issuing a colliding write", () => {
    const older = rememberedRow({ id: "alias-a", alias: "3 second paused Hatfield Squat" });
    const newer = rememberedRow({
      id: "alias-b",
      alias: "5 second paused Hatfield Squat",
      createdAt: "2026-08-19T00:00:00.000Z",
    });

    const classified = classifyAliases([older, newer], [], "unclassified");

    expect(classified.map((alias) => [alias.id, alias.normalizedAlias])).toEqual([
      ["alias-b", strippedToken],
    ]);
  });

  it("normalizes a stored token that was never normalized", () => {
    const messy = rememberedRow({ alias: undefined, normalizedAlias: "  Paused   HATFIELD Squat  " } as Partial<AliasDocument>);

    expect(classifyAliases([messy], [], "unclassified").map((alias) => alias.normalizedAlias))
      .toEqual([strippedToken]);
  });
});
