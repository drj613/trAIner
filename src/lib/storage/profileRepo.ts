import { getDb } from "./appDb";
import type { ProfileDocument } from "@/lib/programs/types";

const PROFILE_ID = "local-profile";

export const profileRepo = {
  async get() {
    return (await getDb()).get("profile", PROFILE_ID);
  },

  async save(profile: ProfileDocument) {
    await (await getDb()).put("profile", {
      ...profile,
      id: PROFILE_ID,
      updatedAt: new Date().toISOString()
    });
  }
};
