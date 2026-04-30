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
  },

  async activate(id: string): Promise<void> {
    const all = await this.list();
    const target = all.find((p) => p.id === id);
    if (!target) throw new Error(`Program ${id} not found`);
    const now = new Date().toISOString();
    await Promise.all(
      all.map((p) => {
        if (p.id === id) {
          return this.save({ ...p, active: true, status: "active", updatedAt: now });
        }
        // only change status for non-archived programs (don't un-archive)
        return this.save({
          ...p,
          active: false,
          status: p.status === "archived" ? "archived" : "draft",
          updatedAt: now,
        });
      })
    );
  },

  async duplicate(id: string): Promise<ProgramDocument> {
    const original = await this.get(id);
    if (!original) throw new Error(`Program ${id} not found`);
    const now = new Date().toISOString();
    const copy: ProgramDocument = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      title: `Copy of ${original.title}`,
      active: false,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      streakWeeks: 0,
      completion: 0,
    };
    await this.save(copy);
    return copy;
  },
};
