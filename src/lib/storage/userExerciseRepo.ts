import {
  dispatchExerciseIdentityChanged,
  type IdentityWriteOptions,
} from "@/lib/catalog/identityEvents";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { getDb } from "./appDb";

export type UserExerciseRepository = {
  list(): Promise<UserExerciseDocument[]>;
  get(id: string): Promise<UserExerciseDocument | undefined>;
  save(name: string, options?: IdentityWriteOptions): Promise<UserExerciseDocument>;
  remove(id: string, options?: IdentityWriteOptions): Promise<void>;
};

function dispatchAfterWrite(options?: IdentityWriteOptions): void {
  if (options?.dispatch !== false) dispatchExerciseIdentityChanged();
}

export const userExerciseRepo: UserExerciseRepository = {
  async list() {
    return (await getDb()).getAll("userExercises");
  },

  async get(id) {
    return (await getDb()).get("userExercises", id);
  },

  async save(name, options) {
    const doc: UserExerciseDocument = {
      id: `user-${crypto.randomUUID()}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    const db = await getDb();
    const tx = db.transaction("userExercises", "readwrite");
    await tx.objectStore("userExercises").put(doc);
    await tx.done;
    dispatchAfterWrite(options);
    return doc;
  },

  async remove(id, options) {
    const db = await getDb();
    const tx = db.transaction("userExercises", "readwrite");
    await tx.objectStore("userExercises").delete(id);
    await tx.done;
    dispatchAfterWrite(options);
  },
};
