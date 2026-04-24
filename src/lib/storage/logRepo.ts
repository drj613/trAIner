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
  }
};
