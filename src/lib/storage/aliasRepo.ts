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

  async save(alias: Omit<AliasDocument, "id" | "normalizedAlias" | "createdAt"> & { createdAt?: string }) {
    const normalizedAlias = normalizeExerciseName(alias.alias);
    await (await getDb()).put("aliases", {
      ...alias,
      id: normalizedAlias,
      normalizedAlias,
      createdAt: alias.createdAt ?? new Date().toISOString()
    });
  }
};
