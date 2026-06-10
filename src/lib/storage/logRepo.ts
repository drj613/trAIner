import { getDb } from "./appDb";
import { logLocalDate } from "@/lib/workout/localDate";
import type { WorkoutLogDocument } from "@/lib/programs/types";

export const logRepo = {
  async list() {
    return (await getDb()).getAll("logs");
  },

  async get(id: string) {
    return (await getDb()).get("logs", id);
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

  // A session is keyed by the user's LOCAL calendar date. performedAt is a
  // UTC ISO timestamp whose date component can disagree with the local date
  // near midnight, so matching is done via logLocalDate (performedDate when
  // present, else performedAt converted to the local date) — never by raw
  // string prefix.
  async getForDay(programId: string, dayId: string, date: string): Promise<WorkoutLogDocument | undefined> {
    const all = await (await getDb()).getAllFromIndex("logs", "by-day", dayId);
    return all.find((l) => l.programId === programId && logLocalDate(l) === date);
  },
};
