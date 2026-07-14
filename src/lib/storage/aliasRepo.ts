import { getDb } from "./appDb";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import type { AliasDocument } from "@/lib/programs/types";

export const aliasRepo = {
  async list() {
    return (await getDb()).getAll("aliases");
  },

  async find(alias: string) {
    return (await getDb()).getFromIndex("aliases", "by-normalized-alias", normalizeExerciseName(alias));
  },

  /**
   * Upsert by normalizedAlias. `by-normalized-alias` is the store's only
   * unique index, so saving the same alias twice (within one import or
   * across a later re-import) must update the existing record in place
   * rather than mint a new id — otherwise the second insert throws a
   * ConstraintError.
   */
  async save(alias: Omit<AliasDocument, "id" | "normalizedAlias" | "createdAt"> & { createdAt?: string }) {
    const normalizedAlias = normalizeExerciseName(alias.alias);
    const db = await getDb();
    const existing = await db.getFromIndex("aliases", "by-normalized-alias", normalizedAlias);
    await db.put("aliases", {
      ...alias,
      id: existing?.id ?? crypto.randomUUID(),
      normalizedAlias,
      createdAt: existing?.createdAt ?? alias.createdAt ?? new Date().toISOString()
    });
  },

  /** Used during backup restore to preserve original ids and normalizedAlias values. */
  async putRaw(alias: AliasDocument): Promise<void> {
    if (!alias.id) throw new Error("Cannot restore alias without id");
    await (await getDb()).put("aliases", alias);
  },
};
