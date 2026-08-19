import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { aliasLookupToken } from "./migrations/v10Identity";
import { dispatchAfterWrite, type IdentityWriteOptions } from "@/lib/catalog/identityEvents";
import type { AliasDocument } from "@/lib/programs/types";
import { getDb } from "./appDb";

export type RememberedAliasInput = {
  alias: string;
  canonicalExerciseId: string;
  provenance: "remembered";
};

export type LegacyAliasInput = Omit<AliasDocument, "provenance"> & {
  provenance?: "legacy-auto";
};

export type AliasRepository = {
  list(): Promise<AliasDocument[]>;
  find(alias: string): Promise<AliasDocument | undefined>;
  save(input: RememberedAliasInput, options?: IdentityWriteOptions): Promise<void>;
  saveMany(inputs: RememberedAliasInput[], options?: IdentityWriteOptions): Promise<void>;
  putRaw(input: AliasDocument | LegacyAliasInput, options?: IdentityWriteOptions): Promise<void>;
  replaceRemembered(input: RememberedAliasInput, options?: IdentityWriteOptions): Promise<void>;
  removeMany(ids: string[], options?: IdentityWriteOptions): Promise<void>;
};

function assertRememberedInput(input: RememberedAliasInput): string {
  if (input.provenance !== "remembered") {
    throw new Error("New aliases require remembered provenance");
  }
  const normalizedAlias = normalizeExerciseName(input.alias);
  if (!normalizedAlias) throw new Error("Alias cannot be empty");
  if (!input.canonicalExerciseId.trim()) throw new Error("Alias target cannot be empty");
  return normalizedAlias;
}

export const aliasRepo: AliasRepository = {
  async list() {
    return (await getDb()).getAll("aliases");
  },

  async find(alias: string) {
    return (await getDb()).getFromIndex("aliases", "by-normalized-alias", normalizeExerciseName(alias));
  },

  async save(input, options) {
    await this.saveMany([input], options);
  },

  async saveMany(inputs, options) {
    if (inputs.length === 0) return;
    // Input shape is checked before the transaction opens, for the reason
    // normalizationOverrideRepo.save documents: rejecting inside a readwrite
    // transaction leaves it dangling until it auto-commits.
    //
    // The conflict check below stays inside, deliberately. It needs the stored
    // rows, and read-then-write across two transactions would let a concurrent
    // tab insert the same token between them — at which point this write takes a
    // fresh UUID for a token another row already holds, and the unique index
    // rejects it. That is the write-rejection class this whole effort exists to
    // avoid, and it is strictly worse than briefly holding a readwrite lock.
    const normalizedAliases = inputs.map((input) => assertRememberedInput(input));
    const db = await getDb();
    const tx = db.transaction("aliases", "readwrite");
    const store = tx.objectStore("aliases");
    const existingAliases = await store.getAll();
    const staged = new Map(existingAliases.map((alias) => [alias.normalizedAlias, alias]));
    const changed = new Map<string, AliasDocument>();

    for (const [index, input] of inputs.entries()) {
      const normalizedAlias = normalizedAliases[index];
      const existing = staged.get(normalizedAlias);
      if (existing && existing.canonicalExerciseId !== input.canonicalExerciseId) {
        throw new Error(
          `Alias already maps to a different exercise: ${input.alias}. Use the correction flow to replace it.`,
        );
      }
      const document: AliasDocument = {
        id: existing?.id ?? crypto.randomUUID(),
        alias: input.alias,
        normalizedAlias,
        canonicalExerciseId: input.canonicalExerciseId,
        provenance: "remembered",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      staged.set(normalizedAlias, document);
      changed.set(normalizedAlias, document);
    }

    await Promise.all([...changed.values()].map((document) => store.put(document)));
    await tx.done;
    dispatchAfterWrite(options);
  },

  async putRaw(input, options) {
    if (!input.id) throw new Error("Cannot restore alias without id");
    // One shared rule with the migration/restore classifier, rather than a second
    // opinion: recomputed from the display text, falling back to the stored
    // token, and rejected outright when neither is usable. The old
    // `normalizeExerciseName(input.alias)` threw on exactly the row
    // classifyAliases now recovers, and accepted a row whose token normalized to
    // "" — a key a second such row then collides with on the unique index.
    const token = aliasLookupToken(input);
    if (!token) throw new Error("Cannot restore alias without a usable alias or token");
    const document: AliasDocument = {
      ...input,
      normalizedAlias: token.normalizedAlias,
      provenance: input.provenance ?? "legacy-auto",
    };
    const db = await getDb();
    const tx = db.transaction("aliases", "readwrite");
    await tx.objectStore("aliases").put(document);
    await tx.done;
    dispatchAfterWrite(options);
  },

  async replaceRemembered(input, options) {
    const normalizedAlias = assertRememberedInput(input);
    const db = await getDb();
    const tx = db.transaction("aliases", "readwrite");
    const store = tx.objectStore("aliases");
    const existing = await store.index("by-normalized-alias").get(normalizedAlias);
    if (existing) await store.delete(existing.id);
    await store.put({
      id: crypto.randomUUID(),
      alias: input.alias,
      normalizedAlias,
      canonicalExerciseId: input.canonicalExerciseId,
      provenance: "remembered",
      createdAt: new Date().toISOString(),
    });
    await tx.done;
    dispatchAfterWrite(options);
  },

  async removeMany(ids, options) {
    if (ids.length === 0) return;
    const db = await getDb();
    const tx = db.transaction("aliases", "readwrite");
    const store = tx.objectStore("aliases");
    await Promise.all([...new Set(ids)].map((id) => store.delete(id)));
    await tx.done;
    dispatchAfterWrite(options);
  },
};
