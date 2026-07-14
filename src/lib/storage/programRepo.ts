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

  async activate(id: string): Promise<ProgramDocument[]> {
    const db = await getDb();
    // Programs with at least one finished session: a demoted routine that was
    // actually run should read "completed", not revert to "draft".
    const logs = await db.getAll("logs");
    const ranPrograms = new Set(
      logs.filter((l) => l.completedAt).map((l) => l.programId),
    );
    const tx = db.transaction("programs", "readwrite");
    const store = tx.objectStore("programs");
    const all = await store.getAll();
    const target = all.find((p) => p.id === id);
    if (!target) {
      // Let transaction auto-commit (nothing was written), then throw
      await tx.done;
      throw new Error(`Program ${id} not found`);
    }
    const now = new Date().toISOString();
    const updated: ProgramDocument[] = all.map((p) => {
      if (p.id === id) {
        return { ...p, active: true, status: "active" as const, updatedAt: now };
      }
      // don't un-archive or un-complete; the outgoing active routine keeps
      // its progress visible as "completed" if it has any finished sessions
      const status =
        p.status === "archived" || p.status === "completed"
          ? p.status
          : p.active && ranPrograms.has(p.id)
            ? ("completed" as const)
            : ("draft" as const);
      return { ...p, active: false, status, updatedAt: now };
    });
    await Promise.all(updated.map((p) => store.put(p)));
    await tx.done;
    return updated;
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
