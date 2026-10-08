import { getDb } from "./appDb";
import type { ProgramDocument } from "@/lib/programs/types";
import type { ProgramEditPreview } from "@/lib/programs/edits";
import { completionRevision, previewProgramEdit, programRevision } from "@/lib/programs/edits";
import { getRenderableDays } from "@/lib/programs/overrides";

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

  async commitEdit(preview: ProgramEditPreview): Promise<{ status: "saved"; program: ProgramDocument } | { status: "stale"; preview: ProgramEditPreview }> {
    const db = await getDb();
    const tx = db.transaction(["programs", "logs"], "readwrite");
    const programs = tx.objectStore("programs");
    const logs = tx.objectStore("logs");
    const current = await programs.get(preview.proposedDocument.id);
    const allLogs = await logs.getAll();
    const programLogs = allLogs.filter((log) => log.programId === preview.proposedDocument.id);
    if (!current) {
      await tx.done;
      throw new Error(`Program ${preview.proposedDocument.id} not found`);
    }
    if (programRevision(current) !== preview.sourceRevision || completionRevision(programLogs) !== preview.completionRevision) {
      await tx.done;
      const refreshedPreview = previewProgramEdit(current, preview.edit, { ...preview.context, logs: programLogs });
      return { status: "stale", preview: refreshedPreview };
    }

    const next: ProgramDocument = { ...preview.proposedDocument, updatedAt: new Date().toISOString() };
    const changedPrescriptions = new Set(
      preview.changes.filter((change) => change.field !== "dayNumber" && change.field !== "title").map((change) => change.dayId),
    );
    const writes: Promise<IDBValidKey>[] = [];
    const done = tx.done;
    try {
      if (changedPrescriptions.size > 0) {
        const before = getRenderableDays(current);
        for (const log of programLogs) {
          if ((!log.completedAt && !log.skippedAt) || !changedPrescriptions.has(log.dayId) || log.prescriptionSnapshot) continue;
          const day = before.find((candidate) => candidate.id === log.dayId);
          if (day) writes.push(logs.put({ ...log, prescriptionSnapshot: structuredClone(day) }));
        }
      }
      writes.push(programs.put(next));
      await Promise.all(writes);
      await done;
    } catch (error) {
      try { tx.abort(); } catch { /* The request may already have aborted it. */ }
      await Promise.allSettled(writes);
      await done.catch(() => {});
      throw error;
    }
    return { status: "saved", program: next };
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
    const copyId = crypto.randomUUID();
    const copy: ProgramDocument = {
      ...structuredClone(original),
      id: copyId,
      overrides: structuredClone(original.overrides).map((override) => ({ ...override, programId: copyId })),
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
