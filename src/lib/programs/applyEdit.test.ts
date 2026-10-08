import "fake-indexeddb/auto";
import { programRepo } from "@/lib/storage/programRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { resetDbConnection, getDb } from "@/lib/storage/appDb";
import { previewProgramEdit } from "./edits";
import { commitProgramEdit } from "./applyEdit";
import type { ProgramDocument } from "./types";

const makeProgram = (): ProgramDocument => ({
  id: "p1", title: "Routine", source: "manual", active: true, createdAt: "now", updatedAt: "now", overrides: [],
  days: [{
    id: "d1", dayNumber: 1, weekNumber: 1, title: "Day 1", sections: [{
      id: "s1", type: "strength", name: "Strength", groups: [{ id: "g1", type: "single", exercises: [{
        id: "e1", name: "Squat", sets: 4, reps: "8", tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
      }] }],
    }],
  }],
});

beforeEach(async () => {
  resetDbConnection();
  const db = await getDb();
  await db.clear("programs");
  await db.clear("logs");
});

describe("commitProgramEdit", () => {
  it("atomically saves the edit and freezes prescriptions for completed sessions", async () => {
    const program = makeProgram();
    await programRepo.save(program);
    await logRepo.save({ id: "l1", programId: program.id, dayId: "d1", performedAt: "now", completedAt: "now", entries: [{ exerciseId: "e1", exerciseName: "Squat", sets: [] }] });
    const persistedProgram = await programRepo.get(program.id);
    const logs = await (await getDb()).getAll("logs");
    const preview = previewProgramEdit(persistedProgram!, { kind: "exercise-fields", dayId: "d1", exerciseId: "e1", fields: { sets: 5 } }, { scope: "occurrence", logs });

    const result = await commitProgramEdit(preview);

    expect(result.status).toBe("saved");
    expect((await programRepo.get("p1"))?.overrides[0].replacement).toMatchObject({
      sections: [{ groups: [{ exercises: [{ sets: 5 }] }] }],
    });
    const savedLog = await (await getDb()).get("logs", "l1");
    expect(savedLog?.prescriptionSnapshot?.sections[0].groups[0].exercises[0].sets).toBe(4);
    expect(savedLog?.entries).toEqual([{ exerciseId: "e1", exerciseName: "Squat", sets: [] }]);
  });

  it("returns the preview as stale when a session finishes after preview", async () => {
    const program = makeProgram();
    await programRepo.save(program);
    const persistedProgram = await programRepo.get(program.id);
    const preview = previewProgramEdit(persistedProgram!, { kind: "exercise-fields", dayId: "d1", exerciseId: "e1", fields: { sets: 5 } }, { scope: "occurrence" });
    await logRepo.save({ id: "l1", programId: program.id, dayId: "d1", performedAt: "now", completedAt: "now", entries: [] });

    const result = await commitProgramEdit(preview);

    expect(result.status).toBe("stale");
    if (result.status === "stale") {
      expect(result.preview).not.toBe(preview);
      expect(result.preview.context.logs).toHaveLength(1);
      expect(result.preview.sourceRevision).toBe(preview.sourceRevision);
    }
    expect((await programRepo.get("p1"))?.days[0].sections[0].groups[0].exercises[0].sets).toBe(4);
  });

  it("keeps a reviewed edit valid when autosave creates an unfinished session", async () => {
    const program = makeProgram();
    await programRepo.save(program);
    const persisted = await programRepo.get(program.id);
    const preview = previewProgramEdit(persisted!, { kind: "exercise-fields", dayId: "d1", exerciseId: "e1", fields: { sets: 5 } }, { scope: "occurrence" });
    await logRepo.save({ id: "active", programId: program.id, dayId: "d1", performedAt: "now", entries: [] });

    expect((await commitProgramEdit(preview)).status).toBe("saved");
    expect((await logRepo.get("active"))?.completedAt).toBeUndefined();
  });

  it("returns the preview as stale when the routine changes after preview", async () => {
    const program = makeProgram();
    await programRepo.save(program);
    const persistedProgram = await programRepo.get(program.id);
    const preview = previewProgramEdit(persistedProgram!, { kind: "exercise-fields", dayId: "d1", exerciseId: "e1", fields: { sets: 5 } }, { scope: "occurrence" });
    await programRepo.save({ ...persistedProgram!, title: "Changed" });

    const result = await commitProgramEdit(preview);

    expect(result.status).toBe("stale");
    if (result.status === "stale") {
      expect(result.preview).not.toBe(preview);
      expect(result.preview.proposedDocument.title).toBe("Changed");
      expect(result.preview.changes).toEqual(preview.changes);
    }
    expect((await programRepo.get("p1"))?.title).toBe("Changed");
  });

  it("rolls back the snapshot and prescription when a transaction write fails", async () => {
    const program = makeProgram();
    await programRepo.save(program);
    await logRepo.save({ id: "l1", programId: program.id, dayId: "d1", performedAt: "now", completedAt: "now", entries: [] });
    const persistedProgram = await programRepo.get(program.id);
    const logs = await (await getDb()).getAll("logs");
    const preview = previewProgramEdit(persistedProgram!, { kind: "exercise-fields", dayId: "d1", exerciseId: "e1", fields: { sets: 5 } }, { scope: "occurrence", logs });
    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = jest.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value: unknown) {
      if (typeof value === "object" && value !== null && "id" in value && value.id === "p1") throw new Error("injected write failure");
      return originalPut.call(this, value) as IDBRequest<IDBValidKey>;
    });

    try {
      await expect(commitProgramEdit(preview)).rejects.toThrow();
    } finally {
      putSpy.mockRestore();
    }

    expect((await programRepo.get("p1"))?.days[0].sections[0].groups[0].exercises[0].sets).toBe(4);
    expect((await (await getDb()).get("logs", "l1"))?.prescriptionSnapshot).toBeUndefined();
  });
});
