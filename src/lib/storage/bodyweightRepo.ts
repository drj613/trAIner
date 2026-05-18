import { getDb } from "./appDb";
import type { BodyweightEntry } from "@/lib/programs/types";

export const bodyweightRepo = {
  async list(): Promise<BodyweightEntry[]> {
    return (await getDb()).getAll("bodyweight");
  },

  async save(entry: BodyweightEntry): Promise<void> {
    await (await getDb()).put("bodyweight", entry);
  },

  async remove(id: string): Promise<void> {
    await (await getDb()).delete("bodyweight", id);
  },
};
