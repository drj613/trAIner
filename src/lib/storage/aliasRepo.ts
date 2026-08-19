import { prepareImportName } from "@/lib/catalog/identity";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { disambiguationsByNormalizedName } from "@/lib/catalog/registries";
import { aliasLookupToken } from "./migrations/v10Identity";
import { dispatchAfterWrite, type IdentityWriteOptions } from "@/lib/catalog/identityEvents";
import type { AliasDocument } from "@/lib/programs/types";
import { getDb } from "./appDb";

export type RememberedAliasInput = {
  alias: string;
  canonicalExerciseId: string;
  provenance: "remembered";
  /**
   * The token this alias is LOOKED UP by, when that is not simply
   * `normalizeExerciseName(alias)`.
   *
   * `resolveName` strips non-identity annotations from a name before it
   * consults the alias store (`identity.ts:280-286` matches against
   * `prepareImportName(name, disambiguations).normalizedName`), so for a name
   * like `3 second paused Hatfield Squat` the token it reads is
   * `paused hatfield squat`. A caller that lets this default writes a row under
   * a key the resolver never reads — the write succeeds and the mapping never
   * takes effect.
   *
   * Separate from `alias` on purpose: `alias` is the user's own wording and is
   * what every surface displays, so the lookup token cannot be smuggled in
   * through it without losing their words.
   *
   * Optional because `rememberedAliasToken` derives the same answer from
   * `alias`. A caller supplies it when it needs the token itself anyway — the
   * correction sheet keys an override on it in the same breath — so the key the
   * row lands on is visible where the decision is made.
   */
  normalizedAlias?: string;
};

/**
 * The token a NEW remembered alias is stored under, which must be the token
 * `resolveName` looks one up by.
 *
 * `resolveName` runs `prepareImportName` first (`identity.ts:280`) and matches
 * stored rows against its output (`:283-286`), so a row keyed on plain
 * `normalizeExerciseName(alias)` is invisible to the resolver whenever the name
 * carries a non-identity annotation: the write succeeds and the mapping never
 * takes effect. Deriving it here rather than at each call site means a writer
 * cannot forget — two surfaces keying differently is the defect this replaces.
 *
 * Restored and migrated rows deliberately do NOT come through here: `putRaw`
 * keeps `aliasLookupToken`'s rule so an existing row resolves after a restore
 * exactly as it did before it.
 */
export function rememberedAliasToken(
  alias: string,
  disambiguations = disambiguationsByNormalizedName,
): string {
  return prepareImportName(alias, disambiguations).normalizedName;
}

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
  // A supplied token is still normalized, so a caller handing over raw text by
  // mistake produces a legal index key. `normalizeExerciseName` is idempotent
  // (measured: identical output on a second pass for 200,003 inputs — 200k
  // fuzzed strings plus every catalogue name, alias and rule token), so this
  // cannot alter a token that was already derived correctly.
  const normalizedAlias = input.normalizedAlias !== undefined
    ? normalizeExerciseName(input.normalizedAlias)
    : rememberedAliasToken(input.alias);
  if (!normalizedAlias) throw new Error("Alias cannot be empty");
  if (!input.canonicalExerciseId.trim()) throw new Error("Alias target cannot be empty");
  return normalizedAlias;
}

export const aliasRepo: AliasRepository = {
  async list() {
    return (await getDb()).getAll("aliases");
  },

  async find(alias: string) {
    // Same token the write side uses, so "is this name already mapped?" is
    // asked of the key a mapping would actually be stored under.
    return (await getDb()).getFromIndex("aliases", "by-normalized-alias", rememberedAliasToken(alias));
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
