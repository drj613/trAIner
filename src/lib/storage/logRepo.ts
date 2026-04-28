import { getDb } from "./appDb";
import type { WorkoutLogDocument } from "@/lib/programs/types";

export const logRepo = {
  async list() {
    return (await getDb()).getAll("logs");
  },

  async listForProgram(programId: string) {
    return (await getDb()).getAllFromIndex("logs", "by-program", programId);
  },

  async listForDay(dayId: string) {
    return (await getDb()).getAllFromIndex("logs", "by-day", dayId);
  },

  async save(log: WorkoutLogDocument) {
    await (await getDb()).put("logs", log);
  },

  // Dates are stored and compared in UTC. Users west of UTC may see today's
  // workout listed under tomorrow's UTC date, but retrieval still works correctly
  // because both the stored performedAt and the query date are UTC.
  async getForDay(programId: string, dayId: string, date: string): Promise<WorkoutLogDocument | undefined> {
    const all = await (await getDb()).getAllFromIndex("logs", "by-day", dayId);
    return all.find(
      (l) => l.programId === programId && l.performedAt.startsWith(date),
    );
  },
};
