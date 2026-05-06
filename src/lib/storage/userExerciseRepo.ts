import { getDb } from "./appDb";
import type { UserExerciseDocument } from "@/lib/programs/types";

export const userExerciseRepo = {
  async list(): Promise<UserExerciseDocument[]> {
    return (await getDb()).getAll("userExercises");
  },

  async get(id: string): Promise<UserExerciseDocument | undefined> {
    return (await getDb()).get("userExercises", id);
  },

  async save(name: string): Promise<UserExerciseDocument> {
    const doc: UserExerciseDocument = {
      id: `user-${crypto.randomUUID()}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    await (await getDb()).put("userExercises", doc);
    return doc;
  },
};
