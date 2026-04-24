import { getDb } from "./appDb";
import type { ProgramDocument } from "@/lib/programs/types";

export const programRepo = {
  async list() {
    return (await getDb()).getAll("programs");
  },

  async listActive() {
    return (await this.list()).filter((program) => program.active);
  },

  async get(id: string) {
    return (await getDb()).get("programs", id);
  },

  async save(program: ProgramDocument) {
    const now = new Date().toISOString();
    await (await getDb()).put("programs", {
      ...program,
      updatedAt: now,
      createdAt: program.createdAt || now
    });
  },

  async remove(id: string) {
    await (await getDb()).delete("programs", id);
  }
};
