import { deleteDB } from "idb";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { aliasRepo, rememberedAliasToken } from "./aliasRepo";
import { DB_NAME, resetDbConnection } from "./appDb";

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

describe("aliasRepo.save", () => {
  it("inserts a new alias with a fresh id", async () => {
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" });
    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      alias: "Strict Pullup",
      canonicalExerciseId: "pull-up",
      provenance: "remembered",
    });
    expect(all[0].id).toBeTruthy();
  });

  it("upserts by normalizedAlias: saving the same alias twice updates the existing record in place instead of inserting a duplicate", async () => {
    await aliasRepo.save({ alias: "Competition Bench Press", canonicalExerciseId: "bench-press", provenance: "remembered" });
    const first = await aliasRepo.find("Competition Bench Press");
    expect(first).toBeDefined();

    // Save again with the same (normalized) alias — must not throw a
    // ConstraintError from the unique by-normalized-alias index, and must
    // not create a second record.
    await aliasRepo.save({ alias: "competition bench press", canonicalExerciseId: "bench-press", provenance: "remembered" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    const second = await aliasRepo.find("Competition Bench Press");
    expect(second?.id).toBe(first?.id);
  });

  it("rejects a different target without overwriting the remembered interpretation", async () => {
    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat-v1", provenance: "remembered" });
    const original = await aliasRepo.find("Goblet Squat");

    await expect(aliasRepo.save({
      alias: "Goblet Squat",
      canonicalExerciseId: "goblet-squat-v2",
      provenance: "remembered",
    })).rejects.toThrow("Alias already maps to a different exercise");

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(original?.id);
    expect(all[0].canonicalExerciseId).toBe("goblet-squat-v1");
  });

  it("preserves the original createdAt when upserting", async () => {
    await aliasRepo.save({ alias: "Front Squat", canonicalExerciseId: "front-squat", provenance: "remembered" });
    const original = await aliasRepo.find("Front Squat");

    await aliasRepo.save({ alias: "Front Squat", canonicalExerciseId: "front-squat", provenance: "remembered" });
    const updated = await aliasRepo.find("Front Squat");

    expect(updated?.createdAt).toBe(original?.createdAt);
  });

  it("treats names differing only by case/punctuation/whitespace as the same alias", async () => {
    await aliasRepo.save({ alias: "Competition Bench Press", canonicalExerciseId: "bench-press", provenance: "remembered" });
    await aliasRepo.save({ alias: "  competition   bench-press!  ", canonicalExerciseId: "bench-press", provenance: "remembered" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(1);
  });

  it("stores a new alias under the token the resolver looks it up by", async () => {
    // `resolveName` strips the duration annotation before it consults the alias
    // store, so it looks up `paused hatfield squat`. A row keyed on
    // `3 second paused hatfield squat` would be invisible to it: the write
    // succeeds and the mapping never takes effect.
    const raw = "3 second paused Hatfield Squat";
    // Canary: the annotation really is stripped in the shipped artifact, so this
    // fixture can still tell the two tokens apart.
    expect(rememberedAliasToken(raw)).not.toBe(normalizeExerciseName(raw));

    await aliasRepo.save({ alias: raw, canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" });

    const [stored] = await aliasRepo.list();
    expect(stored.normalizedAlias).toBe("paused hatfield squat");
    // The user's own wording survives, because it is the display text.
    expect(stored.alias).toBe(raw);
  });

  it("collapses two duration variants of one name onto a single mapping", async () => {
    // The annotation is not part of identity, so remembering one variant is
    // remembering the name — not a second row that shadows the first.
    await aliasRepo.save({
      alias: "3 second paused Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    await aliasRepo.save({
      alias: "5 second paused Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });

    expect(await aliasRepo.list()).toHaveLength(1);
  });

  it("still inserts distinct aliases as separate records", async () => {
    await aliasRepo.save({ alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" });
    await aliasRepo.save({ alias: "Goblet Squat", canonicalExerciseId: "goblet-squat", provenance: "remembered" });

    const all = await aliasRepo.list();
    expect(all).toHaveLength(2);
  });

  it("dispatches once for a whole multi-alias transaction, not once per alias", async () => {
    // Only the count is asserted here. Reading the data from inside the
    // listener would prove nothing about ordering — that claim belongs to the
    // transaction-lifecycle test below, which can actually observe it.
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await aliasRepo.saveMany([
        { alias: "Back Squat", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" },
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
      ]);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.list()).resolves.toHaveLength(2);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  it("dispatches only after the write transaction has actually committed", async () => {
    // "Dispatch once" is not the same claim as "dispatch after commit": a
    // listener's own read is serialised behind the open transaction either
    // way, so reading committed data proves nothing about ordering. Observe
    // the transaction lifecycle directly instead — the native `complete`
    // event is what idb's `tx.done` resolves on, and this listener is
    // registered before idb attaches its own, so it always runs first.
    const nativeTransaction = IDBDatabase.prototype.transaction;
    let writeTransactionCommitted = false;
    let committedAtDispatch: boolean | undefined;
    IDBDatabase.prototype.transaction = function patched(
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      const tx = nativeTransaction.apply(this, args);
      if (tx.mode === "readwrite") {
        tx.addEventListener("complete", () => {
          writeTransactionCommitted = true;
        });
      }
      return tx;
    };
    const listener = jest.fn(() => {
      committedAtDispatch = writeTransactionCommitted;
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await aliasRepo.saveMany([
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
        { alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" },
      ]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(committedAtDispatch).toBe(true);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
      IDBDatabase.prototype.transaction = nativeTransaction;
    }
  });

  // Same rule normalizationOverrideRepo.save documents: input that can be judged
  // without reading the store is judged before a readwrite transaction is opened,
  // so a rejected call never leaves one dangling until it auto-commits. The
  // conflict check stays inside on purpose — it needs the stored rows, and
  // splitting it would let a concurrent tab claim the token between the read and
  // the write, which the unique index would then reject.
  it.each([
    {
      name: "an alias that normalizes to nothing",
      input: { alias: "!!!", canonicalExerciseId: "pull-up", provenance: "remembered" as const },
      expected: "Alias cannot be empty",
    },
    {
      name: "a provenance other than remembered",
      input: { alias: "RDL", canonicalExerciseId: "pull-up", provenance: "legacy-auto" as unknown as "remembered" },
      expected: "New aliases require remembered provenance",
    },
  ])("saveMany rejects $name before opening a write transaction", async ({ input, expected }) => {
    const nativeTransaction = IDBDatabase.prototype.transaction;
    const modes: string[] = [];
    IDBDatabase.prototype.transaction = function patched(
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      const tx = nativeTransaction.apply(this, args);
      modes.push(tx.mode);
      return tx;
    };
    try {
      await expect(aliasRepo.saveMany([input])).rejects.toThrow(expected);
    } finally {
      IDBDatabase.prototype.transaction = nativeTransaction;
    }
    expect(modes).not.toContain("readwrite");
  });

  it("putRaw preserves ids and defaults old aliases to legacy-auto", async () => {
    await aliasRepo.putRaw({
      id: "legacy-alias-id",
      alias: "RDL",
      normalizedAlias: "rdl",
      canonicalExerciseId: "romanian-deadlift",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    await expect(aliasRepo.find("RDL")).resolves.toMatchObject({
      id: "legacy-alias-id",
      provenance: "legacy-auto",
    });
  });

  // putRaw is the imperative twin of the restore classifier, so it has to agree
  // with it about which rows are usable. Before this, `normalizeExerciseName(
  // input.alias)` threw on a row the classifier keeps, and accepted one whose
  // token normalized to "" — a key the next such row collides with on the unique
  // index.
  it("putRaw keeps a row whose display text is unreadable but whose token is not", async () => {
    await aliasRepo.putRaw({
      id: "legacy-token-only",
      alias: 42 as unknown as string,
      normalizedAlias: "90/90 Hamstring",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    await expect(aliasRepo.find("90 90 hamstring")).resolves.toMatchObject({
      id: "legacy-token-only",
      normalizedAlias: "90 90 hamstring",
      provenance: "legacy-auto",
    });
  });

  it.each([
    { name: "neither a readable alias nor a readable token", alias: 42, normalizedAlias: null },
    { name: "an alias and token that both normalize to nothing", alias: "!!!", normalizedAlias: "   " },
  ])("putRaw rejects a row with $name", async ({ alias, normalizedAlias }) => {
    await expect(aliasRepo.putRaw({
      id: "legacy-unusable",
      alias: alias as unknown as string,
      normalizedAlias: normalizedAlias as unknown as string,
      canonicalExerciseId: "pull-up",
      createdAt: "2026-08-18T00:00:00.000Z",
    })).rejects.toThrow("Cannot restore alias without a usable alias or token");
    await expect(aliasRepo.list()).resolves.toEqual([]);
  });

  it("putRaw repairs case and spacing in the stored token", async () => {
    // Scope note, because the previous title overclaimed and this is the exact
    // trap this plan keeps hitting: `"90/90 Hamstring"` is a PLAIN name, so
    // `normalizeExerciseName` of the display text and of the stored token are
    // both `"90 90 hamstring"`. This fixture therefore CANNOT distinguish "keep
    // the stored token" from "re-derive it from the display text" — restoring
    // the pre-fix key preference leaves it green. What it does pin is the
    // normalize pass: drop it and the row lands on `"  90 90   HAMSTRING "`, a
    // key no lookup can reach. The keep-the-stored-token property is the
    // sibling below, whose annotated name can express the difference.
    await aliasRepo.putRaw({
      id: "legacy-alias-id",
      alias: "90/90 Hamstring",
      normalizedAlias: "  90 90   HAMSTRING ",
      canonicalExerciseId: "90-90-hamstring",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    const [stored] = await aliasRepo.list();
    expect(stored.normalizedAlias).toBe("90 90 hamstring");
    // Reachable by the same lookup the app uses.
    await expect(aliasRepo.find("90/90 Hamstring")).resolves.toMatchObject({ id: "legacy-alias-id" });
  });

  it("putRaw keeps a phrase-stripped token rather than re-deriving it from the display text", async () => {
    // The annotated name is load-bearing: a plain name cannot tell the
    // phrase-stripped rule from the plain-normalize rule.
    await aliasRepo.putRaw({
      id: "remembered-alias-id",
      alias: "3 second paused Hatfield Squat",
      normalizedAlias: "paused hatfield squat",
      canonicalExerciseId: "goblet-squat",
      provenance: "remembered",
      createdAt: "2026-08-18T00:00:00.000Z",
    });

    const [stored] = await aliasRepo.list();
    expect(stored.normalizedAlias).toBe("paused hatfield squat");
    await expect(aliasRepo.find("3 second paused Hatfield Squat"))
      .resolves.toMatchObject({ id: "remembered-alias-id" });
  });

  it("replaceRemembered is the explicit one-transaction correction path", async () => {
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      // Registered before the suppressed write, so `not.toHaveBeenCalled()`
      // is a real observation rather than a vacuous one.
      await aliasRepo.putRaw({
        id: "legacy-alias-id",
        alias: "Back Squat",
        normalizedAlias: "back squat",
        canonicalExerciseId: "barbell-back-squat",
        createdAt: "2026-08-18T00:00:00.000Z",
      }, { dispatch: false });
      await expect(aliasRepo.find("Back Squat")).resolves.toBeDefined();
      expect(listener).not.toHaveBeenCalled();

      await aliasRepo.replaceRemembered({
        alias: "Back Squat",
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
      });
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.find("Back Squat")).resolves.toMatchObject({
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
      });
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  it("removeMany dispatches once, and dispatch:false announces nothing at all", async () => {
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      // Suppression is what migration and restore rely on: the write lands,
      // the event does not. Asserting that needs the listener attached first.
      await aliasRepo.saveMany([
        { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
        { alias: "Strict Pullup", canonicalExerciseId: "pull-up", provenance: "remembered" },
      ], { dispatch: false });
      const ids = (await aliasRepo.list()).map((alias) => alias.id);
      expect(ids).toHaveLength(2);
      expect(listener).not.toHaveBeenCalled();

      await aliasRepo.removeMany(ids);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(aliasRepo.list()).resolves.toEqual([]);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });
});
